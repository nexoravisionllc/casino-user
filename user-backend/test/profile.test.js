import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { PASSWORD, db, get, loginAs, post, resetData, shutdown } from './helpers.js';

beforeEach(resetData);
after(shutdown);

const userRow = async () => (await db.query('SELECT * FROM Users WHERE LoginId = :l', { l: 'user' }))[0];
const save = (token, fields) => post('/api/profile', fields, { token });

const baseline = async (token) => (await get('/api/profile', { token })).json;

test('the profile needs a signed-in user', async () => {
  assert.equal((await get('/api/profile')).status, 401);
  assert.equal((await post('/api/profile', { name: 'x' })).status, 401);
});

test('reads the own profile', async () => {
  const token = await loginAs('user');
  const res = await get('/api/profile', { token });
  assert.equal(res.status, 200);
  assert.deepEqual(Object.keys(res.json), ['name', 'loginId', 'email', 'bankName', 'bankAccount', 'bankMaster', 'createdAt']);
  assert.equal(res.json.loginId, 'user');
});

test('the name changes without a password; the login id never changes', async () => {
  const token = await loginAs('user');
  const res = await save(token, { ...(await baseline(token)), name: '  New Name  ', loginId: 'hacker' });
  assert.equal(res.json.success, true);
  const row = await userRow();
  assert.equal(row.Name, 'New Name');
  assert.equal(row.LoginId, 'user');
  assert.equal((await get('/api/auth/me', { token })).json.name, 'New Name');
});

test('email and bank changes need the current password', async () => {
  const token = await loginAs('user');
  const fields = { ...(await baseline(token)), email: 'me@example.com', bankName: 'Bank X', bankAccount: '12345', bankMaster: 'Me' };

  assert.match((await save(token, fields)).json.message, /current password/);
  assert.match((await save(token, { ...fields, currentPassword: 'wrong' })).json.message, /incorrect/);
  assert.equal((await userRow()).BankAccount === '12345', false, 'nothing saved');

  const ok = await save(token, { ...fields, currentPassword: PASSWORD });
  assert.equal(ok.json.success, true);
  const row = await userRow();
  assert.deepEqual([row.Email, row.BankName, row.BankAccount, row.BankMaster], ['me@example.com', 'Bank X', '12345', 'Me']);

  // Clearing a field stores NULL.
  await save(token, { ...fields, email: '', currentPassword: PASSWORD });
  assert.equal((await userRow()).Email, null);
});

test('validates the input', async () => {
  const token = await loginAs('user');
  const base = { ...(await baseline(token)), currentPassword: PASSWORD };
  assert.match((await save(token, { ...base, name: '  ' })).json.message, /Name is required/);
  assert.match((await save(token, { ...base, email: 'not-an-email' })).json.message, /valid email/);
  assert.match((await save(token, { ...base, bankAccount: 'x'.repeat(65) })).json.message, /at most 64/);
  assert.match((await save(token, { ...base, bankName: 'a\nb' })).json.message, /not allowed/);
});

test('bank details are locked while a withdrawal waits for review', async () => {
  const token = await loginAs('user');
  assert.equal((await post('/api/transactions/withdraw', { amount: 10 }, { token })).json.success, true);
  const base = { ...(await baseline(token)), currentPassword: PASSWORD };

  const blocked = await save(token, { ...base, bankAccount: '999' });
  assert.equal(blocked.json.success, false);
  assert.match(blocked.json.message, /withdrawal waiting for review/);
  // Name and email can still change.
  assert.equal((await save(token, { ...base, name: 'Still Me', email: 'x@example.com' })).json.success, true);

  await db.query("UPDATE Transactions SET status = 'finished'");
  assert.equal((await save(token, { ...base, bankAccount: '999' })).json.success, true);
});

test('changes the password', async () => {
  const token = await loginAs('user');
  const change = (body) => post('/api/profile/password', body, { token });
  assert.match((await change({ currentPassword: 'wrong', newPassword: 'abcdef1' })).json.message, /incorrect/);
  assert.match((await change({ currentPassword: PASSWORD, newPassword: '123' })).json.message, /at least 6/);
  assert.match((await change({ currentPassword: PASSWORD, newPassword: PASSWORD })).json.message, /different/);

  assert.equal((await change({ currentPassword: PASSWORD, newPassword: 'n3w-Passw0rd' })).json.success, true);
  assert.equal((await post('/api/auth/login', { loginId: 'user', password: PASSWORD })).status, 401);
  assert.equal((await post('/api/auth/login', { loginId: 'user', password: 'n3w-Passw0rd' })).status, 200);
});
