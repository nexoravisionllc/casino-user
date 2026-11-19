import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import ganache from 'ganache';
import { ContractFactory, HDNodeWallet, JsonRpcProvider, Wallet, parseEther, parseUnits } from 'ethers';

/**
 * End-to-end test of the self-hosted gateway against two local chains:
 * "BSC" (chain 56, legacy gas prices like BNB Smart Chain) and "ETH"
 * (chain 1, EIP-1559 fees), each with a test USDT and a test price feed.
 *
 * The steps share one chain state, so they run in order inside one test.
 */

const MNEMONIC = 'test test test test test test test test test test test junk';
const HOT_KEY = Wallet.createRandom().privateKey;
const FUNDER_KEY = Wallet.createRandom().privateKey;
const TREASURY = Wallet.createRandom().address;
const PLAYER_WALLET = Wallet.createRandom().address;
const { TestToken, TestFeed } = JSON.parse(readFileSync(new URL('./fixtures/onchain-contracts.json', import.meta.url)));

const ganacheOptions = (chainId, hardfork) => ({
  logging: { quiet: true },
  chain: { chainId, hardfork },
  wallet: { accounts: [{ secretKey: HOT_KEY, balance: parseEther('100') }, { secretKey: FUNDER_KEY, balance: parseEther('1000') }] },
});

async function startChain(chainId, hardfork, tokenDecimals, nativeUsd) {
  const server = ganache.server(ganacheOptions(chainId, hardfork));
  await server.listen(0, '127.0.0.1');
  const url = `http://127.0.0.1:${server.address().port}`;
  const provider = new JsonRpcProvider(url, chainId, { staticNetwork: true, cacheTimeout: -1 });
  const funder = new Wallet(FUNDER_KEY, provider);
  const usdt = await (await new ContractFactory(TestToken.abi, TestToken.bytecode, funder).deploy('USDT', tokenDecimals)).waitForDeployment();
  const feed = await (await new ContractFactory(TestFeed.abi, TestFeed.bytecode, funder).deploy()).waitForDeployment();
  await (await feed.set(parseUnits(String(nativeUsd), 8), Math.floor(Date.now() / 1000))).wait();
  return { server, url, provider, funder, usdt, feed, decimals: tokenDecimals };
}

const bsc = await startChain(56, 'berlin', 18, 600);
const eth = await startChain(1, 'london', 6, 2000);

Object.assign(process.env, {
  ONCHAIN_TEST: '1',
  ONCHAIN_MNEMONIC: MNEMONIC,
  ONCHAIN_HOT_WALLET_KEY: HOT_KEY,
  ONCHAIN_SWEEP_TO: TREASURY,
  ONCHAIN_WORKER: 'false',
  ONCHAIN_MIN_DEPOSIT_USD: '5',
  ONCHAIN_WATCH_HOURS: '72',
  BSC_RPC_URL: bsc.url,
  BSC_CHAIN_ID: '56',
  BSC_CONFIRMATIONS: '3',
  BSC_TOKENS: `USDT:${await bsc.usdt.getAddress()}`,
  BSC_PRICE_FEED: await bsc.feed.getAddress(),
  BSC_SWEEP_MIN_USD: '10',
  ETH_RPC_URL: eth.url,
  ETH_CHAIN_ID: '1',
  ETH_CONFIRMATIONS: '2',
  ETH_TOKENS: `USDT:${await eth.usdt.getAddress()}`,
  ETH_PRICE_FEED: await eth.feed.getAddress(),
  ETH_SWEEP_MIN_USD: '5',
});

const { NOTIFY_SECRET, balanceOf, db, get, loginAs, post, resetData, shutdown } = await import('./helpers.js');
const { runCycle } = await import('../src/services/onchainWorker.js');
const { validateConfig } = await import('../src/services/onchain.js');

before(resetData);
after(async () => {
  await shutdown();
  await bsc.server.close();
  await eth.server.close();
});

