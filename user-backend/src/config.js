import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Load user-backend/.env when present. Variables already set in the real
// environment take precedence over the file.
try {
  process.loadEnvFile(path.join(root, '.env'));
} catch {
  // No .env file; rely on the environment and the defaults below.
}

const env = process.env;

const int = (v, fallback) => {
  const n = Number.parseInt(v ?? '', 10);
  return Number.isFinite(n) ? n : fallback;
};

const list = (v, fallback) =>
  v ? v.split(',').map((s) => s.trim()).filter(Boolean) : fallback;

// Express "trust proxy": true/false, a hop count, or a subnet list.
const trustProxy = (v) => {
  if (v == null || v === '' || v === 'false') return false;
  if (v === 'true') return true;
  return /^\d+$/.test(v) ? Number(v) : v;
};

// One EVM chain of the self-hosted gateway, read from <PREFIX>_* variables. A
// chain is enabled when its RPC URL is set.
const evmChain = (prefix, defaults) => ({
  key: prefix,
  name: defaults.name,
  native: defaults.native,
  rpcUrl: env[`${prefix}_RPC_URL`] || '',
  chainId: int(env[`${prefix}_CHAIN_ID`], defaults.chainId),
  // Blocks a transfer must be buried under before it counts.
  confirmations: int(env[`${prefix}_CONFIRMATIONS`], defaults.confirmations),
  // SYMBOL:contract pairs of the stablecoins accepted 1:1 as USD.
  tokens: list(env[`${prefix}_TOKENS`], defaults.tokens)
    .map((pair) => {
      const [symbol, address] = pair.split(':').map((s) => s.trim());
      return { symbol: (symbol || '').toUpperCase(), address: address || '' };
    })
    .filter((t) => t.symbol && t.address),
  // Chainlink <native>/USD feed. Empty disables the native coin.
  priceFeed: env[`${prefix}_PRICE_FEED`] ?? defaults.priceFeed,
  // Deposit balances are swept to the treasury once worth at least this much.
  sweepMinUsd: env[`${prefix}_SWEEP_MIN_USD`] || defaults.sweepMinUsd,
});

export const config = {
  // Demo/showcase mode (DEV_MODE=true). See the DEV_MODE note in .env.example.
  devMode: env.DEV_MODE === 'true',
  // Starting balance (USD) every new sign-up gets while DEV_MODE is on.
  devSignupCredit: env.DEV_SIGNUP_CREDIT || '200',

  root,
  host: env.HOST || 'localhost',
  port: int(env.PORT, 5090),
  trustProxy: trustProxy(env.TRUST_PROXY),

  // Shared "Solution" MySQL database. DATABASE_URL (mysql://user:pass@host:port/db)
  // takes precedence over the individual DB_* settings.
  db: {
    url: env.DATABASE_URL || null,
    host: env.DB_HOST || 'localhost',
    port: int(env.DB_PORT, 3306),
    user: env.DB_USER || 'root',
    password: env.DB_PASSWORD ?? '',
    database: env.DB_NAME || 'Solution',
    connectionLimit: int(env.DB_CONNECTION_LIMIT, 10),
  },

  jwt: {
    key: env.JWT_KEY || 'dev-only-super-secret-key-change-me-please-1234567890',
    issuer: env.JWT_ISSUER || 'UserBackend',
    audience: env.JWT_AUDIENCE || 'UserFrontend',
    expiresHours: int(env.JWT_EXPIRES_HOURS, 12),
  },

  corsOrigins: list(env.CORS_ORIGINS, ['http://localhost:5173', 'http://127.0.0.1:5173']),

  // Server-to-server hook on the admin backend, which hosts the wallet hub.
  adminBackend: {
    baseUrl: (env.ADMIN_BACKEND_URL || 'http://localhost:5100').replace(/\/+$/, ''),
    notifySecret: env.NOTIFY_SECRET ?? '',
  },

  fortuneGate: {
    baseUrl: env.FORTUNEGATE_BASE_URL || 'https://agentapi.fortunegate.net',
    token: env.FORTUNEGATE_TOKEN || '',
    lang: int(env.FORTUNEGATE_LANG, 1),
    gameUrlPath: env.FORTUNEGATE_GAME_URL_PATH || '/v4/game/game-url',
    userCreatePath: env.FORTUNEGATE_USER_CREATE_PATH || '/v4/user/create',
    returnUrl: env.FORTUNEGATE_RETURN_URL || 'http://localhost:5173/slot',
    defaultWinRatio: env.FORTUNEGATE_DEFAULT_WIN_RATIO || '0',
    callbackToken: env.FORTUNEGATE_CALLBACK_TOKEN ?? '',
  },

  // Web Push (browser notifications to players). Push is off while the keys
  // are blank; in-site notifications still work.
  webPush: {
    publicKey: (env.VAPID_PUBLIC_KEY || '').trim(),
    privateKey: (env.VAPID_PRIVATE_KEY || '').trim(),
    subject: (env.VAPID_SUBJECT || '').trim() || 'mailto:admin@example.com',
  },

  // Self-hosted BSC / Ethereum gateway (services/onchain) for crypto deposits
  // and withdrawals. Crypto is unavailable until it is configured.
  onchain: {
    // BIP-39 phrase. Player deposit addresses are m/44'/60'/0'/0/<n>.
    mnemonic: (env.ONCHAIN_MNEMONIC || '').trim(),
    // Private key of the hot wallet that pays withdrawals and sweep gas.
    hotWalletKey: (env.ONCHAIN_HOT_WALLET_KEY || '').trim(),
    // Where deposits are swept to; defaults to the hot wallet.
    sweepTo: (env.ONCHAIN_SWEEP_TO || '').trim(),
    // Run the deposit / sweep / payout worker in this process.
    worker: env.ONCHAIN_WORKER !== 'false',
    pollSeconds: int(env.ONCHAIN_POLL_SECONDS, 20),
    // Addresses are checked every poll for this long after the player last opened
    // the deposit page, and by the full scan otherwise.
    watchHours: int(env.ONCHAIN_WATCH_HOURS, 72),
    fullScanMinutes: int(env.ONCHAIN_FULL_SCAN_MINUTES, 60),
    // Smaller deposits wait (uncredited) until the address holds at least this.
    minDepositUsd: env.ONCHAIN_MIN_DEPOSIT_USD || '5',
    // A native coin is not priced from a Chainlink answer older than this.
    priceMaxAgeSeconds: int(env.ONCHAIN_PRICE_MAX_AGE_SECONDS, 3 * 3600),
    chains: [
      evmChain('BSC', {
        name: 'BNB Smart Chain (BEP20)',
        native: 'BNB',
        chainId: 56,
        confirmations: 15,
        tokens: ['USDT:0x55d398326f99059fF775485246999027B3197955', 'USDC:0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d'],
        priceFeed: '0x0567F2323251f0Aab15c8dFb1967E4e8A7D42aeE',
        sweepMinUsd: '10',
      }),
      evmChain('ETH', {
        name: 'Ethereum (ERC20)',
        native: 'ETH',
        chainId: 1,
        confirmations: 12,
        tokens: ['USDT:0xdAC17F958D2ee523a2206206994597C13D831ec7', 'USDC:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'],
        priceFeed: '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419',
        sweepMinUsd: '200',
      }),
    ].filter((c) => c.rpcUrl),
  },
};
