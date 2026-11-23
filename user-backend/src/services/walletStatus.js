import { Contract } from 'ethers';
import { config } from '../config.js';
import { db } from '../db.js';
import { Decimal } from '../lib/decimal.js';
import { dbDate } from '../lib/format.js';
import {
  ERC20, chains, ensureReady, explorerAddressUrl, explorerTxUrl, formatRaw, hotWallet, isConfigured, nativePrice,
  sweepAddress, toUsd,
} from './onchain.js';

/**
 * Read-only snapshot of the gateway's own wallets for the admin "Wallet" page:
 * live hot-wallet and treasury balances per chain, what is waiting to be paid,
 * and the latest transactions the gateway signed. Never signs or sends.
 */

const PROVIDER = 'onchain';
const NATIVE_DECIMALS = 18;

const balanceOf = (rt, asset, address) => (asset.native
  ? rt.provider.getBalance(address, 'latest')
  : new Contract(asset.address, ERC20, rt.provider).balanceOf(address, { blockTag: 'latest' }));

/** Balances of `address` on one chain, each as { symbol, amount, usd }. */
async function walletBalances(rt, address, price) {
  // The native coin is always listed (it pays the gas) even without a price feed.
  const assets = rt.assets.some((a) => a.native)
    ? rt.assets
    : [...rt.assets, { symbol: rt.cfg.native, address: null, decimals: NATIVE_DECIMALS, native: true }];
  return Promise.all(assets.map(async (asset) => {
    const raw = await balanceOf(rt, asset, address);
    return {
      symbol: asset.symbol,
      native: asset.native,
      amount: formatRaw(raw, asset.decimals),
      usd: toUsd(asset, raw, asset.native ? price : null),
    };
  }));
}

const wallet = (role, rt, address, balances) => ({
  role, address, explorerUrl: explorerAddressUrl(rt.cfg.key, address), balances,
});

async function chainStatus(rt, hot, treasury, queued) {
  const { key, name, chainId, native, confirmations } = rt.cfg;
  const base = { key, name, chainId, native, confirmations };
  try {
    await ensureReady(rt);
    const price = await nativePrice(rt).catch(() => null);
    const wallets = [wallet('hot', rt, hot, await walletBalances(rt, hot, price))];
    if (treasury !== hot) wallets.push(wallet('treasury', rt, treasury, await walletBalances(rt, treasury, price)));
    const q = queued.get(key);
    return {
      ...base,
      nativeUsdPrice: price ? new Decimal(price.answer, price.decimals).rounded(2) : null,
      wallets,
      queuedPayouts: { count: q?.count ?? 0, usd: q?.usd ?? new Decimal(0n, 2) },
    };
  } catch (err) {
    return { ...base, error: `Could not read ${key} (${err.shortMessage ?? err.message}).` };
  }
}

export async function walletStatus() {
  if (!isConfigured()) return { configured: false };
  const hot = hotWallet().address;
  const treasury = sweepAddress();

  const queuedRows = await db.query(
    `SELECT network, COUNT(*) AS n, SUM(amount) AS total FROM CryptoPayments
     WHERE provider = :provider AND direction = 'withdraw' AND status = 'queued' GROUP BY network`,
    { provider: PROVIDER });
  const queued = new Map(queuedRows.map((r) => [r.network, { count: Number(r.n), usd: Decimal.from(r.total ?? 0) }]));

  const recent = await db.query(
    `SELECT uid, chain, kind, from_address, to_address, asset, amount, tx_hash, status, created_at
     FROM OnchainTxs ORDER BY uid DESC LIMIT 25`);
  const decimalsOf = new Map();
  const chainList = await Promise.all(chains().map((rt) => chainStatus(rt, hot, treasury, queued)));
  for (const rt of chains()) {
    for (const a of rt.assets ?? []) decimalsOf.set(`${rt.cfg.key}:${a.symbol}`, a.decimals);
    decimalsOf.set(`${rt.cfg.key}:${rt.cfg.native}`, NATIVE_DECIMALS);
  }

  return {
    configured: true,
    worker: config.onchain.worker,
    hotAddress: hot,
    treasuryAddress: treasury,
    treasuryIsHot: treasury === hot,
    chains: chainList,
    recentTxs: recent.map((r) => {
      const decimals = decimalsOf.get(`${r.chain}:${r.asset}`);
      return {
        uid: String(r.uid),
        chain: r.chain,
        kind: r.kind,
        from: r.from_address,
        to: r.to_address,
        asset: r.asset,
        amount: decimals == null ? null : formatRaw(BigInt(String(r.amount)), decimals),
        hash: r.tx_hash,
        url: explorerTxUrl(r.chain, r.tx_hash),
        status: r.status,
        createdAt: dbDate(r.created_at),
      };
    }),
  };
}