const mine = async (chain, n) => { for (let i = 0; i < n; i += 1) await chain.provider.send('evm_mine', []); };
const tokenBalance = async (chain, address) => chain.usdt.balanceOf(address);
const deposits = async () => db.query("SELECT * FROM CryptoPayments WHERE direction = 'deposit' ORDER BY uid");
const accounted = async (chainKey, address, asset) =>
  BigInt((await db.query('SELECT accounted FROM OnchainBalances WHERE chain = :chainKey AND address = :address AND asset = :asset',
    { chainKey, address, asset }))[0]?.accounted ?? '0');
const txsOf = async (kind) => db.query('SELECT * FROM OnchainTxs WHERE kind = :kind ORDER BY uid', { kind });

/** Run worker cycles, mining between them, until nothing is pending (or give up). */
async function settleAll(rounds = 8) {
  for (let i = 0; i < rounds; i += 1) {
    await runCycle();
    await mine(bsc, 3);
    await mine(eth, 2);
  }
  await runCycle();
}

// What the admin backend's accept does for a crypto withdrawal.
async function acceptAsAdmin(uid) {
  const [t] = await db.query('SELECT userid, amount FROM Transactions WHERE uid = :uid', { uid });
  await db.query(
    `UPDATE Users SET Balance = Balance - :amount, WithdrawAmount = WithdrawAmount + :amount, WithdrawCount = WithdrawCount + 1
     WHERE LoginId = :loginId`, { amount: t.amount, loginId: t.userid });
  await db.query("UPDATE Transactions SET status = 'processing' WHERE uid = :uid", { uid });
}

