import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { CALLBACK_TOKEN, NOTIFY_SECRET, balanceOf, callback, db, mock, post, resetData, shutdown } from './helpers.js';

beforeEach(resetData);
after(shutdown);

const partnerBalance = (loginId) => balanceOf(loginId, 'Partners');
const rows = (sql, params) => db.query(sql, params);

const bet = (transId, amount, extra = {}, options) =>
  callback('bet', { account: 'user', trans_id: transId, round_id: 'r1', game_code: 'vs20', game_name: 'Gates', game_type: 'slot', provider_name: 'PP', amount, ...extra }, options);
const win = (transId, amount, extra = {}, options) =>
  callback('win', { account: 'user', trans_id: transId, round_id: 'r1', game_code: 'vs20', game_type: 'slot', amount, ...extra }, options);
const cancel = (transId, options) => callback('cancel', { account: 'user', trans_id: transId }, options);

test('every response is HTTP 200 with { result, status, data }', async () => {
  const res = await callback('balance', { account: 'user' });
  assert.equal(res.status, 200);
  assert.equal(res.text, '{"result":0,"status":"OK","data":{"balance":1000.00}}');
});

test('rejects a missing or wrong callback token', async () => {
  const wrong = await callback('balance', { account: 'user' }, { token: 'nope' });
  assert.equal(wrong.status, 200);
  assert.equal(wrong.text, '{"result":1009,"status":"TOKEN_INVALID","data":{}}');

  const none = await post('/callback', { command: 'balance', data: { account: 'user' } });
  assert.equal(none.json.result, 1009);
  assert.equal(await balanceOf('user'), '1000.00');
});

test('body validation runs before the token check', async () => {
  const res = await post('/callback', { command: null });
  assert.equal(res.status, 400);
});

test('authenticate and balance', async () => {
  assert.equal((await callback('authenticate', { account: 'user' })).text,
    '{"result":0,"status":"OK","data":{"account":"user","balance":1000.00}}');
  assert.equal((await callback('authenticate', { account: 'USER' })).json.data.account, 'user', 'canonical casing from the row');
  assert.equal((await callback('balance', { account: 'ghost' })).text, '{"result":2002,"status":"USER_NOT_FOUND","data":{}}');
});

test('unknown commands are rejected after the checks', async () => {
  assert.equal((await callback('dance', { account: 'user' })).text, '{"result":1017,"status":"CALLBACK_COMMAND_INVALID","data":{}}');
  assert.equal((await callback('dance', { account: 'ghost' }, { check: '21' })).json.result, 2002);
});

test('command names are case-sensitive', async () => {
  assert.equal((await callback('BALANCE', { account: 'user' })).json.result, 1017);
});

test('binds JSON the way ASP.NET did', async () => {
  const headers = { 'Callback-Token': CALLBACK_TOKEN };

  // Property names are case-insensitive, at both levels.
  assert.equal((await post('/callback', { COMMAND: 'balance', DATA: { ACCOUNT: 'user' } }, { headers })).json.result, 0);
  // Absent properties take their defaults.
  assert.equal((await post('/callback', { command: 'balance' }, { headers })).json.result, 2002);

  // Numbers may be quoted.
  const quoted = await post('/callback', { command: 'bet', data: { account: 'user', trans_id: '77', amount: '1.50' } }, { headers });
  assert.equal(quoted.json.data.balance, 998.5);

  // Explicit nulls on non-nullable fields, and wrong types, are a 400.
  const invalid = [
    { command: 'balance', check: null },
    { command: 'balance', data: null },
    { command: 'balance', data: 5 },
    { command: 'balance', data: { account: null } },
    { command: 'balance', data: { account: 5 } },
    { command: 'balance', data: { round_id: 5 } },
    { command: 'bet', data: { amount: null } },
    { command: 'bet', data: { amount: 'x' } },
    { command: 'bet', data: { trans_id: null } },
    { command: 'bet', data: { trans_id: 1.5 } },
    { command: 'bet', data: { trans_id: 'abc' } },
    { command: 'bet', data: { trans_id: '9223372036854775808' } },
  ];
  for (const body of invalid)
    assert.equal((await post('/callback', body, { headers })).status, 400, JSON.stringify(body));

  assert.equal((await post('/callback', '{broken', { headers })).status, 400);
  assert.equal((await post('/callback', 'x', { headers: { ...headers, 'Content-Type': 'text/plain' } })).status, 415);
});

