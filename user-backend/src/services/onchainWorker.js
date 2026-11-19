import crypto from 'node:crypto';
import { Contract, Transaction, getAddress, id as eventTopic, zeroPadValue } from 'ethers';
import { config } from '../config.js';
import { db } from '../db.js';
import { Decimal } from '../lib/decimal.js';
import { log } from '../lib/log.js';
import { settlePayout } from './cryptoSettle.js';
import {
  ERC20, chains, depositWallet, ensureReady, formatRaw, fromUsd, hotWallet, nativePrice, sweepAddress, toUsd,
} from './onchain.js';
import { notifyWallet } from './walletPush.js';

/**
 * The gateway's background worker. Each cycle, per chain, at a "confirmed"
 * block that is CONFIRMATIONS deep:
 *
 * 1. settle  - every transaction we sent that is now confirmed is applied:
 *              sweeps and gas top-ups adjust the accounted balances, payouts
 *              finish the withdrawal (or refund it when the transfer reverted).
 * 2. deposit - each watched address's balance at the confirmed block is
 *              compared with its accounted balance; the excess is credited to
 *              the player (once worth ONCHAIN_MIN_DEPOSIT_USD).
 * 3. payout  - withdrawals an admin accepted ("queued") are signed and sent
 *              from the hot wallet.
 * 4. sweep   - credited balances worth <CHAIN>_SWEEP_MIN_USD are moved to the
 *              treasury; token sweeps get their gas topped up first.
 *
 * Step 1 runs to completion before step 2, with the same confirmed block, so
 * the accounted balances always match what that block shows except for real
 * deposits. Every transaction is stored (signed) before it is broadcast, and a
 * withdrawal leaves "queued" in the same database transaction, so a crash can
 * only lead to a rebroadcast of the same transaction, never a second payout.
 */

const o = config.onchain;
const PROVIDER = 'onchain';
const TRANSFER = eventTopic('Transfer(address,address,uint256)');
const LOG_RANGE = 5000;
const CHUNK = 25;

const lastFullScan = new Map();
const warned = new Map();

/** Log a warning at most every 15 minutes per key, so a stuck condition does not flood the log. */
function warnThrottled(key, message, err) {
  const now = Date.now();
  if ((warned.get(key) ?? 0) > now - 15 * 60_000) return;
  warned.set(key, now);
  log.warn(message, err);
}

const newOrderId = (prefix) => `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`;
const big = (v) => BigInt(String(v ?? '0'));

async function inChunks(items, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += CHUNK) out.push(...await Promise.all(items.slice(i, i + CHUNK).map(fn)));
  return out;
}

// ------------------------------------------------------------- balances

/** Lock the accounted balance of (chain, address, asset), creating it at 0. */
async function lockBalance(tx, chainKey, address, asset) {
  await tx.query(
    `INSERT IGNORE INTO OnchainBalances (chain, address, asset, accounted, checked_block, updated_at)
     VALUES (:chainKey, :address, :asset, 0, NULL, :now)`,
    { chainKey, address, asset, now: new Date() });
  const [row] = await tx.query(
    'SELECT accounted, checked_block FROM OnchainBalances WHERE chain = :chainKey AND address = :address AND asset = :asset FOR UPDATE',
    { chainKey, address, asset });
  return { accounted: big(row.accounted), checkedBlock: row.checked_block == null ? null : Number(row.checked_block) };
}

async function setBalance(tx, chainKey, address, asset, accounted, checkedBlock) {
  await tx.query(
    `UPDATE OnchainBalances SET accounted = :accounted, checked_block = COALESCE(:checkedBlock, checked_block), updated_at = :now
     WHERE chain = :chainKey AND address = :address AND asset = :asset`,
    { accounted: (accounted < 0n ? 0n : accounted).toString(), checkedBlock, now: new Date(), chainKey, address, asset });
}

async function adjustBalance(tx, chainKey, address, asset, delta) {
  const { accounted } = await lockBalance(tx, chainKey, address, asset);
  if (accounted + delta < 0n) log.warn(`Accounted ${asset} on ${chainKey} for ${address} would go negative; clamped to 0.`);
  await setBalance(tx, chainKey, address, asset, accounted + delta, null);
}

// ----------------------------------------------------------------- sending

