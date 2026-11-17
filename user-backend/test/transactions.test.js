import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import jwt from 'jsonwebtoken';
import { JWT_KEY, NOTIFY_SECRET, balanceOf, db, get, loginAs, mock, pointOf, post, resetData, shutdown } from './helpers.js';

let token;
beforeEach(async () => {
  await resetData();
  token = await loginAs('user');
});
after(shutdown);

const deposit = (amount, t = token) => post('/api/transactions/deposit', { amount }, { token: t });
const withdraw = (amount, t = token) => post('/api/transactions/withdraw', { amount }, { token: t });
const convert = (amount, t = token) => post('/api/transactions/point-convert', { amount }, { token: t });

const ghostToken = () => jwt.sign({ sub: '424242', unique_name: 'ghost', name: 'ghost', jti: 'x' }, JWT_KEY,
  { algorithm: 'HS256', issuer: 'UserBackend', audience: 'UserFrontend', expiresIn: 3600, noTimestamp: true });

test('every transaction endpoint needs a token', async () => {
  assert.equal((await post('/api/transactions/deposit', { amount: 1 })).status, 401);
  assert.equal((await post('/api/transactions/withdraw', { amount: 1 })).status, 401);
  assert.equal((await post('/api/transactions/point-convert', { amount: 1 })).status, 401);
  // The auth check comes before the body is parsed.
  assert.equal((await post('/api/transactions/deposit', '{bad')).status, 401);
});

test('deposit creates a pending request for the top administrator', async () => {
  const res = await deposit(100);
  assert.equal(res.status, 200);
  assert.equal(res.json.success, true);
  assert.equal(res.json.message, 'Deposit requested successfully.');
  assert.equal(typeof res.json.uid, 'number');

  const [row] = await db.query('SELECT * FROM Transactions WHERE uid = :uid', { uid: res.json.uid });
  assert.equal(row.type, 'deposit');
  assert.equal(row.status, 'pending');
  assert.equal(row.userid, 'user');
  assert.equal(row.managerid, 'Admin');
  assert.equal(row.amount, '100.00');
  assert.equal(row.beforeamount, '1000.00');
  assert.equal(row.afteramount, null);
  assert.equal(row.memo, null);
  assert.equal(row.target_type, 'user');
  assert.equal(row.updated_at, null);
  assert.equal(await balanceOf('user'), '1000.00', 'balance is untouched until approval');
});

test('deposit and withdraw each allow one pending request', async () => {
  assert.equal((await deposit(10)).json.success, true);
  assert.deepEqual((await deposit(20)).json, { success: false, message: 'Pending request exists.' });

  // Withdraw tracks its own pending request.
  assert.equal((await withdraw(10)).json.success, true);
  assert.deepEqual((await withdraw(20)).json, { success: false, message: 'Pending request exists.' });

  await db.query("UPDATE Transactions SET status = 'finished'");
  assert.equal((await deposit(30)).json.success, true);
});

test('amount must be positive, and missing means zero', async () => {
  const want = { success: false, message: 'Enter an amount greater than zero.' };
  for (const path of ['deposit', 'withdraw', 'point-convert']) {
    for (const amount of [0, -5, '0']) {
      const res = await post(`/api/transactions/${path}`, { amount }, { token });
      assert.equal(res.status, 200);
      assert.deepEqual(res.json, want, `${path} ${amount}`);
    }
    assert.deepEqual((await post(`/api/transactions/${path}`, {}, { token })).json, want);
  }
});

test('invalid amounts are a 400', async () => {
  for (const body of ['{"amount":null}', '{"amount":"abc"}', '{"amount":true}', '{"amount":{}}', '{"amount":[1]}', '{"amount":1e999999}']) {
    const res = await post('/api/transactions/deposit', body, { token });
    assert.equal(res.status, 400, body);
  }
  assert.equal((await post('/api/transactions/deposit', '', { token })).status, 400);
  assert.equal((await post('/api/transactions/deposit', 'x', { token, headers: { 'Content-Type': 'text/plain' } })).status, 415);
});

test('amount accepts numeric strings and any property casing', async () => {
  assert.equal((await post('/api/transactions/deposit', { Amount: '12.5' }, { token })).json.success, true);
  assert.equal((await db.query("SELECT amount FROM Transactions WHERE type='deposit'"))[0].amount, '12.50');
});

test('a token for a deleted user gets "User not found" or an empty list', async () => {
  const t = ghostToken();
  const want = { success: false, message: 'User not found.' };
  assert.deepEqual((await deposit(1, t)).json, want);
  assert.deepEqual((await withdraw(1, t)).json, want);
  assert.deepEqual((await convert(1, t)).json, want);
  assert.deepEqual((await get('/api/transactions', { token: t })).json, []);
});

test('withdraw cannot exceed the balance, but may equal it', async () => {
  assert.deepEqual((await withdraw(1000.01)).json, { success: false, message: 'Withdrawal amount exceeds your available balance.' });
  assert.equal((await db.query('SELECT COUNT(*) AS n FROM Transactions'))[0].n, '0');
  const ok = await withdraw(1000);
  assert.equal(ok.json.message, 'Withdraw requested successfully.');
  assert.equal(await balanceOf('user'), '1000.00', 'funds move only on approval');
});