test('bet debits, records the history row, and pushes the wallet', async () => {
  const res = await bet(1001, 10);
  assert.equal(res.text, '{"result":0,"status":"OK","data":{"balance":990.00}}');
  assert.equal(await balanceOf('user'), '990.00');

  const [row] = await rows('SELECT * FROM GameHistory');
  assert.equal(row.trans_id, '1001');
  assert.equal(row.round_id, 'r1');
  assert.equal(row.user_id, 'user');
  assert.equal(row.game_code, 'vs20');
  assert.equal(row.game_name, 'Gates');
  assert.equal(row.game_type, 'slot');
  assert.equal(row.provider_name, 'PP');
  assert.equal(row.amount, '10.00');
  assert.equal(row.type, 'BET');
  assert.equal(row.beforeamount, '1000.00');
  assert.equal(row.afteramount, '990.00');
  assert.equal(row.company, 'FortuneGate');

  assert.equal(mock.notifications.length, 1);
  assert.equal(mock.notifications[0].secret, NOTIFY_SECRET);
  assert.equal(mock.notifications[0].raw, '{"loginId":"user","balance":990.00,"point":250.00}');
});

test('blank optional game fields are stored as NULL, absent required ones as empty', async () => {
  await callback('bet', { account: 'user', trans_id: 5, amount: 1, game_name: '', game_type: '', provider_name: '' });
  const [row] = await rows('SELECT round_id, game_code, game_name, game_type, provider_name FROM GameHistory');
  assert.deepEqual({ ...row }, { round_id: '', game_code: '', game_name: null, game_type: null, provider_name: null });
});

test('bet may overdraw when check 31 is not requested', async () => {
  const res = await bet(1, 1500);
  assert.equal(res.json.data.balance, -500);
  assert.equal(await balanceOf('user'), '-500.00');
});

test('rolling is paid up the chain using the rate difference', async () => {
  await bet(2001, 100);
  assert.equal(await partnerBalance('sub'), '2.00', '100 x (2 - 0) / 100');
  assert.equal(await partnerBalance('agent'), '2.00', '100 x (4 - 2) / 100');
  assert.equal(await partnerBalance('Admin'), '0.00', 'rate 0 is below the downline rate, so nothing is paid');

  const payments = await rows("SELECT * FROM Transactions WHERE type = 'rolling payment' ORDER BY uid");
  assert.equal(payments.length, 2);
  assert.equal(payments[0].userid, 'sub');
  assert.equal(payments[0].managerid, 'user');
  assert.equal(payments[0].status, 'finished');
  assert.equal(payments[0].amount, '2.00');
  assert.equal(payments[0].beforeamount, '0.00');
  assert.equal(payments[0].afteramount, '2.00');
  assert.equal(payments[0].target_type, null);
  assert.equal(payments[0].memo,
    'user placed a bet (trans_id 2001, amount $100.00), so $100.00 × (2.00% - 0.00%) / 100 = $2.00 paid to sub.');

  assert.equal(payments[1].userid, 'agent');
  assert.equal(payments[1].managerid, 'sub');
  assert.equal(payments[1].memo,
    'user placed a bet (trans_id 2001, amount $100.00), so $100.00 × (4.00% - 2.00%) / 100 = $2.00 paid to agent.');
});