/** Gas price fields: EIP-1559 where the chain has a base fee, legacy otherwise (BSC). */
async function feeParams(rt) {
  const block = await rt.provider.getBlock('latest');
  if (block?.baseFeePerGas) {
    const f = await rt.provider.getFeeData();
    return { type: 2, maxFeePerGas: f.maxFeePerGas, maxPriorityFeePerGas: f.maxPriorityFeePerGas, perGas: f.maxFeePerGas };
  }
  const gasPrice = big(await rt.provider.send('eth_gasPrice', []));
  return { type: 0, gasPrice, perGas: gasPrice };
}

const feeFields = (fees) => (fees.type === 2
  ? { type: 2, maxFeePerGas: fees.maxFeePerGas, maxPriorityFeePerGas: fees.maxPriorityFeePerGas }
  : { type: 0, gasPrice: fees.gasPrice });

async function estimateGas(rt, request, fallback) {
  try {
    const gas = await rt.provider.estimateGas(request);
    return (gas * 13n) / 10n; // 30% headroom; unused gas is not charged
  } catch (err) {
    if (fallback == null) throw err;
    return fallback;
  }
}

/**
 * Sign a transaction, store it and then broadcast it. `meta` describes it for
 * OnchainTxs. `inTx(tx, hash)` runs in the same database transaction before the
 * row is stored; returning false abandons the send (nothing is broadcast).
 * Returns the hash, or null when abandoned.
 */
async function send(rt, wallet, request, meta, inTx) {
  const from = wallet.address;
  const chainKey = rt.cfg.key;
  const signed = await db.transaction(async (tx) => {
    const [row] = await tx.query(
      `SELECT MAX(nonce) AS n FROM OnchainTxs
       WHERE chain = :chainKey AND from_address = :from AND status IN ('pending', 'confirmed', 'reverted') FOR UPDATE`,
      { chainKey, from });
    const onChain = await rt.provider.getTransactionCount(from, 'pending');
    const nonce = Math.max(onChain, row?.n == null ? 0 : Number(row.n) + 1);

    const raw = await wallet.signTransaction({ chainId: rt.cfg.chainId, nonce, ...request });
    const hash = Transaction.from(raw).hash;
    if (inTx && (await inTx(tx, hash)) === false) return null;

    const now = new Date();
    await tx.query(
      `INSERT INTO OnchainTxs (chain, kind, from_address, to_address, asset, amount, deposit_address, payment_uid,
                               nonce, tx_hash, raw_tx, status, created_at, updated_at)
       VALUES (:chainKey, :kind, :from, :to, :asset, :amount, :depositAddress, :paymentUid,
               :nonce, :hash, :raw, 'pending', :now, :now)`,
      {
        chainKey, kind: meta.kind, from, to: meta.to, asset: meta.asset, amount: meta.amount.toString(),
        depositAddress: meta.depositAddress ?? null, paymentUid: meta.paymentUid ?? null, nonce, hash, raw, now,
      });
    return { raw, hash };
  });
  if (!signed) return null;

  try {
    await rt.provider.broadcastTransaction(signed.raw);
  } catch (err) {
    // Stored already; the next cycles rebroadcast it or notice it was dropped.
    log.warn(`Broadcasting ${meta.kind} ${signed.hash} on ${chainKey} failed; it will be retried.`, err);
  }
  return signed.hash;
}

// ------------------------------------------------------------------ settle

/**
 * Apply every stored transaction that is confirmed. Returns the rows still
 * waiting to be mined, which the payout budget must leave room for.
 */
