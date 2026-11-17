import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { db, gameUid, get, loginAs, mock, resetData, seedCatalog, shutdown } from './helpers.js';

beforeEach(async () => {
  await resetData();
  await seedCatalog();
});
after(shutdown);

const names = (rows) => rows.map((r) => r.name);

test('hot games: popularity order, no Live, NULL category included, provider join', async () => {
  const { status, json } = await get('/api/games/hot');
  assert.equal(status, 200);
  assert.equal(json.length, 20);
  assert.deepEqual(names(json).slice(0, 4), ['Uncategorized Fortune', 'Orphan Slot', 'Other Company 100% Slot', 'Slot Game 0']);
  assert.ok(!names(json).includes('Live Roulette'));

  assert.deepEqual(Object.keys(json[0]), ['uid', 'name', 'provider', 'imageUrl', 'review']);
  assert.equal(json[0].provider, 'Pragmatic');
  assert.equal(json[0].imageUrl, 'https://img.test/nocat.png');
  assert.equal(json[0].review, 4000);
  assert.equal(json[1].provider, null, 'no matching provider');
  assert.equal(json[2].provider, null, 'provider match needs the same company');
});

test('count is clamped and validated', async () => {
  assert.equal((await get('/api/games/hot?count=2')).json.length, 2);
  assert.equal((await get('/api/games/hot?count=0')).json.length, 1);
  assert.equal((await get('/api/games/hot?count=-5')).json.length, 1);
  assert.equal((await get('/api/games/hot?count=1000')).json.length, 33);
  assert.equal((await get('/api/games/hot?count=abc')).status, 400);
  assert.equal((await get('/api/games/hot?count=1.5')).status, 400);
  assert.equal((await get('/api/games/hot?count=')).status, 400);
  assert.equal((await get('/api/games/hot?count=99999999999')).status, 400);
});

test('front-page slots skip the top 20 slots', async () => {
  const { json } = await get('/api/games/slots');
  // 32 Slots rows; the first 20 by popularity are skipped.
  assert.equal(json.length, 12);
  assert.equal(json[0].name, 'Slot Game 18');
  assert.equal((await get('/api/games/slots?count=3')).json.length, 3);
});

test('top: pagination envelope', async () => {
  const { json } = await get('/api/games/top?page=2&pageSize=10');
  assert.deepEqual(Object.keys(json), ['items', 'total', 'page', 'pageSize', 'totalPages']);
  assert.equal(json.total, 33);
  assert.equal(json.page, 2);
  assert.equal(json.pageSize, 10);
  assert.equal(json.totalPages, 4);
  assert.equal(json.items.length, 10);
  assert.equal(json.items[0].name, 'Slot Game 7');
});

test('top: pages cover every game exactly once, even with tied popularity', async () => {
  await db.query('UPDATE Games SET review = 7');
  const seen = [];
  for (let page = 1; page <= 4; page += 1)
    seen.push(...(await get(`/api/games/top?page=${page}&pageSize=10`)).json.items.map((g) => g.uid));
  assert.equal(seen.length, 33);
  assert.equal(new Set(seen).size, 33);
});

test('top: page and pageSize are normalized', async () => {
  const low = (await get('/api/games/top?page=0&pageSize=0')).json;
  assert.equal(low.page, 1);
  assert.equal(low.pageSize, 1);
  const high = (await get('/api/games/top?pageSize=500')).json;
  assert.equal(high.pageSize, 100);
  const past = (await get('/api/games/top?page=99')).json;
  assert.deepEqual(past.items, []);
  assert.equal(past.total, 33);
});

test('top: search matches names case-insensitively and ignores blanks', async () => {
  assert.deepEqual(names((await get('/api/games/top?search=FORTUNE')).json.items), ['Uncategorized Fortune']);
  assert.equal((await get('/api/games/top?search=%20%20')).json.total, 33);
  assert.equal((await get('/api/games/top?search=%20orphan%20')).json.total, 1);
  const none = (await get('/api/games/top?search=zzzz')).json;
  assert.deepEqual(none, { items: [], total: 0, page: 1, pageSize: 40, totalPages: 0 });
});

