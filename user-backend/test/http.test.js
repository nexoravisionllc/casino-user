import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, test } from 'node:test';
import jwt from 'jsonwebtoken';

/**
 * The HTTP contract that is decided before any query runs. Needs no database:
 * the connection and upstream URLs point at a closed port, so nothing here can
 * reach a real database or the real game API.
 */

const JWT_KEY = 'test-only-jwt-signing-key-0123456789-abcdefghij';
const CALLBACK_TOKEN = 'test-callback-token';
const CLOSED = 'http://127.0.0.1:1';

Object.assign(process.env, {
  DATABASE_URL: '',
  DB_HOST: '127.0.0.1',
  DB_PORT: '1',
  DB_NAME: 'no_database_test',
  JWT_KEY,
  JWT_ISSUER: 'UserBackend',
  JWT_AUDIENCE: 'UserFrontend',
  CORS_ORIGINS: 'https://allowed.test',
  ADMIN_BACKEND_URL: CLOSED,
  FORTUNEGATE_BASE_URL: CLOSED,
  FORTUNEGATE_CALLBACK_TOKEN: CALLBACK_TOKEN,
});

const { createApp } = await import('../src/app.js');
const { db } = await import('../src/db.js');
const { createToken } = await import('../src/lib/auth.js');
const { hashPassword, verifyPassword } = await import('../src/lib/password.js');

let server;
let base;

before(async () => {
  server = http.createServer(createApp());
  await new Promise((resolve) => { server.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => { server.close(resolve); });
  await db.close();
});

async function request(method, path, { body, headers = {} } = {}) {
  const h = { ...headers };
  if (body !== undefined && !h['Content-Type']) h['Content-Type'] = 'application/json';
  const res = await fetch(`${base}${path}`, { method, headers: h, body });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = undefined; }
  return { status: res.status, text, json, headers: res.headers };
}

const post = (path, body, headers) => request('POST', path, { body, headers });
const bearer = (token) => ({ Authorization: `Bearer ${token}` });

const signed = (claims, sign = {}) => jwt.sign(
  { sub: '5', unique_name: 'user', name: 'user', jti: 'j', ...claims },
  JWT_KEY,
  { algorithm: 'HS256', issuer: 'UserBackend', audience: 'UserFrontend', expiresIn: 3600, noTimestamp: true, ...sign });

test('tokens carry the same claims as the C# JwtTokenService', () => {
  const claims = jwt.verify(createToken({ Uid: '42', LoginId: 'alice', Name: 'Alice' }), JWT_KEY,
    { issuer: 'UserBackend', audience: 'UserFrontend' });
  assert.deepEqual(Object.keys(claims).sort(), ['aud', 'exp', 'iss', 'jti', 'name', 'sub', 'unique_name']);
  assert.equal(claims.sub, '42');
  assert.equal(claims.unique_name, 'alice');
  assert.equal(claims.name, 'Alice');
});

test('password hashes keep the stored format and verify', async () => {
  const stored = await hashPassword('s3cret');
  assert.match(stored, /^100000\.[A-Za-z0-9+/]{22}==\.[A-Za-z0-9+/]{43}=$/);
  assert.equal(await verifyPassword('s3cret', stored), true);
  assert.equal(await verifyPassword('S3cret', stored), false);
  assert.equal(await verifyPassword('x', 'not-a-hash'), false);
});

test('verifies a PBKDF2 hash built with the C# parameters', async () => {
  const { pbkdf2Sync } = await import('node:crypto');
  const salt = Buffer.alloc(16, 7);
  const hash = pbkdf2Sync('legacy-pass', salt, 100000, 32, 'sha256');
  assert.equal(await verifyPassword('legacy-pass', `100000.${salt.toString('base64')}.${hash.toString('base64')}`), true);
});

test('protected routes need a valid token', async () => {
  const none = await request('GET', '/api/transactions');
  assert.equal(none.status, 401);
  assert.equal(none.text, '');
  assert.equal(none.headers.get('www-authenticate'), 'Bearer');

  const invalid = await request('GET', '/api/transactions', { headers: bearer('garbage') });
  assert.equal(invalid.status, 401);
  assert.match(invalid.headers.get('www-authenticate'), /invalid_token/);

  for (const sign of [{ issuer: 'AdminBackend' }, { audience: 'AdminFrontend' }, { expiresIn: -3600 }]) {
    const res = await request('GET', '/api/transactions', { headers: bearer(signed({}, sign)) });
    assert.equal(res.status, 401, JSON.stringify(sign));
  }
});

test('the token check comes before the body is read', async () => {
  assert.equal((await post('/api/transactions/deposit', '{bad')).status, 401);
  assert.equal((await post('/api/transactions/deposit', '{bad', bearer(signed({})))).status, 400);
});

test('non-positive amounts are refused without touching the database', async () => {
  const headers = bearer(signed({}));
  for (const path of ['deposit', 'withdraw', 'point-convert']) {
    for (const body of ['{"amount":0}', '{"Amount":-5}', '{"amount":"0"}', '{}']) {
      const res = await post(`/api/transactions/${path}`, body, headers);
      assert.equal(res.status, 200, `${path} ${body}`);
      assert.deepEqual(res.json, { success: false, message: 'Enter an amount greater than zero.' }, `${path} ${body}`);
    }
  }
});