async function settle(rt, confirmed) {
  const chainKey = rt.cfg.key;
  const rows = await db.query(
    "SELECT * FROM OnchainTxs WHERE chain = :chainKey AND status = 'pending' ORDER BY uid", { chainKey });
  const unmined = [];

  for (const row of rows) {
    let receipt = await rt.provider.getTransactionReceipt(row.tx_hash);
    if (!receipt) {
      const used = await rt.provider.getTransactionCount(row.from_address, 'latest');
      if (used > Number(row.nonce)) receipt = await rt.provider.getTransactionReceipt(row.tx_hash);
      if (!receipt && used > Number(row.nonce)) {
        // The nonce went to another transaction: something else signed with this key.
        await db.query("UPDATE OnchainTxs SET status = 'dropped', updated_at = :now WHERE uid = :uid", { now: new Date(), uid: row.uid });
        log.error(`${row.kind} ${row.tx_hash} on ${chainKey} was dropped: nonce ${row.nonce} of ${row.from_address} was used by another transaction. Review it manually.`);
        continue;
      }
      if (!receipt) {
        unmined.push(row);
        try { await rt.provider.send('eth_sendRawTransaction', [row.raw_tx]); } catch { /* already known, or retried next cycle */ }
        if (Date.now() - new Date(`${String(row.created_at).replace(' ', 'T')}Z`).getTime() > 30 * 60_000) {
          warnThrottled(`stuck:${row.tx_hash}`, `${row.kind} ${row.tx_hash} on ${chainKey} is still unmined after 30 minutes (nonce ${row.nonce} of ${row.from_address}).`);
        }
        continue;
      }
    }
    if (receipt.blockNumber > confirmed) continue;

    const ok = receipt.status === 1;
    const fee = receipt.fee ?? receipt.gasUsed * receipt.gasPrice;
    const outcome = await db.transaction(async (tx) => {
      const [locked] = await tx.query('SELECT status FROM OnchainTxs WHERE uid = :uid FOR UPDATE', { uid: row.uid });
      if (locked.status !== 'pending') return {};
      await tx.query(
        'UPDATE OnchainTxs SET status = :status, block_number = :block, fee = :fee, updated_at = :now WHERE uid = :uid',
        { status: ok ? 'confirmed' : 'reverted', block: receipt.blockNumber, fee: fee.toString(), now: new Date(), uid: row.uid });
      return applySettled(tx, rt, row, ok, fee);
    });
    if (!ok) log.warn(`${row.kind} ${row.tx_hash} on ${chainKey} reverted.`);
    if (outcome.wallet) await notifyWallet(outcome.wallet.loginId, outcome.wallet.balance, outcome.wallet.point);
  }
  return unmined;
}

async function applySettled(tx, rt, row, ok, fee) {
  const chainKey = rt.cfg.key;
  const native = rt.cfg.native;
  const amount = big(row.amount);

  if (row.kind === 'topup') {
    if (ok) await adjustBalance(tx, chainKey, row.deposit_address, native, amount);
    return {};
  }
  if (row.kind === 'sweep') {
    // Gas comes out of the deposit address's native balance either way.
    await adjustBalance(tx, chainKey, row.deposit_address, native, -fee);
    if (ok) await adjustBalance(tx, chainKey, row.deposit_address, row.asset, -amount);
    return {};
  }
  if (row.kind === 'payout') {
    const [payment] = await tx.query(
      `SELECT uid, order_id, userid, amount, currency, status, transaction_uid
       FROM CryptoPayments WHERE uid = :uid FOR UPDATE`, { uid: row.payment_uid });
    if (!payment) return {};
    const status = ok ? 'paid' : 'fail';
    await tx.query('UPDATE CryptoPayments SET status = :status, updated_at = :now WHERE uid = :uid',
      { status, now: new Date(), uid: payment.uid });
    return settlePayout(tx, payment, status, 'reverted on-chain', `tx ${row.tx_hash}`);
  }
  return {};
}

// ---------------------------------------------------------------- deposits

const assetBalance = (rt, asset, address, blockTag) => (asset.native
  ? rt.provider.getBalance(address, blockTag)
  : new Contract(asset.address, ERC20, rt.provider).balanceOf(address, { blockTag }));

/** Best effort: hashes of the token transfers into `address` up to `toBlock`. */
async function findTransfers(rt, asset, address, fromBlock, toBlock) {
  try {
    const logs = await rt.provider.getLogs({
      address: asset.address,
      topics: [TRANSFER, null, zeroPadValue(address, 32)],
      fromBlock: Math.max(fromBlock, toBlock - LOG_RANGE, 0),
      toBlock,
    });
    return [...new Set(logs.map((l) => l.transactionHash))];
  } catch {
    return [];
  }
}