test('top: LIKE wildcards behave as on SQL Server, and a backslash is literal', async () => {
  assert.equal((await get('/api/games/top?search=Slot_Game')).json.total, 30);
  assert.equal((await get(`/api/games/top?search=${encodeURIComponent('100%')}`)).json.total, 1);
  assert.equal((await get(`/api/games/top?search=${encodeURIComponent('\\')}`)).json.total, 0);
});

test('top: search input cannot inject SQL', async () => {
  const res = await get(`/api/games/top?search=${encodeURIComponent("'; DROP TABLE Games; -- ")}`);
  assert.equal(res.status, 200);
  assert.equal(res.json.total, 0);
  assert.equal((await db.query('SELECT COUNT(*) AS n FROM Games'))[0].n, '34');
});

test('list returns all slots', async () => {
  const { json } = await get('/api/games/list');
  assert.equal(json.length, 32);
  assert.equal(json[0].name, 'Orphan Slot');
});

test('providers are ordered by provider id', async () => {
  assert.deepEqual((await get('/api/games/providers')).json, ['Pragmatic', 'Evolution']);
  assert.deepEqual((await get('/api/games/provider-cards')).json, [
    { providerId: 1, name: 'Pragmatic', imageUrl: 'https://img.test/pp.png' },
    { providerId: 2, name: 'Evolution', imageUrl: null },
  ]);
});

test('by-provider: inner join, all categories, paginated', async () => {
  const pp = (await get('/api/games/by-provider/Pragmatic?pageSize=5')).json;
  assert.equal(pp.total, 31, '30 slots + the NULL category game');
  assert.equal(pp.totalPages, 7);
  assert.equal(pp.items[0].provider, 'Pragmatic');

  const live = (await get('/api/games/by-provider/Evolution')).json;
  assert.deepEqual(names(live.items), ['Live Roulette']);

  const none = (await get('/api/games/by-provider/Nobody')).json;
  assert.deepEqual(none, { items: [], total: 0, page: 1, pageSize: 40, totalPages: 0 });
});

test('by-provider: decodes names with spaces', async () => {
  await db.query("UPDATE Providers SET name = 'Play N Go' WHERE provider_id = 2");
  assert.equal((await get('/api/games/by-provider/Play%20N%20Go')).json.total, 1);
});

test('settings expose booleans in table order', async () => {
  assert.deepEqual((await get('/api/games/settings')).json, [
    { name: 'Slots', showEnable: true },
    { name: 'Live Casino', showEnable: false },
    { name: 'Sports', showEnable: true },
  ]);
});

test('launch: unknown, malformed and other-company games', async () => {
  const missing = await get('/api/games/launch/999999');
  assert.equal(missing.status, 404);
  assert.deepEqual(missing.json, { message: 'Game not found.' });

  const malformed = await get('/api/games/launch/abc');
  assert.equal(malformed.status, 404);
  assert.equal(malformed.text, '');

  const other = await get(`/api/games/launch/${await gameUid('other')}`);
  assert.equal(other.status, 400);
  assert.deepEqual(other.json, { message: 'This game cannot be launched.' });
});

test('launch: anonymous or invalid token asks for sign-in and never calls FortuneGate', async () => {
  const uid = await gameUid('slot0');
  const want = { requireLogin: true, message: 'Please sign in to play.' };
  assert.deepEqual((await get(`/api/games/launch/${uid}`)).json, want);
  assert.deepEqual((await get(`/api/games/launch/${uid}`, { token: 'garbage' })).json, want);
  assert.equal(mock.fgRequests.length, 0);
});

