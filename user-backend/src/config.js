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

export const config = {
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
};