async function scanDeposits(rt, confirmed, price) {
  const chainKey = rt.cfg.key;
  const now = new Date();
  const full = (lastFullScan.get(chainKey) ?? 0) <= Date.now() - o.fullScanMinutes * 60_000;
  const addresses = await db.query(
    full
      ? 'SELECT userid, address FROM OnchainAddresses WHERE address IS NOT NULL'
      : 'SELECT userid, address FROM OnchainAddresses WHERE address IS NOT NULL AND watch_until > :now',
    { now });
  if (!addresses.length) {
    if (full) lastFullScan.set(chainKey, Date.now());
    return;
  }

  const accountedRows = await db.query('SELECT address, asset, accounted FROM OnchainBalances WHERE chain = :chainKey', { chainKey });
  const accounted = new Map(accountedRows.map((r) => [`${r.address}|${r.asset}`, big(r.accounted)]));
  const topups = new Set((await db.query(
    "SELECT deposit_address FROM OnchainTxs WHERE chain = :chainKey AND kind = 'topup' AND status = 'pending'", { chainKey }))
    .map((r) => r.deposit_address));
  const minUsd = Decimal.from(o.minDepositUsd);

  const checks = addresses.flatMap((a) => rt.assets.map((asset) => ({ ...a, asset })));
  const balances = await inChunks(checks, (c) => assetBalance(rt, c.asset, c.address, confirmed));

  for (const [i, c] of checks.entries()) {
    const known = accounted.get(`${c.address}|${c.asset.symbol}`) ?? 0n;
    const balance = balances[i];
    if (balance <= known) continue;
    if (c.asset.native && topups.has(c.address)) continue;
    const usd = toUsd(c.asset, balance - known, price);
    if (!usd) {
      warnThrottled(`price:${chainKey}`, `No fresh ${rt.cfg.native}/USD price on ${chainKey}; ${rt.cfg.native} deposits wait until there is one.`);
      continue;
    }
    if (usd.lessThan(minUsd)) continue;
    const outcome = await credit(rt, c, known, balance, usd, confirmed);
    if (outcome.wallet) await notifyWallet(outcome.wallet.loginId, outcome.wallet.balance, outcome.wallet.point);
  }
  if (full) lastFullScan.set(chainKey, Date.now());
}

async function credit(rt, { userid, address, asset }, known, balance, usd, confirmed) {
  const chainKey = rt.cfg.key;
  const [prior] = await db.query(
    'SELECT checked_block FROM OnchainBalances WHERE chain = :chainKey AND address = :address AND asset = :symbol',
    { chainKey, address, symbol: asset.symbol });
  const hashes = asset.native ? [] : await findTransfers(rt, asset, address, Number(prior?.checked_block ?? 0) + 1, confirmed);

  return db.transaction(async (tx) => {
    const current = await lockBalance(tx, chainKey, address, asset.symbol);
    if (current.accounted !== known) return {}; // changed meanwhile; next cycle sees it
    await setBalance(tx, chainKey, address, asset.symbol, balance, confirmed);

    const [user] = await tx.query('SELECT Uid, LoginId, Balance, Point FROM Users WHERE LoginId = :userid FOR UPDATE', { userid });
    const coins = formatRaw(balance - known, asset.decimals);
    if (!user) {
      log.warn(`Deposit of ${coins} ${asset.symbol} on ${chainKey} to ${address} belongs to missing user ${userid}; not credited.`);
      return {};
    }

    const now = new Date();
    const before = Decimal.from(user.Balance);
    const after = before.plus(usd);
    await tx.query(
      `UPDATE Users SET Balance = :after, DepositAmount = DepositAmount + :usd, DepositCount = DepositCount + 1, UpdatedAt = :now
       WHERE Uid = :uid`,
      { after: after.toString(), usd: usd.toString(), now, uid: user.Uid });

    const txid = hashes.length ? hashes.join(',') : null;
    const memo = [`Crypto deposit ${coins} ${asset.symbol} (${chainKey})`, ...hashes.map((h) => `tx ${h}`)].join(' / ').slice(0, 512);
    const { insertId } = await tx.query(
      `INSERT INTO Transactions (type, status, userid, managerid, amount, beforeamount, afteramount, memo, target_type, created_at, updated_at)
       VALUES ('deposit', 'finished', :loginId, NULL, :usd, :before, :after, :memo, 'user', :now, :now)`,
      { loginId: user.LoginId, usd: usd.toString(), before: before.toString(), after: after.toString(), memo, now });

    await tx.query(
      `INSERT INTO CryptoPayments (order_id, direction, userid, amount, currency, provider, status, payer_amount, payer_currency,
                                   network, txid, address, transaction_uid, created_at, updated_at)
       VALUES (:orderId, 'deposit', :loginId, :usd, 'USD', :provider, 'paid', :coins, :symbol, :chainKey, :txid, :address, :txUid, :now, :now)`,
      {
        orderId: newOrderId('dep'), loginId: user.LoginId, usd: usd.toString(), provider: PROVIDER, coins,
        symbol: asset.symbol, chainKey, txid, address, txUid: insertId, now,
      });

    log.info(`Crypto deposit of ${coins} ${asset.symbol} on ${chainKey} credited ${usd} to ${user.LoginId}.`);
    return { wallet: { loginId: user.LoginId, balance: after, point: Decimal.from(user.Point) } };
  });
}

