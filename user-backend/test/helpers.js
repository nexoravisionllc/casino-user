import http from 'node:http';

/**
 * Shared test harness. Boots the real Express app against a throwaway MySQL
 * database, with FortuneGate and the admin wallet hook replaced by a local mock
 * so that no test can reach the real game API.
 *
 * Connection: TEST_DB_HOST, TEST_DB_PORT (33306), TEST_DB_USER, TEST_DB_PASSWORD,
 * TEST_DB_NAME (user_backend_test). Tables are truncated between tests, so the
 * database name must contain "test".
 */

const dbName = process.env.TEST_DB_NAME || 'user_backend_test';
if (!/test/i.test(dbName)) throw new Error(`Refusing to run tests against database "${dbName}".`);

export const CALLBACK_TOKEN = 'test-callback-token';
export const NOTIFY_SECRET = 'test-notify-secret';
export const JWT_KEY = 'test-only-jwt-signing-key-0123456789-abcdefghij';
export const PASSWORD = '@12345#$%';

// ---- Mock of FortuneGate and the admin backend ----

export const mock = {
  fgRequests: [],
  notifications: [],
  gameUrlResponse: null,
  userCreateResponse: null,
  fgStatus: 200,
  notifyStatus: 200,
  reset() {
    this.fgRequests = [];
    this.notifications = [];
    this.gameUrlResponse = { code: 0, message: 'ok', data: { game_url: 'https://games.test/play/abc' } };
    this.userCreateResponse = { code: 0, message: 'ok', data: { user_code: 400123456 } };
    this.fgStatus = 200;
    this.notifyStatus = 200;
  },
};

const mockServer = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => {
    const send = (status, body) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(typeof body === 'string' ? body : JSON.stringify(body));
    };
    if (req.url === '/api/wallet/notify') {
      mock.notifications.push({ secret: req.headers['x-notify-secret'], raw, body: JSON.parse(raw) });
      return send(mock.notifyStatus, {});
    }
    mock.fgRequests.push({ path: req.url, auth: req.headers.authorization, raw, body: JSON.parse(raw) });
    if (mock.fgStatus !== 200) return send(mock.fgStatus, { message: 'upstream error' });
    return send(200, req.url === '/v4/user/create' ? mock.userCreateResponse : mock.gameUrlResponse);
  });
});
await new Promise((resolve) => { mockServer.listen(0, '127.0.0.1', resolve); });
const mockUrl = `http://127.0.0.1:${mockServer.address().port}`;
mock.reset();

// ---- Environment (set before importing the app; real env beats .env) ----

Object.assign(process.env, {
  DATABASE_URL: '',
  DB_HOST: process.env.TEST_DB_HOST || '127.0.0.1',
  DB_PORT: process.env.TEST_DB_PORT || '33306',
  DB_USER: process.env.TEST_DB_USER || 'root',
  DB_PASSWORD: process.env.TEST_DB_PASSWORD || '',
  DB_NAME: dbName,
  DB_CONNECTION_LIMIT: '30',
  JWT_KEY,
  JWT_ISSUER: 'UserBackend',
  JWT_AUDIENCE: 'UserFrontend',
  JWT_EXPIRES_HOURS: '12',
  CORS_ORIGINS: 'http://localhost:5173,https://allowed.test',
  ADMIN_BACKEND_URL: mockUrl,
  NOTIFY_SECRET,
  FORTUNEGATE_BASE_URL: mockUrl,
  FORTUNEGATE_TOKEN: 'test-fg-token',
  FORTUNEGATE_LANG: '1',
  FORTUNEGATE_RETURN_URL: 'http://localhost:5173/slot',
  FORTUNEGATE_DEFAULT_WIN_RATIO: '0',
  FORTUNEGATE_CALLBACK_TOKEN: CALLBACK_TOKEN,
});

const { createApp } = await import('../src/app.js');
export const { db } = await import('../src/db.js');
export const { ensureSchema, seed, TABLES } = await import('../src/schema.js');
const { hashPassword } = await import('../src/lib/password.js');

await ensureSchema();

const appServer = http.createServer(createApp());
await new Promise((resolve) => { appServer.listen(0, '127.0.0.1', resolve); });
const baseUrl = `http://127.0.0.1:${appServer.address().port}`;

export async function shutdown() {
  appServer.closeAllConnections();
  mockServer.closeAllConnections();
  await Promise.all([
    new Promise((resolve) => { appServer.close(resolve); }),
    new Promise((resolve) => { mockServer.close(resolve); }),
  ]);
  await db.close();
}

// ---- Requests ----

/** Send a request. `body` is JSON-encoded unless it is a string (sent verbatim). */
export async function api(method, path, { body, token, headers = {} } = {}) {
  const h = { ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  let payload;
  if (body !== undefined) {
    payload = typeof body === 'string' ? body : JSON.stringify(body);
    if (!Object.keys(h).some((k) => k.toLowerCase() === 'content-type')) h['Content-Type'] = 'application/json';
  }
  const res = await fetch(`${baseUrl}${path}`, { method, headers: h, body: payload });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = undefined; }
  return { status: res.status, text, json, headers: res.headers };
}

