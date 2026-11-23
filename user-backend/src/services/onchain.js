import { Contract, HDNodeWallet, Interface, JsonRpcProvider, Mnemonic, Network, Wallet, getAddress, isAddress } from 'ethers';
import { config } from '../config.js';
import { db, isUniqueViolation } from '../db.js';
import { Decimal } from '../lib/decimal.js';

/**
 * Self-hosted crypto gateway for EVM chains (BNB Smart Chain, Ethereum).
 *
 * - Every player gets one deposit address, derived from ONCHAIN_MNEMONIC at
 *   m/44'/60'/0'/0/<n>. The same address works on every configured chain.
 * - Accepted assets per chain: the configured stablecoins (credited 1:1 as USD)
 *   and the native coin (priced by its Chainlink feed when credited or paid).
 * - The worker (onchainWorker.js) credits deposits, sweeps them to the treasury
 *   and sends withdrawals from the hot wallet (ONCHAIN_HOT_WALLET_KEY).
 *
 * Raw on-chain amounts are BigInts in the asset's smallest unit; USD amounts are
 * Decimals with two places.
 */

const o = config.onchain;

export const ERC20 = new Interface([
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
]);

const FEED = new Interface([
  'function decimals() view returns (uint8)',
  'function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
]);

const NATIVE_DECIMALS = 18;
const HD_PATH = "m/44'/60'/0'/0";

export const isConfigured = () => Boolean(o.mnemonic && o.hotWalletKey && o.chains.length);

/**
 * Check the secrets and addresses in the configuration; throws on the first
 * problem so a typo stops startup instead of losing funds. Returns the hot
 * wallet and sweep addresses, or null when the gateway is not configured.
 */
export function validateConfig() {
  if (!isConfigured()) return null;
  if (!Mnemonic.isValidMnemonic(o.mnemonic)) throw new Error('ONCHAIN_MNEMONIC is not a valid BIP-39 phrase.');
  let hot;
  try { hot = hotWallet(); } catch { throw new Error('ONCHAIN_HOT_WALLET_KEY is not a valid private key.'); }
  if (o.sweepTo && !isAddress(o.sweepTo)) throw new Error('ONCHAIN_SWEEP_TO is not a valid address.');
  if (depositWallet(0).address === hot.address) throw new Error('The hot wallet must not be one of the deposit addresses.');
  for (const c of o.chains) {
    for (const t of c.tokens) {
      if (!isAddress(t.address)) throw new Error(`${c.key}_TOKENS: ${t.symbol} has an invalid contract address.`);
      if (t.symbol === c.native) throw new Error(`${c.key}_TOKENS: ${t.symbol} clashes with the native coin.`);
    }
    if (c.priceFeed && !isAddress(c.priceFeed)) throw new Error(`${c.key}_PRICE_FEED is not a valid address.`);
    if (!Decimal.tryParse(c.sweepMinUsd)) throw new Error(`${c.key}_SWEEP_MIN_USD is not a number.`);
  }
  if (!Decimal.tryParse(o.minDepositUsd)) throw new Error('ONCHAIN_MIN_DEPOSIT_USD is not a number.');
  return { hotAddress: hot.address, sweepTo: sweepAddress() };
}

// ---------------------------------------------------------------- wallets

let hdRoot = null;
let hot = null;
const children = new Map();

/** The signer for deposit address number `index`. */
export function depositWallet(index) {
  const i = Number(index);
  let w = children.get(i);
  if (!w) {
    hdRoot ??= HDNodeWallet.fromPhrase(o.mnemonic, undefined, HD_PATH);
    w = hdRoot.deriveChild(i);
    children.set(i, w);
  }
  return w;
}

export const hotWallet = () => (hot ??= new Wallet(o.hotWalletKey));
export const sweepAddress = () => getAddress(o.sweepTo || hotWallet().address);

/**
 * The player's deposit address, created on first use. Opening the deposit page
 * also puts the address on the fast watch list for ONCHAIN_WATCH_HOURS.
 */
export async function depositAddressFor(loginId) {
  const now = new Date();
  const watchUntil = new Date(now.getTime() + o.watchHours * 3600_000);
  const [row] = await db.query('SELECT uid, address FROM OnchainAddresses WHERE userid = :loginId', { loginId });
  if (row?.address) {
    await db.query('UPDATE OnchainAddresses SET watch_until = :watchUntil WHERE uid = :uid', { watchUntil, uid: row.uid });
    return row.address;
  }
  if (!row) {
    try {
      await db.query(
        'INSERT INTO OnchainAddresses (userid, address, watch_until, created_at) VALUES (:loginId, NULL, :watchUntil, :now)',
        { loginId, watchUntil, now });
    } catch (err) {
      if (!isUniqueViolation(err)) throw err; // a parallel request created it
    }
  }
  const [created] = await db.query('SELECT uid, address FROM OnchainAddresses WHERE userid = :loginId', { loginId });
  if (created.address) return created.address;
  const { address } = depositWallet(created.uid);
  await db.query('UPDATE OnchainAddresses SET address = :address WHERE uid = :uid AND address IS NULL', { address, uid: created.uid });
  return address;
}

/** True for addresses of the gateway itself, which players must not withdraw to. */
export async function isOwnAddress(address) {
  const a = getAddress(address);
  if (a === hotWallet().address || a === sweepAddress()) return true;
  const [row] = await db.query('SELECT 1 FROM OnchainAddresses WHERE address = :a LIMIT 1', { a });
  return Boolean(row);
}

// ----------------------------------------------------------------- chains

const runtimes = new Map();

/**
 * The live state of one configured chain: { cfg, provider, assets, ready }.
 * `assets` lists { symbol, address (null for native), decimals, native }.
 * Token decimals are read from the contracts by ensureReady().
 */