// ----------------------------------------------------------------- payouts

/** What the hot wallet can still spend, per asset, after the transactions not yet mined. */
async function hotBudget(rt, unmined) {
  const hot = hotWallet().address;
  const budget = new Map();
  for (const asset of rt.assets) budget.set(asset.symbol, await assetBalance(rt, asset, hot, 'latest'));
  if (!budget.has(rt.cfg.native)) budget.set(rt.cfg.native, await rt.provider.getBalance(hot, 'latest'));
  for (const row of unmined) {
    if (row.from_address !== hot) continue;
    const t = Transaction.from(row.raw_tx);
    const gas = t.gasLimit * (t.maxFeePerGas ?? t.gasPrice);
    budget.set(rt.cfg.native, budget.get(rt.cfg.native) - gas - t.value);
    if (row.asset !== rt.cfg.native && budget.has(row.asset)) budget.set(row.asset, budget.get(row.asset) - big(row.amount));
  }
  return budget;
}

const spend = (budget, symbol, amount) => budget.set(symbol, budget.get(symbol) - amount);

/** A token transfer or native send of `raw` to `to`, as a transaction request. */
const transferRequest = (asset, to, raw) => (asset.native
  ? { to, value: raw, data: '0x' }
  : { to: asset.address, value: 0n, data: ERC20.encodeFunctionData('transfer', [to, raw]) });

async function refundPayout(payment, reason) {
  const outcome = await db.transaction(async (tx) => {
    const [locked] = await tx.query(
      'SELECT uid, order_id, userid, amount, currency, status, transaction_uid FROM CryptoPayments WHERE uid = :uid FOR UPDATE',
      { uid: payment.uid });
    if (locked.status !== 'queued') return {};
    await tx.query("UPDATE CryptoPayments SET status = 'error', updated_at = :now WHERE uid = :uid", { now: new Date(), uid: locked.uid });
    return settlePayout(tx, locked, 'error', reason);
  });
  if (outcome.wallet) await notifyWallet(outcome.wallet.loginId, outcome.wallet.balance, outcome.wallet.point);
}

async function sendPayouts(rt, price, budget) {
  const chainKey = rt.cfg.key;
  const queued = await db.query(
    `SELECT uid, order_id, amount, payer_currency, address FROM CryptoPayments
     WHERE provider = :provider AND direction = 'withdraw' AND status = 'queued' AND network = :chainKey ORDER BY uid`,
    { provider: PROVIDER, chainKey });
  if (!queued.length) return;
  const hot = hotWallet().connect(rt.provider);

  for (const payment of queued) {
    const asset = rt.assets.find((a) => a.symbol === payment.payer_currency);
    if (!asset) {
      await refundPayout(payment, `${payment.payer_currency} on ${chainKey} is no longer supported`);
      continue;
    }
    const raw = fromUsd(asset, Decimal.from(payment.amount), price);
    if (raw == null) {
      warnThrottled(`price:${chainKey}`, `No fresh ${rt.cfg.native}/USD price on ${chainKey}; ${rt.cfg.native} withdrawals wait until there is one.`);
      continue;
    }
    if (raw <= 0n) {
      await refundPayout(payment, 'amount too small');
      continue;
    }
    const to = getAddress(payment.address);
    const request = transferRequest(asset, to, raw);
    const fees = await feeParams(rt);
    const gasLimit = await estimateGas(rt, { ...request, from: hot.address }, asset.native ? 21000n : 120000n);
    const gasCost = gasLimit * fees.perGas;

    const nativeNeeded = gasCost + (asset.native ? raw : 0n);
    if (budget.get(rt.cfg.native) < nativeNeeded || (!asset.native && budget.get(asset.symbol) < raw)) {
      warnThrottled(`funds:${chainKey}:${asset.symbol}`,
        `Hot wallet ${hot.address} on ${chainKey} cannot pay ${formatRaw(raw, asset.decimals)} ${asset.symbol} plus gas; withdrawals wait until it is funded.`);
      continue;
    }

    const hash = await send(rt, hot, { ...request, gasLimit, ...feeFields(fees) },
      { kind: 'payout', to, asset: asset.symbol, amount: raw, paymentUid: payment.uid },
      async (tx, txHash) => {
        const [locked] = await tx.query('SELECT status FROM CryptoPayments WHERE uid = :uid FOR UPDATE', { uid: payment.uid });
        if (locked.status !== 'queued') return false;
        await tx.query(
          "UPDATE CryptoPayments SET status = 'sent', txid = :txHash, payer_amount = :coins, updated_at = :now WHERE uid = :uid",
          { txHash, coins: formatRaw(raw, asset.decimals), now: new Date(), uid: payment.uid });
        return true;
      });
    if (!hash) continue;
    spend(budget, rt.cfg.native, nativeNeeded);
    if (!asset.native) spend(budget, asset.symbol, raw);
    log.info(`Crypto withdrawal ${payment.order_id}: sent ${formatRaw(raw, asset.decimals)} ${asset.symbol} on ${chainKey} to ${to} (${hash}).`);
  }
}

