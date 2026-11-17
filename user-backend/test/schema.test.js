import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { TABLES, PASSWORD, db, ensureSchema, loginAs, seed, shutdown } from './helpers.js';

const count = async (table) => Number((await db.query(`SELECT COUNT(*) AS n FROM ${table}`))[0].n);

const hasColumn = async (table, column) => Number((await db.query(
  `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table AND COLUMN_NAME = :column`,
  { table, column }))[0].n) === 1;

beforeEach(async () => {
  for (const table of Object.keys(TABLES)) await db.query(`TRUNCATE TABLE ${table}`);
});
after(shutdown);

test('seeds the Admin > agent > user hierarchy into an empty database', async () => {
  await seed();

  const partners = await db.query('SELECT * FROM Partners ORDER BY Uid');
  assert.deepEqual(partners.map((p) => p.LoginId), ['Admin', 'agent']);
  assert.equal(partners[0].Role, 1);
  assert.equal(partners[0].PartnerId, null);
  assert.equal(partners[0].SlotRate, '0.000');
  assert.equal(partners[1].Role, 2);
  assert.equal(partners[1].PartnerId, partners[0].Uid);
  assert.equal(partners[1].CasinoRate, '5.000');
  assert.equal(partners[1].SlotRate, '4.000');
  assert.equal(partners[1].SportsRate, '3.000');
  assert.match(partners[1].BankAccount, /^\d{9}$/);

  const [user] = await db.query('SELECT * FROM Users');
  assert.equal(user.LoginId, 'user');
  assert.equal(user.PartnerId, partners[1].Uid);
  assert.equal(user.Balance, '1000.00');
  assert.equal(user.Point, '250.00');
  assert.equal(user.Status, 'Active');

  assert.ok(await loginAs('user', PASSWORD));
});

test('seeding never touches existing data', async () => {
  await seed();
  await db.query("UPDATE Users SET Balance = 7 WHERE LoginId = 'user'");
  await seed();
  assert.equal(await count('Users'), 1);
  assert.equal(await count('Partners'), 2);
  assert.equal((await db.query('SELECT Balance FROM Users'))[0].Balance, '7.00');
});

test('schema setup is repeatable and keeps data', async () => {
  await seed();
  await ensureSchema();
  await ensureSchema();
  assert.equal(await count('Users'), 1);
});

test('adds the columns missing from a table the admin backend created', async () => {
  await seed();
  await db.query('ALTER TABLE Users DROP COLUMN UserCode');
  await db.query('ALTER TABLE Partners DROP COLUMN ReferralId');
  await ensureSchema();
  assert.equal(await hasColumn('Users', 'UserCode'), true);
  assert.equal(await hasColumn('Partners', 'ReferralId'), true);
  assert.equal(await count('Users'), 1);
});

test('login ids compare case-insensitively and are unique across casing', async () => {
  await seed();
  await assert.rejects(db.query(
    `INSERT INTO Users (Name, LoginId, Password, Status, CreatedAt, UpdatedAt) VALUES ('x', 'USER', 'h', 'Active', NOW(), NOW())`),
    (err) => err.code === 'ER_DUP_ENTRY');
});