export const get = (path, options) => api('GET', path, options);
export const post = (path, body, options) => api('POST', path, { ...options, body });

export async function loginAs(loginId, password = PASSWORD) {
  const res = await post('/api/auth/login', { loginId, password });
  if (res.status !== 200) throw new Error(`Login failed for ${loginId}: ${res.status} ${res.text}`);
  return res.json.token;
}

/** Post a seamless-wallet callback with the valid token. */
export function callback(command, data = {}, { check = '', token = CALLBACK_TOKEN } = {}) {
  return post('/callback', { command, timestamp: '1700000000', check, data }, { headers: { 'Callback-Token': token } });
}

// ---- Fixtures ----

const NOW = '2025-03-04 05:06:07.120000';
let cachedHash;

/**
 * Resets every table to: Admin (rate 0) > agent (slot 4 / casino 5 / sports 3)
 * > sub (slot 2 / casino 2.5 / sports 1), the member "user" under sub with
 * balance 1000.00 / point 250.00, plus "pending1" and "blocked" accounts.
 */
export async function resetData() {
  mock.reset();
  for (const table of Object.keys(TABLES)) await db.query(`TRUNCATE TABLE ${table}`);
  cachedHash ??= await hashPassword(PASSWORD);

  const partner = (name, parent, role, casino, slot, sports, referral) => db.query(
    `INSERT INTO Partners (Name, LoginId, Password, PartnerId, Balance, Point, Role, CasinoRate, SlotRate, SportsRate, ReferralId, Status, CreatedAt, UpdatedAt)
     VALUES (:name, :name, :hash, :parent, 0, 0, :role, :casino, :slot, :sports, :referral, 'Active', :now, :now)`,
    { name, hash: cachedHash, parent, role, casino, slot, sports, referral, now: NOW });

  const admin = await partner('Admin', null, 1, '0', '0', '0', null);
  const agent = await partner('agent', admin.insertId, 2, '5', '4', '3', 'AGENTREF');
  const sub = await partner('sub', agent.insertId, 3, '2.5', '2', '1', 'SUBREF');

  const user = (loginId, status, balance, point, partnerId) => db.query(
    `INSERT INTO Users (Name, LoginId, Password, PartnerId, Balance, Point, Status, CreatedAt, UpdatedAt)
     VALUES (:loginId, :loginId, :hash, :partnerId, :balance, :point, :status, :now, :now)`,
    { loginId, status, balance, point, partnerId, hash: cachedHash, now: NOW });

  await user('user', 'Active', '1000.00', '250.00', sub.insertId);
  await user('pending1', 'Pending', '0', '0', sub.insertId);
  await user('blocked', 'Suspended', '500.00', '0', sub.insertId);
  await user('orphan', 'Active', '100.00', '0', null);
}

export const balanceOf = async (loginId, table = 'Users') =>
  (await db.query(`SELECT Balance FROM ${table} WHERE LoginId = :loginId`, { loginId }))[0]?.Balance;

export const pointOf = async (loginId) =>
  (await db.query('SELECT Point FROM Users WHERE LoginId = :loginId', { loginId }))[0]?.Point;

/** Adds providers and games covering every listing rule. */
export async function seedCatalog() {
  const provider = (id, name, company, image) => db.query(
    `INSERT INTO Providers (provider_id, name, company, status, image_url, created_at)
     VALUES (:id, :name, :company, 1, :image, :now)`,
    { id, name, company, image, now: NOW });
  await provider(2, 'Evolution', 'FortuneGate', null);
  await provider(1, 'Pragmatic', 'FortuneGate', 'https://img.test/pp.png');

  const game = (providerId, category, symbol, name, review, company = 'FortuneGate') => db.query(
    `INSERT INTO Games (providerid, category, symbol, name, image_url, launch_enable, review, company, created_at)
     VALUES (:providerId, :category, :symbol, :name, :image, 1, :review, :company, :now)`,
    { providerId, category, symbol, name, image: `https://img.test/${symbol}.png`, review, company, now: NOW });

  // 30 slots, reviews 1000 down to 971.
  for (let i = 0; i < 30; i += 1) await game(1, 'Slots', `slot${i}`, `Slot Game ${i}`, 1000 - i);
  // Live games must never appear in Hot/Top/Slots.
  await game(2, 'Live', 'live1', 'Live Roulette', 5000);
  // A NULL category still counts as "not Live".
  await game(1, null, 'nocat', 'Uncategorized Fortune', 4000);
  // No matching provider: the card's provider is null.
  await game(99, 'Slots', 'orphan', 'Orphan Slot', 3000);
  // Another company cannot be launched, and does not match provider 1 of FortuneGate.
  await game(1, 'Slots', 'other', 'Other Company 100% Slot', 2000, 'OtherCo');

  await db.query("INSERT INTO GameSetting (Name, Show_Enable) VALUES ('Slots', 1), ('Live Casino', 0), ('Sports', 1)");
}

export const gameUid = async (symbol) =>
  (await db.query('SELECT uid FROM Games WHERE symbol = :symbol', { symbol }))[0].uid;