// ------------------------------------------------------------------ sweeps

async function sweep(rt, price, budget) {
  const chainKey = rt.cfg.key;
  const native = rt.cfg.native;
  const minUsd = Decimal.from(rt.cfg.sweepMinUsd);
  const to = sweepAddress();

  const rows = await db.query(
    `SELECT b.address, b.asset, b.accounted, a.uid AS hd_index
     FROM OnchainBalances b JOIN OnchainAddresses a ON a.address = b.address
     WHERE b.chain = :chainKey AND b.accounted > 0`, { chainKey });
  const busy = new Set((await db.query(
    "SELECT DISTINCT deposit_address FROM OnchainTxs WHERE chain = :chainKey AND status = 'pending' AND deposit_address IS NOT NULL",
    { chainKey })).map((r) => r.deposit_address));
  const nativeOf = new Map(rows.filter((r) => r.asset === native).map((r) => [r.address, big(r.accounted)]));

  // Tokens first, so a native balance can still pay for their gas.
  const ordered = [...rows.filter((r) => r.asset !== native), ...rows.filter((r) => r.asset === native)];
  for (const row of ordered) {
    if (busy.has(row.address)) continue;
    const asset = rt.assets.find((a) => a.symbol === row.asset);
    if (!asset) continue;
    const accounted = big(row.accounted);
    const wallet = depositWallet(row.hd_index).connect(rt.provider);
    if (wallet.address !== row.address) {
      log.error(`Deposit address ${row.address} does not match HD index ${row.hd_index}; is ONCHAIN_MNEMONIC the one it was created with?`);
      continue;
    }

    try {
      // One transaction per address per cycle: the next one needs this one settled first.
      const sent = asset.native
        ? await sweepNative(rt, wallet, asset, accounted, price, minUsd, to)
        : await sweepToken(rt, wallet, asset, accounted, nativeOf.get(row.address) ?? 0n, minUsd, to, budget);
      if (sent) busy.add(row.address);
    } catch (err) {
      busy.add(row.address);
      warnThrottled(`sweep:${chainKey}:${row.address}:${row.asset}`, `Sweeping ${row.asset} on ${chainKey} from ${row.address} failed.`, err);
    }
  }
}