test('the rate follows the game type', async () => {
  const cases = [
    ['live_casino', '2.50', '2.50'],
    ['CASINO', '2.50', '2.50'],
    ['Sportsbook', '1.00', '2.00'],
    ['slot', '2.00', '2.00'],
    ['anything', '2.00', '2.00'],
    ['', '2.00', '2.00'],
  ];
  let id = 3000;
  for (const [gameType, subEarned, agentEarned] of cases) {
    await resetData();
    id += 1;
    await bet(id, 100, { game_type: gameType });
    assert.equal(await partnerBalance('sub'), subEarned, `sub on ${gameType}`);
    assert.equal(await partnerBalance('agent'), agentEarned, `agent on ${gameType}`);
  }
});

test('rolling rounds midpoints away from zero, exactly', async () => {
  // 100.50 x 1.000 / 100 = 1.005, which a binary float reports as 1.00.
  await db.query("UPDATE Partners SET SlotRate = 1.000 WHERE LoginId = 'sub'");
  await db.query("UPDATE Partners SET SlotRate = 1.000 WHERE LoginId = 'agent'");
  await bet(4001, 100.5);
  assert.equal(await partnerBalance('sub'), '1.01');
  assert.equal(await partnerBalance('agent'), '0.00', 'no difference, no payment');
  assert.equal((await rows("SELECT COUNT(*) AS n FROM Transactions WHERE type = 'rolling payment'"))[0].n, '1');
});

test('a rate with three decimals is shown to two in the memo', async () => {
  await db.query("UPDATE Partners SET SlotRate = 1.125 WHERE LoginId = 'sub'");
  await bet(4002, 100);
  const [pay] = await rows("SELECT memo, amount FROM Transactions WHERE userid = 'sub'");
  assert.equal(pay.amount, '1.13');
  assert.equal(pay.memo, 'user placed a bet (trans_id 4002, amount $100.00), so $100.00 × (1.13% - 0.00%) / 100 = $1.13 paid to sub.');
});

test('a tiny bet rounds to zero rolling and records no payment', async () => {
  await bet(4003, 0.01);
  assert.equal((await rows("SELECT COUNT(*) AS n FROM Transactions WHERE type = 'rolling payment'"))[0].n, '0');
  assert.equal(await balanceOf('user'), '999.99');
});

test('a zero or negative bet pays no rolling', async () => {
  await bet(4004, 0);
  await bet(4005, -5);
  assert.equal((await rows("SELECT COUNT(*) AS n FROM Transactions WHERE type = 'rolling payment'"))[0].n, '0');
  assert.equal(await balanceOf('user'), '1005.00');
});

test('a member with no partner pays no rolling', async () => {
  const res = await callback('bet', { account: 'orphan', trans_id: 4006, amount: 10 });
  assert.equal(res.json.data.balance, 90);
  assert.equal((await rows('SELECT COUNT(*) AS n FROM Transactions'))[0].n, '0');
});

test('amounts finer than a cent: the reply is exact, the column rounds', async () => {
  const res = await bet(4007, 1.234);
  assert.match(res.text, /"balance":998\.766\}/);
  assert.equal(await balanceOf('user'), '998.77');
});

test('win credits and records a WIN row', async () => {
  const res = await win(5001, 25.5);
  assert.equal(res.text, '{"result":0,"status":"OK","data":{"balance":1025.50}}');
  assert.equal(await balanceOf('user'), '1025.50');
  const [row] = await rows('SELECT type, amount, beforeamount, afteramount FROM GameHistory');
  assert.deepEqual({ ...row }, { type: 'WIN', amount: '25.50', beforeamount: '1000.00', afteramount: '1025.50' });
  assert.equal(mock.notifications.length, 1);
  assert.equal((await rows('SELECT COUNT(*) AS n FROM Transactions'))[0].n, '0', 'wins pay no rolling');
});