test('launch: first launch creates and caches the player code', async () => {
  const uid = await gameUid('slot3');
  const token = await loginAs('user');

  const first = await get(`/api/games/launch/${uid}`, { token });
  assert.equal(first.status, 200);
  assert.deepEqual(first.json, { url: 'https://games.test/play/abc' });

  assert.deepEqual(mock.fgRequests.map((r) => r.path), ['/v4/user/create', '/v4/game/game-url']);
  assert.equal(mock.fgRequests[0].auth, 'Bearer test-fg-token');
  assert.deepEqual(mock.fgRequests[0].body, { name: 'user' });
  assert.deepEqual(mock.fgRequests[1].body, {
    game_symbol: 'slot3', lang: 1, provider_id: 1, return_url: 'http://localhost:5173/slot', user_code: 400123456, win_ratio: 0,
  });
  assert.equal((await db.query("SELECT UserCode FROM Users WHERE LoginId = 'user'"))[0].UserCode, '400123456');

  mock.fgRequests = [];
  await get(`/api/games/launch/${uid}`, { token });
  assert.deepEqual(mock.fgRequests.map((r) => r.path), ['/v4/game/game-url'], 'code is reused');
});

test('launch: a 64-bit player code survives the round trip', async () => {
  const uid = await gameUid('slot0');
  mock.userCreateResponse = '{"code":0,"data":{"user_code":9007199254740993}}';
  await get(`/api/games/launch/${uid}`, { token: await loginAs('user') });
  assert.match(mock.fgRequests[1].raw, /"user_code":9007199254740993/);
  assert.equal((await db.query("SELECT UserCode FROM Users WHERE LoginId = 'user'"))[0].UserCode, '9007199254740993');
});

test('launch: upstream failures are a 502', async () => {
  const uid = await gameUid('slot0');
  const token = await loginAs('user');
  const unavailable = { message: 'Game launch is unavailable right now.' };

  mock.userCreateResponse = { code: 0, data: { user_code: 0 } };
  let res = await get(`/api/games/launch/${uid}`, { token });
  assert.equal(res.status, 502);
  assert.deepEqual(res.json, unavailable);
  assert.equal((await db.query("SELECT UserCode FROM Users WHERE LoginId = 'user'"))[0].UserCode, null);

  mock.reset();
  mock.gameUrlResponse = { code: 0, data: { game_url: '' } };
  assert.equal((await get(`/api/games/launch/${uid}`, { token })).status, 502);

  mock.gameUrlResponse = { code: 0, data: null };
  assert.equal((await get(`/api/games/launch/${uid}`, { token })).status, 502);

  mock.gameUrlResponse = { code: 7, message: 'denied' };
  assert.equal((await get(`/api/games/launch/${uid}`, { token })).status, 502);

  mock.gameUrlResponse = 'not json';
  assert.equal((await get(`/api/games/launch/${uid}`, { token })).status, 502);

  mock.reset();
  mock.fgStatus = 500;
  assert.equal((await get(`/api/games/launch/${uid}`, { token })).status, 502);
});

test('launch-symbol: validation', async () => {
  const missing = await get('/api/games/launch-symbol');
  assert.equal(missing.status, 400);
  assert.ok(missing.json.errors.symbol);

  assert.equal((await get('/api/games/launch-symbol?symbol=')).status, 400);

  const blank = await get('/api/games/launch-symbol?symbol=%20');
  assert.equal(blank.status, 400);
  assert.deepEqual(blank.json, { message: 'Missing game symbol.' });

  assert.equal((await get('/api/games/launch-symbol?symbol=a&providerId=x')).status, 400);
});

test('launch-symbol: anonymous and signed-in flows', async () => {
  assert.deepEqual((await get('/api/games/launch-symbol?symbol=vs20')).json, { requireLogin: true, message: 'Please sign in to play.' });

  const token = await loginAs('user');
  const res = await get('/api/games/launch-symbol?symbol=vs20', { token });
  assert.deepEqual(res.json, { url: 'https://games.test/play/abc' });
  assert.equal(mock.fgRequests.at(-1).body.provider_id, 1, 'defaults to provider 1');

  await get('/api/games/launch-symbol?providerId=5&symbol=vs20%26x', { token });
  assert.equal(mock.fgRequests.at(-1).body.provider_id, 5);
  assert.equal(mock.fgRequests.at(-1).body.game_symbol, 'vs20&x');
});