/** Sweep a credited token balance, or top up its gas first. True when a transaction was sent. */
async function sweepToken(rt, wallet, asset, amount, nativeAccounted, minUsd, to, budget) {
  if (toUsd(asset, amount, null).lessThan(minUsd)) return false;
  const chainKey = rt.cfg.key;
  const held = await assetBalance(rt, asset, wallet.address, 'latest');
  if (held < amount) {
    warnThrottled(`short:${chainKey}:${wallet.address}:${asset.symbol}`,
      `${wallet.address} on ${chainKey} holds ${formatRaw(held, asset.decimals)} ${asset.symbol}, less than the ${formatRaw(amount, asset.decimals)} accounted; not swept.`);
    return false;
  }

  const request = transferRequest(asset, to, amount);
  const fees = await feeParams(rt);
  const gasLimit = await estimateGas(rt, { ...request, from: wallet.address }, 120000n);
  const cost = gasLimit * fees.perGas;
  const nativeHeld = await rt.provider.getBalance(wallet.address, 'latest');
  const available = nativeAccounted < nativeHeld ? nativeAccounted : nativeHeld;

  if (available < cost) {
    const topup = cost - available;
    const hot = hotWallet().connect(rt.provider);
    const topupCost = 21000n * fees.perGas;
    if (budget.get(rt.cfg.native) < topup + topupCost) {
      warnThrottled(`gas:${chainKey}`, `Hot wallet ${hot.address} on ${chainKey} has too little ${rt.cfg.native} to top up sweep gas.`);
      return false;
    }
    const hash = await send(rt, hot, { to: wallet.address, value: topup, data: '0x', gasLimit: 21000n, ...feeFields(fees) },
      { kind: 'topup', to: wallet.address, asset: rt.cfg.native, amount: topup, depositAddress: wallet.address });
    spend(budget, rt.cfg.native, topup + topupCost);
    log.info(`Gas top-up of ${formatRaw(topup, 18)} ${rt.cfg.native} on ${chainKey} to ${wallet.address} (${hash}).`);
    return true;
  }

  const hash = await send(rt, wallet, { ...request, gasLimit, ...feeFields(fees) },
    { kind: 'sweep', to, asset: asset.symbol, amount, depositAddress: wallet.address });
  log.info(`Swept ${formatRaw(amount, asset.decimals)} ${asset.symbol} on ${chainKey} from ${wallet.address} (${hash}).`);
  return true;
}

/** Sweep a credited native balance, keeping back its own gas. True when a transaction was sent. */
async function sweepNative(rt, wallet, asset, accounted, price, minUsd, to) {
  const chainKey = rt.cfg.key;
  const held = await rt.provider.getBalance(wallet.address, 'latest');
  const available = accounted < held ? accounted : held;
  const fees = await feeParams(rt);
  const gasLimit = await estimateGas(rt, { from: wallet.address, to, value: 1n }, 21000n);
  const value = available - gasLimit * fees.perGas;
  if (value <= 0n) return false;
  const usd = toUsd(asset, value, price);
  if (!usd || usd.lessThan(minUsd)) return false;

  const hash = await send(rt, wallet, { to, value, data: '0x', gasLimit, ...feeFields(fees) },
    { kind: 'sweep', to, asset: asset.symbol, amount: value, depositAddress: wallet.address });
  log.info(`Swept ${formatRaw(value, asset.decimals)} ${asset.symbol} on ${chainKey} from ${wallet.address} (${hash}).`);
  return true;
}

// ------------------------------------------------------------------- cycle

/** One pass over every chain. Exported for tests; the server uses startWorker(). */
export async function runCycle() {
  for (const rt of chains()) {
    const chainKey = rt.cfg.key;
    try {
      await ensureReady(rt);
      const head = await rt.provider.getBlockNumber();
      const confirmed = head - rt.cfg.confirmations + 1;
      if (confirmed < 0) continue;
      let price = null;
      try { price = await nativePrice(rt); } catch (err) { warnThrottled(`feed:${chainKey}`, `Reading the ${chainKey} price feed failed.`, err); }

      // A failed settle must stop the cycle: crediting against unsettled balances could double count.
      const unmined = await settle(rt, confirmed);
      await scanDeposits(rt, confirmed, price);
      const budget = await hotBudget(rt, unmined);
      await sendPayouts(rt, price, budget);
      await sweep(rt, price, budget);
    } catch (err) {
      warnThrottled(`cycle:${chainKey}`, `On-chain worker cycle for ${chainKey} failed; retrying.`, err);
    }
  }
}

/** Run cycles every ONCHAIN_POLL_SECONDS until the returned stop() is called. */
export function startWorker() {
  let timer = null;
  let stopped = false;
  let current = Promise.resolve();
  const tick = () => {
    current = runCycle().finally(() => {
      if (!stopped) timer = setTimeout(tick, o.pollSeconds * 1000);
    });
  };
  tick();
  return async () => {
    stopped = true;
    clearTimeout(timer);
    await current;
  };
}