test('a zero win is recorded without changing the balance', async () => {
  const res = await win(5002, 0);
  assert.equal(res.json.result, 0);
  assert.equal(res.json.data.balance, 1000);
  assert.equal((await rows("SELECT type FROM GameHistory WHERE trans_id = '5002'"))[0].type, 'WIN');
});

test('a negative win reports the computed balance but does not apply it', async () => {
  const res = await win(5003, -10);
  assert.equal(res.json.data.balance, 990);
  assert.equal(await balanceOf('user'), '1000.00');
});

test('cancelling a bet refunds it and reverses the rolling', async () => {
  await bet(6001, 100);
  assert.equal(await balanceOf('user'), '900.00');
  mock.notifications = [];

  const res = await cancel(6001);
  assert.equal(res.text, '{"result":0,"status":"OK","data":{"balance":1000.00}}');
  assert.equal(await balanceOf('user'), '1000.00');
  assert.equal(await partnerBalance('sub'), '0.00');
  assert.equal(await partnerBalance('agent'), '0.00');
  assert.equal(mock.notifications.length, 1);

  const [row] = await rows("SELECT type, beforeamount, afteramount FROM GameHistory WHERE trans_id = '6001'");
  assert.deepEqual({ ...row }, { type: 'CANCEL', beforeamount: '900.00', afteramount: '1000.00' });

  const collects = await rows("SELECT * FROM Transactions WHERE type = 'rolling collect' ORDER BY uid");
  assert.equal(collects.length, 2);
  assert.equal(collects[0].userid, 'sub');
  assert.equal(collects[0].managerid, 'user');
  assert.equal(collects[0].amount, '2.00');
  assert.equal(collects[0].beforeamount, '2.00');
  assert.equal(collects[0].afteramount, '0.00');
  assert.equal(collects[0].status, 'finished');
  assert.equal(collects[0].memo, "user's bet (trans_id 6001) was cancelled — rolling collect (reversal): $2.00 taken back from sub.");
  assert.equal(collects[1].userid, 'agent');
  assert.equal(collects[1].managerid, 'sub');
});

test('cancelling twice is idempotent', async () => {
  await bet(6002, 100);
  await cancel(6002);
  mock.notifications = [];
  const res = await cancel(6002);
  assert.equal(res.json.result, 0);
  assert.equal(res.json.data.balance, 1000);
  assert.equal(await balanceOf('user'), '1000.00');
  assert.equal((await rows("SELECT COUNT(*) AS n FROM Transactions WHERE type = 'rolling collect'"))[0].n, '2');
  assert.equal(mock.notifications.length, 0);
});

test('cancelling a win takes it back', async () => {
  await win(6003, 40);
  const res = await cancel(6003);
  assert.equal(res.json.data.balance, 1000);
  assert.equal(await balanceOf('user'), '1000.00');
  assert.equal((await rows("SELECT type FROM GameHistory WHERE trans_id = '6003'"))[0].type, 'CANCEL');
});

test('cancel only reverses the rolling of its own trans_id', async () => {
  await bet(61, 100);
  await bet(611, 100);
  await cancel(61);
  assert.equal(await partnerBalance('sub'), '2.00');
  assert.equal((await rows("SELECT COUNT(*) AS n FROM Transactions WHERE type = 'rolling collect'"))[0].n, '2');
});

test('cancel of an unknown trans', async () => {
  assert.equal((await cancel(999)).text, '{"result":2016,"status":"TRANS_NOT_FOUND","data":{"balance":1000.00}}');
  assert.equal((await callback('cancel', { account: 'ghost', trans_id: 999 })).json.result, 2002, 'user is checked first');
});

test('status reports OK or CANCELED', async () => {
  await bet(7001, 5);
  assert.equal((await callback('status', { trans_id: 7001 })).text,
    '{"result":0,"status":"OK","data":{"trans_id":7001,"trans_status":"OK"}}');
  await cancel(7001);
  assert.equal((await callback('status', { trans_id: 7001 })).json.data.trans_status, 'CANCELED');
  assert.equal((await callback('status', { trans_id: 7999 })).text, '{"result":2016,"status":"TRANS_NOT_FOUND","data":{"balance":0}}');
});