export function chain(key) {
  let rt = runtimes.get(key);
  if (!rt) {
    const cfg = o.chains.find((c) => c.key === key);
    if (!cfg) return null;
    const network = Network.from(cfg.chainId);
    rt = {
      cfg,
      provider: new JsonRpcProvider(cfg.rpcUrl, network, { staticNetwork: network, batchMaxCount: 20 }),
      assets: null,
      ready: null,
    };
    runtimes.set(key, rt);
  }
  return rt;
}

export const chains = () => o.chains.map((c) => chain(c.key));

/** Connect to the chain once: check the chain id and load token decimals. */
export function ensureReady(rt) {
  rt.ready ??= (async () => {
    const id = Number(await rt.provider.send('eth_chainId', []));
    if (id !== rt.cfg.chainId) throw new Error(`${rt.cfg.key}_RPC_URL serves chain ${id}, expected ${rt.cfg.chainId}.`);
    const assets = [];
    for (const t of rt.cfg.tokens) {
      const decimals = Number(await new Contract(t.address, ERC20, rt.provider).decimals());
      assets.push({ symbol: t.symbol, address: getAddress(t.address), decimals, native: false });
    }
    if (rt.cfg.priceFeed) assets.push({ symbol: rt.cfg.native, address: null, decimals: NATIVE_DECIMALS, native: true });
    rt.assets = assets;
  })().catch((err) => {
    rt.ready = null; // try again next time
    throw err;
  });
  return rt.ready;
}

/**
 * The native coin's USD price from Chainlink: { answer, decimals }, or null when
 * the chain has no feed or its answer is stale or not positive.
 */
export async function nativePrice(rt) {
  if (!rt.cfg.priceFeed) return null;
  const feed = new Contract(rt.cfg.priceFeed, FEED, rt.provider);
  rt.feedDecimals ??= Number(await feed.decimals());
  const [, answer, , updatedAt] = await feed.latestRoundData();
  const age = Date.now() / 1000 - Number(updatedAt);
  if (answer <= 0n || age > o.priceMaxAgeSeconds) return null;
  return { answer, decimals: rt.feedDecimals };
}

// -------------------------------------------------------------- conversion

/** USD value of a raw amount, rounded down to the cent. Null without a price for a native coin. */
export function toUsd(asset, raw, price) {
  let cents;
  if (!asset.native) cents = (raw * 100n) / 10n ** BigInt(asset.decimals);
  else if (!price) return null;
  else cents = (raw * price.answer * 100n) / (10n ** BigInt(asset.decimals) * 10n ** BigInt(price.decimals));
  return new Decimal(cents, 2);
}

/** Raw amount worth `usd` (a Decimal), rounded down. Null without a price for a native coin. */
export function fromUsd(asset, usd, price) {
  const cents = usd.rounded(2).unscaled;
  if (!asset.native) return (cents * 10n ** BigInt(asset.decimals)) / 100n;
  if (!price) return null;
  return (cents * 10n ** BigInt(asset.decimals) * 10n ** BigInt(price.decimals)) / (price.answer * 100n);
}

/** Human amount of a raw value ("12.5"), without trailing zeros. */
export function formatRaw(raw, decimals) {
  const d = new Decimal(raw, decimals).toString();
  return d.includes('.') ? d.replace(/\.?0+$/, '') : d;
}

// --------------------------------------------------------------- explorers

// Block-explorer base per chain id, so a link is correct on testnet and
// mainnet alike. Unknown chains have no explorer (link omitted).
const EXPLORERS = {
  1: 'https://etherscan.io',
  11155111: 'https://sepolia.etherscan.io',
  56: 'https://bscscan.com',
  97: 'https://testnet.bscscan.com',
};

const TX_HASH = /^0x[0-9a-fA-F]{64}$/;

/** The explorer URL for a transaction hash on a network key, or null. */
export function explorerTxUrl(networkKey, hash) {
  if (!TX_HASH.test(hash ?? '')) return null;
  const c = o.chains.find((x) => x.key === networkKey);
  const base = c && EXPLORERS[c.chainId];
  return base ? `${base}/tx/${hash}` : null;
}

/** The explorer URL for an address on a network key, or null. */
export function explorerAddressUrl(networkKey, address) {
  const c = o.chains.find((x) => x.key === networkKey);
  const base = c && EXPLORERS[c.chainId];
  return base && isAddress(address ?? '') ? `${base}/address/${getAddress(address)}` : null;
}

/** Pull { network, hashes } out of a crypto Transaction memo, when it has them. */
export function txRefsFromMemo(memo) {
  if (!memo) return null;
  const network = o.chains.map((c) => c.key).find((k) => memo.includes(`(${k})`) || memo.includes(`/${k} `));
  const hashes = memo.match(/0x[0-9a-fA-F]{64}/g);
  if (!network || !hashes) return null;
  return hashes
    .map((hash) => ({ hash, url: explorerTxUrl(network, hash) }))
    .filter((r) => r.url);
}

// ----------------------------------------------------------------- options

/** Coins and networks players can withdraw to, as { currency, network }. */
export function payoutOptions() {
  return o.chains.flatMap((c) => [
    ...c.tokens.map((t) => ({ currency: t.symbol, network: c.key })),
    ...(c.priceFeed ? [{ currency: c.native, network: c.key }] : []),
  ]);
}

/** What the deposit page lists: every network with its accepted assets. */
export function depositNetworks() {
  return o.chains.map((c) => ({
    network: c.key,
    name: c.name,
    confirmations: c.confirmations,
    assets: [...c.tokens.map((t) => t.symbol), ...(c.priceFeed ? [c.native] : [])],
  }));
}