test('self-hosted BSC / ETH gateway, end to end', async (t) => {
  const token = await loginAs('user');
  let address;

  await t.test('the configuration validates and names the hot wallet and treasury', () => {
    const v = validateConfig();
    assert.equal(v.hotAddress, new Wallet(HOT_KEY).address);
    assert.equal(v.sweepTo, TREASURY);
  });

  await t.test('a player gets one permanent HD deposit address', async () => {
    const res = await get('/api/payments/onchain/deposit-address', { token });
    assert.equal(res.status, 200);
    assert.equal(res.json.available, true);
    address = res.json.address;
    assert.equal(address, HDNodeWallet.fromPhrase(MNEMONIC, undefined, "m/44'/60'/0'/0").deriveChild(1).address);
    assert.deepEqual(res.json.networks.map((n) => [n.network, n.assets]), [['BSC', ['USDT', 'BNB']], ['ETH', ['USDT', 'ETH']]]);
    assert.equal((await get('/api/payments/onchain/deposit-address', { token })).json.address, address);
  });

  await t.test('a token deposit is credited once, only after the confirmations', async () => {
    await (await bsc.usdt.mint(address, parseUnits('50', 18))).wait();
    await runCycle();
    assert.equal(await balanceOf('user'), '1000.00', 'not yet 3 blocks deep');
    await mine(bsc, 2);
    await runCycle();
    await runCycle();
    assert.equal(await balanceOf('user'), '1050.00');
    const [d] = await deposits();
    assert.equal(d.provider, 'onchain');
    assert.equal(d.amount, '50.00');
    assert.equal(`${d.payer_amount} ${d.payer_currency} ${d.network}`, '50 USDT BSC');
    assert.match(d.txid, /^0x[0-9a-f]{64}$/);
    const [tr] = await db.query('SELECT * FROM Transactions WHERE uid = :uid', { uid: d.transaction_uid });
    assert.equal(`${tr.type} ${tr.status} ${tr.amount}`, 'deposit finished 50.00');
  });

  await t.test('amounts under the minimum wait until the total reaches it', async () => {
    await (await eth.usdt.mint(address, parseUnits('3', 6))).wait();
    await mine(eth, 2);
    await runCycle();
    assert.equal(await balanceOf('user'), '1050.00');
    await (await eth.usdt.mint(address, parseUnits('4.5', 6))).wait();
    await mine(eth, 2);
    await runCycle();
    assert.equal(await balanceOf('user'), '1057.50', 'the 3 + 4.5 USDT on ETH, same address');
    const txids = (await deposits()).at(-1).txid.split(',');
    assert.equal(txids.length, 2, 'both transfers are recorded');
    for (const h of txids) assert.match(h, /^0x[0-9a-f]{64}$/);
  });

  await t.test('a native deposit is priced by the feed', async () => {
    await (await bsc.funder.sendTransaction({ to: address, value: parseEther('0.1') })).wait();
    await mine(bsc, 3);
    await runCycle();
    assert.equal(await balanceOf('user'), '1117.50', '0.1 BNB at $600');
    const last = (await deposits()).at(-1);
    assert.equal(`${last.amount} ${last.payer_amount} ${last.payer_currency}`, '60.00 0.1 BNB');
  });

  await t.test('credited balances are swept to the treasury without crediting anything twice', async () => {
    await settleAll();
    assert.equal(await tokenBalance(bsc, address), 0n);
    assert.equal(await tokenBalance(bsc, TREASURY), parseUnits('50', 18));
    assert.equal(await tokenBalance(eth, address), 0n);
    assert.equal(await tokenBalance(eth, TREASURY), parseUnits('7.5', 6));
    assert.ok(await bsc.provider.getBalance(TREASURY) > parseEther('0.09'), 'the BNB, minus its gas');

    // Neither address held native coin when its USDT was credited, so each
    // USDT sweep needed a gas top-up first.
    const topups = await txsOf('topup');
    assert.deepEqual(topups.map((r) => `${r.chain} ${r.status}`).sort(), ['BSC confirmed', 'ETH confirmed']);
    assert.ok((await txsOf('sweep')).every((r) => r.status === 'confirmed'));

    // Accounted balances follow the chain: tokens are gone, native is only gas dust.
    assert.equal(await accounted('BSC', address, 'USDT'), 0n);
    assert.equal(await accounted('ETH', address, 'USDT'), 0n);
    assert.equal(await accounted('ETH', address, 'ETH'), await eth.provider.getBalance(address));
    assert.equal(await accounted('BSC', address, 'BNB'), await bsc.provider.getBalance(address));
    assert.equal(await balanceOf('user'), '1117.50', 'no top-up or leftover was credited');
    assert.equal((await deposits()).length, 3);
  });

  await t.test('players see their credited deposits', async () => {
    const res = await get('/api/payments/onchain/deposits', { token });
    assert.deepEqual(res.json.map((d) => `${d.coinAmount} ${d.coin} ${d.network} $${d.amount}`),
      ['0.1 BNB BSC $60', '7.5 USDT ETH $7.5', '50 USDT BSC $50']);
  });

  await t.test('withdrawals must go to a valid outside address', async () => {
    const ask = (fields) => post('/api/payments/crypto/withdraw', { amount: 20, currency: 'USDT', network: 'BSC', address: PLAYER_WALLET, ...fields }, { token });
    const options = await get('/api/payments/crypto/withdraw/options', { token });
    assert.deepEqual(options.json.options.map((o) => `${o.currency}:${o.network}`), ['USDT:BSC', 'BNB:BSC', 'USDT:ETH', 'ETH:ETH']);
    assert.equal((await ask({ address })).json.success, false, 'own deposit address');
    assert.equal((await ask({ address: TREASURY })).json.success, false, 'treasury');
    // Flip the case of one letter: still hex, but the checksum no longer matches.
    const i = PLAYER_WALLET.slice(2).search(/[a-fA-F]/) + 2;
    const c = PLAYER_WALLET[i];
    const typo = PLAYER_WALLET.slice(0, i) + (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase()) + PLAYER_WALLET.slice(i + 1);
    assert.equal((await ask({ address: typo })).json.success, false, 'bad checksum');
    assert.equal((await ask({ currency: 'USDC' })).json.success, false, 'unsupported coin');
  });

  await t.test('an accepted USDT withdrawal is paid from the hot wallet', async () => {
    await (await bsc.usdt.mint(new Wallet(HOT_KEY).address, parseUnits('1000', 18))).wait();
    const res = await post('/api/payments/crypto/withdraw', { amount: 20, currency: 'USDT', network: 'BSC', address: PLAYER_WALLET.toLowerCase() }, { token });
    assert.equal(res.json.success, true);
    const uid = Number(res.json.uid);

    const early = await post('/api/payments/internal/crypto/payout', { transactionUid: uid }, { headers: { 'X-Notify-Secret': NOTIFY_SECRET } });
    assert.equal(early.json.success, false, 'not accepted yet');
    await acceptAsAdmin(uid);
    const queued = await post('/api/payments/internal/crypto/payout', { transactionUid: uid }, { headers: { 'X-Notify-Secret': NOTIFY_SECRET } });
    assert.equal(queued.json.status, 'queued');
    const again = await post('/api/payments/internal/crypto/payout', { transactionUid: uid }, { headers: { 'X-Notify-Secret': NOTIFY_SECRET } });
    assert.equal(again.json.message, 'Payout already queued.');

    await runCycle();
    await runCycle();
    assert.equal((await txsOf('payout')).length, 1, 'signed once');
    await settleAll(2);

    assert.equal(await tokenBalance(bsc, PLAYER_WALLET), parseUnits('20', 18));
    const [payment] = await db.query('SELECT * FROM CryptoPayments WHERE transaction_uid = :uid', { uid });
    assert.equal(`${payment.status} ${payment.payer_amount} ${payment.address}`, `paid 20 ${PLAYER_WALLET}`);
    const [request] = await db.query('SELECT * FROM Transactions WHERE uid = :uid', { uid });
    assert.equal(request.status, 'finished');
    assert.ok(request.memo.includes(payment.txid));
    assert.equal(await balanceOf('user'), '1097.50');
  });

  await t.test('a native withdrawal is converted at the feed price', async () => {
    const res = await post('/api/payments/crypto/withdraw', { amount: 35, currency: 'ETH', network: 'ETH', address: PLAYER_WALLET }, { token });
    const uid = Number(res.json.uid);
    await acceptAsAdmin(uid);
    await post('/api/payments/internal/crypto/payout', { transactionUid: uid }, { headers: { 'X-Notify-Secret': NOTIFY_SECRET } });
    await settleAll(3);
    assert.equal(await eth.provider.getBalance(PLAYER_WALLET), parseEther('0.0175'), '$35 at $2000');
    const [request] = await db.query('SELECT status FROM Transactions WHERE uid = :uid', { uid });
    assert.equal(request.status, 'finished');
  });

  await t.test('a withdrawal the hot wallet cannot cover waits, then goes out once funded', async () => {
    const res = await post('/api/payments/crypto/withdraw', { amount: 900, currency: 'USDT', network: 'ETH', address: PLAYER_WALLET }, { token });
    const uid = Number(res.json.uid);
    await acceptAsAdmin(uid);
    await post('/api/payments/internal/crypto/payout', { transactionUid: uid }, { headers: { 'X-Notify-Secret': NOTIFY_SECRET } });
    await settleAll(2);
    let [payment] = await db.query('SELECT status FROM CryptoPayments WHERE transaction_uid = :uid', { uid });
    assert.equal(payment.status, 'queued', 'the hot wallet holds no ETH USDT');

    await (await eth.usdt.mint(new Wallet(HOT_KEY).address, parseUnits('900', 6))).wait();
    await settleAll(3);
    [payment] = await db.query('SELECT status FROM CryptoPayments WHERE transaction_uid = :uid', { uid });
    assert.equal(payment.status, 'paid');
    assert.equal(await tokenBalance(eth, PLAYER_WALLET), parseUnits('900', 6));
  });

  await t.test('a stale price feed holds native deposits back instead of guessing', async () => {
    await (await eth.feed.set(parseUnits('2000', 8), Math.floor(Date.now() / 1000) - 4 * 3600)).wait();
    const before = await balanceOf('user');
    await (await eth.funder.sendTransaction({ to: address, value: parseEther('0.01') })).wait();
    await mine(eth, 2);
    await runCycle();
    assert.equal(await balanceOf('user'), before);
    await (await eth.feed.set(parseUnits('2000', 8), Math.floor(Date.now() / 1000))).wait();
    await mine(eth, 2);
    await runCycle();
    assert.equal(Number(await balanceOf('user')), Number(before) + 20, '0.01 ETH at $2000');
  });
});