test('64-bit trans_ids stay distinct and exact', async () => {
  // These two are the same number once they pass through a double.
  const a = '9007199254740992';
  const b = '9007199254740993';
  const headers = { 'Callback-Token': CALLBACK_TOKEN };
  const send = (id) => post('/callback', `{"command":"bet","check":"21,41","data":{"account":"user","trans_id":${id},"amount":1}}`, { headers });

  assert.equal((await send(a)).json.result, 0);
  assert.equal((await send(b)).json.result, 0, 'not mistaken for a duplicate');
  assert.equal(await balanceOf('user'), '998.00');
  assert.deepEqual((await rows('SELECT trans_id FROM GameHistory ORDER BY uid')).map((r) => r.trans_id), [a, b]);

  const status = await post('/callback', `{"command":"status","data":{"trans_id":${b}}}`, { headers });
  assert.match(status.text, /"trans_id":9007199254740993,/);
});

test('check 21 and 22: user must exist and be active', async () => {
  assert.equal((await callback('balance', { account: 'ghost' }, { check: '21' })).json.result, 2002);
  const blocked = await callback('bet', { account: 'blocked', trans_id: 1, amount: 1 }, { check: '21,22' });
  assert.equal(blocked.text, '{"result":1013,"status":"LOGIN_NOT_ALLOWED","data":{}}');
  assert.equal(await balanceOf('blocked'), '500.00');
});

test('check 22 is case-sensitive, unlike login', async () => {
  await db.query("UPDATE Users SET Status = 'ACTIVE' WHERE LoginId = 'user'");
  assert.equal((await callback('balance', { account: 'user' }, { check: '21,22' })).json.result, 1013);
});

test('check 31: balance must cover the amount; exact balance is enough', async () => {
  const short = await bet(1, 1000.01, {}, { check: '21,31' });
  assert.equal(short.text, '{"result":2006,"status":"BALANCE_NOT_ENOUGH","data":{"balance":1000.00}}');
  assert.equal(await balanceOf('user'), '1000.00');
  assert.equal((await rows('SELECT COUNT(*) AS n FROM GameHistory'))[0].n, '0');
  assert.equal((await bet(2, 1000, {}, { check: '21,31' })).json.data.balance, 0);
});

test('check 41: a processed trans is not applied again', async () => {
  await bet(8001, 10, {}, { check: '21,22,31,41' });
  const again = await bet(8001, 10, {}, { check: '21,22,31,41' });
  assert.equal(again.text, '{"result":2018,"status":"TRANS_ALREADY_PROCESSED","data":{"balance":990.00}}');
  assert.equal(await balanceOf('user'), '990.00');
});

test('check 42: the referenced trans must exist', async () => {
  const missing = await callback('cancel', { account: 'user', trans_id: 1 }, { check: '21,42' });
  assert.equal(missing.text, '{"result":2016,"status":"TRANS_NOT_FOUND","data":{"balance":1000.00}}');
  await bet(8002, 10);
  assert.equal((await callback('cancel', { account: 'user', trans_id: 8002 }, { check: '21,42' })).json.result, 0);
});

test('checks run in the given order and fail fast', async () => {
  const res = await callback('bet', { account: 'blocked', trans_id: 1, amount: 9999 }, { check: '21,31,22' });
  assert.equal(res.json.result, 2006, '31 is listed before 22');
});

test('unknown and non-numeric check codes are ignored', async () => {
  const res = await callback('balance', { account: 'user' }, { check: ' 99 , abc,, 21 ' });
  assert.equal(res.json.result, 0);
});

test('a check that needs the user before code 21 is a server error, as in C#', async () => {
  for (const check of ['22', '31']) {
    const res = await callback('bet', { account: 'user', trans_id: 1, amount: 1 }, { check });
    assert.equal(res.status, 500, check);
  }
  assert.equal(await balanceOf('user'), '1000.00');
});