test('point-convert applies immediately on both ledgers', async () => {
  const res = await post('/api/transactions/point-convert', '{"amount":12.50}', { token });
  assert.deepEqual(res.json, { success: true, message: 'Points converted to balance successfully.' });
  assert.equal(await balanceOf('user'), '1012.50');
  assert.equal(await pointOf('user'), '237.50');

  const memo = 'user converts 12.50P to 12.50$';
  const [ph] = await db.query('SELECT * FROM PointHistory');
  assert.equal(ph.type, 'point-convert');
  assert.equal(ph.amount, '12.50');
  assert.equal(ph.beforeamount, '250.00');
  assert.equal(ph.afteramount, '237.50');
  assert.equal(ph.userid, 'user');
  assert.equal(ph.memo, memo);
  assert.equal(ph.target_type, 'user');

  const [tx] = await db.query('SELECT * FROM Transactions');
  assert.equal(tx.type, 'point-convert');
  assert.equal(tx.status, 'finished');
  assert.equal(tx.managerid, null);
  assert.equal(tx.beforeamount, '1000.00');
  assert.equal(tx.afteramount, '1012.50');
  assert.equal(tx.memo, memo);
  assert.equal(tx.target_type, 'user');
  assert.ok(tx.updated_at);

  assert.equal(mock.notifications.length, 1);
  assert.equal(mock.notifications[0].secret, NOTIFY_SECRET);
  assert.equal(mock.notifications[0].raw, '{"loginId":"user","balance":1012.50,"point":237.50}');
});

test('point-convert memo keeps the number as the client sent it', async () => {
  await convert(5);
  await post('/api/transactions/point-convert', '{"amount":"7.5"}', { token });
  const memos = (await db.query('SELECT memo FROM PointHistory ORDER BY uid')).map((r) => r.memo);
  assert.deepEqual(memos, ['user converts 5P to 5$', 'user converts 7.5P to 7.5$']);
});

test('point-convert is limited to the points held', async () => {
  assert.deepEqual((await convert(250.01)).json, { success: false, message: "You don't have enough points." });
  assert.equal(await pointOf('user'), '250.00');
  assert.equal(mock.notifications.length, 0);
  assert.equal((await convert(250)).json.success, true);
  assert.equal(await pointOf('user'), '0.00');
});

test('point-convert still succeeds when the wallet push fails', async () => {
  mock.notifyStatus = 500;
  assert.equal((await convert(1)).json.success, true);
  assert.equal(await balanceOf('user'), '1001.00');
});

test('point-convert is all-or-nothing', async () => {
  await db.query('RENAME TABLE Transactions TO Transactions_hidden');
  try {
    const res = await convert(10);
    assert.equal(res.status, 500);
    assert.equal(res.text, '');
  } finally {
    await db.query('RENAME TABLE Transactions_hidden TO Transactions');
  }
  assert.equal(await balanceOf('user'), '1000.00');
  assert.equal(await pointOf('user'), '250.00');
  assert.equal((await db.query('SELECT COUNT(*) AS n FROM PointHistory'))[0].n, '0');
  assert.equal(mock.notifications.length, 0, 'no push for a rolled-back change');
});

test('concurrent point-converts cannot spend the same points twice', async () => {
  const results = await Promise.all(Array.from({ length: 20 }, () => convert(100)));
  assert.equal(results.filter((r) => r.json.success).length, 2, '250 points cover two conversions of 100');
  assert.equal(await pointOf('user'), '50.00');
  assert.equal(await balanceOf('user'), '1200.00');
});

test('concurrent deposits create one pending request', async () => {
  const results = await Promise.all(Array.from({ length: 12 }, () => deposit(5)));
  assert.equal(results.filter((r) => r.json.success).length, 1);
  assert.equal((await db.query("SELECT COUNT(*) AS n FROM Transactions WHERE type='deposit'"))[0].n, '1');
});

test('the list shows only own rows, newest first, in the original shape', async () => {
  await deposit(10);
  await convert(1);
  await db.query(
    `INSERT INTO Transactions (type, status, userid, amount, beforeamount, created_at) VALUES ('deposit', 'pending', 'blocked', 1, 1, NOW())`);
  await db.query("UPDATE Transactions SET created_at = '2025-03-04 05:06:07.120000' WHERE type = 'deposit'");

  const { status, json, text } = await get('/api/transactions', { token });
  assert.equal(status, 200);
  assert.equal(json.length, 2);
  assert.deepEqual(json.map((r) => r.type), ['point-convert', 'deposit']);
  assert.deepEqual(Object.keys(json[0]), ['uid', 'type', 'amount', 'beforeAmount', 'afterAmount', 'status', 'managerId', 'memo', 'createdAt']);

  assert.equal(json[1].createdAt, '2025-03-04T05:06:07.12', 'no Z, trailing zeros trimmed');
  assert.equal(json[1].afterAmount, null);
  assert.equal(json[1].memo, null);
  assert.match(text, /"amount":10\.00,"beforeAmount":1000\.00,"afterAmount":null/);
});