test('invalid amounts and bodies are rejected', async () => {
  const headers = bearer(signed({}));
  for (const body of ['{"amount":null}', '{"amount":"abc"}', '{"amount":true}', '{"amount":{}}', '{"amount":[1]}', '{"amount":1e999999}', '[1]', '{bad']) {
    assert.equal((await post('/api/transactions/deposit', body, headers)).status, 400, body);
  }
  assert.equal((await post('/api/transactions/deposit', '', headers)).status, 400);
  assert.equal((await post('/api/transactions/deposit', 'x', { ...headers, 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await request('POST', '/api/transactions/deposit', { headers })).status, 415);
});

test('login validates its body before any lookup', async () => {
  const blank = await post('/api/auth/login', '{"loginId":"","password":"x"}');
  assert.equal(blank.status, 400);
  assert.deepEqual(blank.json, { message: 'Login id and password are required.' });

  const absent = await post('/api/auth/login', '{"password":"x"}');
  assert.equal(absent.status, 400);
  assert.ok(absent.json.errors.LoginId);

  assert.equal((await post('/api/auth/login', '{"loginId":5,"password":"x"}')).status, 400);
  assert.equal((await post('/api/auth/login', '{"loginId":"","password":"x"}', { 'Content-Type': 'text/plain' })).status, 415);
});

test('register reports blank fields with HTTP 200', async () => {
  const res = await post('/api/auth/register', '{"name":"","loginId":"a","password":"b"}');
  assert.equal(res.status, 200);
  assert.deepEqual(res.json, { ok: false, message: 'Name, login id and password are required.' });
  assert.equal((await post('/api/auth/register', '{"loginId":"a","password":"b"}')).status, 400);
});

test('callback token is checked after binding, and answers with HTTP 200', async () => {
  const wrong = await post('/callback', '{"command":"balance","data":{"account":"user"}}', { 'Callback-Token': 'nope' });
  assert.equal(wrong.status, 200);
  assert.equal(wrong.text, '{"result":1009,"status":"TOKEN_INVALID","data":{}}');
  assert.equal((await post('/callback', '{"command":null}', { 'Callback-Token': 'nope' })).status, 400);
});

test('callback binding matches ASP.NET', async () => {
  const headers = { 'Callback-Token': CALLBACK_TOKEN };
  const invalid = [
    '{"check":null}',
    '{"data":null}',
    '{"data":5}',
    '{"data":{"account":null}}',
    '{"data":{"account":5}}',
    '{"data":{"round_id":5}}',
    '{"data":{"amount":null}}',
    '{"data":{"amount":"x"}}',
    '{"data":{"trans_id":null}}',
    '{"data":{"trans_id":1.5}}',
    '{"data":{"trans_id":"abc"}}',
    '{"data":{"trans_id":"9223372036854775808"}}',
    '{broken',
  ];
  for (const body of invalid) assert.equal((await post('/callback', body, headers)).status, 400, body);
  assert.equal((await post('/callback', 'x', { ...headers, 'Content-Type': 'text/plain' })).status, 415);
});

test('an unknown command needs no database and echoes the code', async () => {
  const res = await post('/callback', '{"command":"dance"}', { 'Callback-Token': CALLBACK_TOKEN });
  assert.equal(res.text, '{"result":1017,"status":"CALLBACK_COMMAND_INVALID","data":{}}');
});

test('query integers are validated', async () => {
  for (const q of ['abc', '1.5', '', '99999999999']) {
    assert.equal((await request('GET', `/api/games/hot?count=${q}`)).status, 400, q);
  }
});

test('launch: non-integer uid is a 404, anonymous is asked to sign in', async () => {
  const bad = await request('GET', '/api/games/launch/abc');
  assert.equal(bad.status, 404);
  assert.equal(bad.text, '');

  const signIn = { requireLogin: true, message: 'Please sign in to play.' };
  assert.deepEqual((await request('GET', '/api/games/launch-symbol?symbol=vs20')).json, signIn);
  assert.deepEqual((await request('GET', '/api/games/launch-symbol?symbol=vs20', { headers: bearer('garbage') })).json, signIn);
});

test('launch-symbol validation', async () => {
  const missing = await request('GET', '/api/games/launch-symbol');
  assert.equal(missing.status, 400);
  assert.ok(missing.json.errors.symbol);
  assert.equal((await request('GET', '/api/games/launch-symbol?symbol=')).status, 400);
  const blank = await request('GET', '/api/games/launch-symbol?symbol=%20');
  assert.equal(blank.status, 400);
  assert.deepEqual(blank.json, { message: 'Missing game symbol.' });
  assert.equal((await request('GET', '/api/games/launch-symbol?symbol=a&providerId=x')).status, 400);
});

test('CORS allows configured origins only', async () => {
  const allowed = await request('POST', '/callback', { body: '{"command":"x"}', headers: { Origin: 'https://allowed.test' } });
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://allowed.test');
  assert.equal(allowed.headers.get('access-control-allow-credentials'), 'true');

  const denied = await request('POST', '/callback', { body: '{"command":"x"}', headers: { Origin: 'https://evil.test' } });
  assert.equal(denied.headers.get('access-control-allow-origin'), null);

  const preflight = await request('OPTIONS', '/api/auth/login', {
    headers: { Origin: 'https://allowed.test', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type,authorization' },
  });
  assert.ok(preflight.status < 300);
  assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://allowed.test');
});

test('unknown routes are an empty 404', async () => {
  const res = await request('GET', '/api/nope');
  assert.equal(res.status, 404);
  assert.equal(res.text, '');
});

test('a database outage is an empty 500, not a crash', async () => {
  const res = await request('GET', '/api/games/hot');
  assert.equal(res.status, 500);
  assert.equal(res.text, '');
  assert.equal((await request('GET', '/api/nope')).status, 404, 'still serving');
});