test('a failure part-way through a bet rolls everything back', async () => {
  await db.query('RENAME TABLE Transactions TO Transactions_hidden');
  try {
    const res = await bet(9001, 100);
    assert.equal(res.status, 500);
  } finally {
    await db.query('RENAME TABLE Transactions_hidden TO Transactions');
  }
  assert.equal(await balanceOf('user'), '1000.00');
  assert.equal(await partnerBalance('sub'), '0.00');
  assert.equal((await rows('SELECT COUNT(*) AS n FROM GameHistory'))[0].n, '0');
  assert.equal(mock.notifications.length, 0);
});

test('a wallet push failure never breaks the callback', async () => {
  mock.notifyStatus = 500;
  const res = await bet(9002, 10);
  assert.equal(res.json.result, 0);
  assert.equal(await balanceOf('user'), '990.00');
});

test('concurrent bets are all applied without losing an update', async () => {
  const results = await Promise.all(Array.from({ length: 40 }, (_, i) => bet(10000 + i, 10)));
  assert.ok(results.every((r) => r.json.result === 0), results.find((r) => r.json?.result !== 0)?.text);
  assert.equal(await balanceOf('user'), '600.00');
  // 40 bets of 10 at 2% each to sub and agent: partner balances are shared state too.
  assert.equal(await partnerBalance('sub'), '8.00');
  assert.equal(await partnerBalance('agent'), '8.00');
  assert.equal((await rows('SELECT COUNT(*) AS n FROM GameHistory'))[0].n, '40');
});

test('a retried callback delivered concurrently is applied once', async () => {
  const results = await Promise.all(Array.from({ length: 15 }, () => bet(20000, 10, {}, { check: '21,22,31,41' })));
  assert.equal(results.filter((r) => r.json.result === 0).length, 1);
  assert.equal(results.filter((r) => r.json.result === 2018).length, 14);
  assert.equal(await balanceOf('user'), '990.00');
  assert.equal((await rows('SELECT COUNT(*) AS n FROM GameHistory'))[0].n, '1');
});

test('concurrent bets cannot overdraw past check 31', async () => {
  const results = await Promise.all(Array.from({ length: 30 }, (_, i) => bet(30000 + i, 100, {}, { check: '21,31' })));
  assert.equal(results.filter((r) => r.json.result === 0).length, 10);
  assert.equal(results.filter((r) => r.json.result === 2006).length, 20);
  assert.equal(await balanceOf('user'), '0.00');
});

test('concurrent cancels refund once', async () => {
  await bet(40000, 100);
  await Promise.all(Array.from({ length: 10 }, () => cancel(40000)));
  assert.equal(await balanceOf('user'), '1000.00');
  assert.equal(await partnerBalance('sub'), '0.00');
  assert.equal((await rows("SELECT COUNT(*) AS n FROM Transactions WHERE type = 'rolling collect'"))[0].n, '2');
});

test('different users betting under one agent do not deadlock or lose rolling', async () => {
  await db.query("UPDATE Users SET PartnerId = (SELECT Uid FROM (SELECT Uid FROM Partners WHERE LoginId = 'sub') p), Status = 'Active', Balance = 1000 WHERE LoginId IN ('blocked', 'pending1')");
  const accounts = ['user', 'blocked', 'pending1'];
  const results = await Promise.all(Array.from({ length: 45 }, (_, i) =>
    callback('bet', { account: accounts[i % 3], trans_id: 50000 + i, game_type: 'slot', amount: 10 })));
  assert.ok(results.every((r) => r.status === 200 && r.json.result === 0), results.find((r) => r.status !== 200)?.text);
  assert.equal(await partnerBalance('sub'), '9.00');
  assert.equal(await partnerBalance('agent'), '9.00');
});
