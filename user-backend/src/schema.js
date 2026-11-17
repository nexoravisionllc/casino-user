import crypto from 'node:crypto';
import mysql from 'mysql2/promise';
import { config } from './config.js';
import { connectionOptions, db } from './db.js';
import { hashPassword } from './lib/password.js';

/**
 * Creates the "Solution" database and its tables when missing, then seeds the
 * initial accounts into an empty database. Every statement is idempotent and
 * non-destructive, so this runs on each startup.
 *
 * The DDL is the same as admin-backend/src/schema.js (the database is shared and
 * either backend may start first). utf8mb4_unicode_ci keeps comparisons
 * case-insensitive like SQL Server's default collation, e.g. for LoginId lookups.
 */

const TABLE_OPTIONS = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';

export const TABLES = {
  Partners: `
    CREATE TABLE IF NOT EXISTS Partners (
      Uid         BIGINT        NOT NULL AUTO_INCREMENT PRIMARY KEY,
      Name        VARCHAR(64)   NOT NULL,
      LoginId     VARCHAR(64)   NOT NULL,
      Password    VARCHAR(256)  NOT NULL,
      PartnerId   BIGINT        NULL,
      Email       VARCHAR(128)  NULL,
      BankName    VARCHAR(64)   NULL,
      BankAccount VARCHAR(64)   NULL,
      BankMaster  VARCHAR(64)   NULL,
      ReferralId  VARCHAR(64)   NULL,
      Balance     DECIMAL(18,2) NOT NULL DEFAULT 0,
      Point       DECIMAL(18,2) NOT NULL DEFAULT 0,
      Role        INT           NOT NULL,
      CasinoRate  DECIMAL(6,3)  NOT NULL DEFAULT 0,
      SlotRate    DECIMAL(6,3)  NOT NULL DEFAULT 0,
      SportsRate  DECIMAL(6,3)  NOT NULL DEFAULT 0,
      Status      VARCHAR(32)   NOT NULL DEFAULT 'Active',
      CreatedAt   DATETIME(6)   NOT NULL,
      UpdatedAt   DATETIME(6)   NOT NULL,
      UNIQUE KEY UX_Partners_LoginId (LoginId),
      KEY IX_Partners_PartnerId (PartnerId)
    ) ${TABLE_OPTIONS}`,

  Users: `
    CREATE TABLE IF NOT EXISTS Users (
      Uid            BIGINT        NOT NULL AUTO_INCREMENT PRIMARY KEY,
      Name           VARCHAR(64)   NOT NULL,
      LoginId        VARCHAR(64)   NOT NULL,
      Password       VARCHAR(256)  NOT NULL,
      PartnerId      BIGINT        NULL,
      Email          VARCHAR(128)  NULL,
      BankName       VARCHAR(64)   NULL,
      BankAccount    VARCHAR(64)   NULL,
      BankMaster     VARCHAR(64)   NULL,
      Balance        DECIMAL(18,2) NOT NULL DEFAULT 0,
      Point          DECIMAL(18,2) NOT NULL DEFAULT 0,
      DepositAmount  DECIMAL(18,2) NOT NULL DEFAULT 0,
      DepositCount   DECIMAL(18,2) NOT NULL DEFAULT 0,
      WithdrawAmount DECIMAL(18,2) NOT NULL DEFAULT 0,
      WithdrawCount  DECIMAL(18,2) NOT NULL DEFAULT 0,
      Status         VARCHAR(32)   NOT NULL DEFAULT 'Active',
      CreatedAt      DATETIME(6)   NOT NULL,
      UpdatedAt      DATETIME(6)   NOT NULL,
      UNIQUE KEY UX_Users_LoginId (LoginId),
      KEY IX_Users_PartnerId (PartnerId)
    ) ${TABLE_OPTIONS}`,

  Transactions: `
    CREATE TABLE IF NOT EXISTS Transactions (
      uid          BIGINT        NOT NULL AUTO_INCREMENT PRIMARY KEY,
      type         VARCHAR(32)   NOT NULL,
      amount       DECIMAL(18,2) NOT NULL,
      beforeamount DECIMAL(18,2) NOT NULL,
      afteramount  DECIMAL(18,2) NULL,
      status       VARCHAR(32)   NOT NULL,
      userid       VARCHAR(64)   NOT NULL,
      managerid    VARCHAR(64)   NULL,
      memo         VARCHAR(512)  NULL,
      target_type  VARCHAR(16)   NULL,
      created_at   DATETIME(6)   NOT NULL,
      updated_at   DATETIME(6)   NULL,
      KEY IX_Transactions_userid (userid),
      KEY IX_Transactions_type (type)
    ) ${TABLE_OPTIONS}`,

  PointHistory: `
    CREATE TABLE IF NOT EXISTS PointHistory (
      uid          BIGINT        NOT NULL AUTO_INCREMENT PRIMARY KEY,
      type         VARCHAR(32)   NOT NULL,
      amount       DECIMAL(18,2) NOT NULL,
      beforeamount DECIMAL(18,2) NOT NULL,
      afteramount  DECIMAL(18,2) NOT NULL,
      userid       VARCHAR(64)   NOT NULL,
      memo         VARCHAR(512)  NULL,
      target_type  VARCHAR(16)   NULL,
      created_at   DATETIME(6)   NOT NULL,
      KEY IX_PointHistory_userid (userid)
    ) ${TABLE_OPTIONS}`,

  GameHistory: `
    CREATE TABLE IF NOT EXISTS GameHistory (
      uid           BIGINT        NOT NULL AUTO_INCREMENT PRIMARY KEY,
      trans_id      VARCHAR(128)  NOT NULL,
      round_id      VARCHAR(128)  NOT NULL,
      user_id       VARCHAR(64)   NOT NULL,
      game_code     VARCHAR(128)  NOT NULL,
      game_name     VARCHAR(256)  NULL,
      game_type     VARCHAR(64)   NULL,
      provider_name VARCHAR(128)  NULL,
      amount        DECIMAL(18,2) NOT NULL,
      type          VARCHAR(16)   NOT NULL,
      beforeamount  DECIMAL(18,2) NOT NULL,
      afteramount   DECIMAL(18,2) NOT NULL,
      company       VARCHAR(64)   NOT NULL,
      created_at    DATETIME(6)   NOT NULL,
      KEY IX_GameHistory_trans_id (trans_id),
      KEY IX_GameHistory_user_id (user_id)
    ) ${TABLE_OPTIONS}`,

  Providers: `
    CREATE TABLE IF NOT EXISTS Providers (
      uid         BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
      provider_id INT          NOT NULL,
      name        VARCHAR(128) NOT NULL,
      company     VARCHAR(64)  NOT NULL,
      status      INT          NOT NULL,
      image_url   VARCHAR(512) NULL,
      created_at  DATETIME(6)  NOT NULL,
      UNIQUE KEY UX_Providers_company_provider (company, provider_id)
    ) ${TABLE_OPTIONS}`,

  Games: `
    CREATE TABLE IF NOT EXISTS Games (
      uid           BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
      providerid    INT          NOT NULL,
      category      VARCHAR(64)  NULL,
      symbol        VARCHAR(128) NOT NULL,
      name          VARCHAR(256) NOT NULL,
      image_url     VARCHAR(512) NULL,
      launch_enable TINYINT(1)   NOT NULL,
      review        INT          NOT NULL DEFAULT 0,
      company       VARCHAR(64)  NOT NULL,
      created_at    DATETIME(6)  NOT NULL,
      UNIQUE KEY UX_Games_company_provider_symbol (company, providerid, symbol)
    ) ${TABLE_OPTIONS}`,

  GameSetting: `
    CREATE TABLE IF NOT EXISTS GameSetting (
      uid         BIGINT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
      Name        VARCHAR(64) NOT NULL,
      Show_Enable TINYINT(1)  NOT NULL DEFAULT 1
    ) ${TABLE_OPTIONS}`,
};

// Columns only this backend needs, added to a table that was created without them.
const EXTRA_COLUMNS = [
  { table: 'Users', column: 'UserCode', ddl: 'BIGINT NULL' },
  { table: 'Partners', column: 'ReferralId', ddl: 'VARCHAR(64) NULL' },
];

const databaseName = () =>
  config.db.url ? decodeURIComponent(new URL(config.db.url).pathname.slice(1)) : config.db.database;

// Connection settings without a default database (it may not exist yet).
function serverOnly() {
  if (!config.db.url) return {};
  const u = new URL(config.db.url);
  return {
    host: u.hostname,
    port: u.port ? Number(u.port) : 3306,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
  };
}

async function ensureDatabase() {
  const name = databaseName();
  if (!name) return;
  const conn = await mysql.createConnection(connectionOptions({ database: undefined, uri: undefined, ...serverOnly() }));
  try {
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${name.replaceAll('`', '``')}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  } finally {
    await conn.end();
  }
}

export async function ensureSchema() {
  await ensureDatabase();

  for (const ddl of Object.values(TABLES)) await db.query(ddl);

  for (const { table, column, ddl } of EXTRA_COLUMNS) {
    const [{ n }] = await db.query(
      `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table AND COLUMN_NAME = :column`,
      { table, column });
    if (Number(n) === 0) await db.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  }
}

// ---- Seed data (only into empty tables) ----

const US_BANK_NAMES = [
  'U.S. Bank', 'JPMorgan Chase', 'Bank of America', 'Wells Fargo',
  'Citibank', 'PNC Bank', 'Truist Bank', 'Capital One',
];

const SHARED_PASSWORD = '@12345#$%';

const randomBank = () => US_BANK_NAMES[crypto.randomInt(US_BANK_NAMES.length)];
const randomAccount = () => String(crypto.randomInt(100000000, 999999999));

const insertPartner = (p) => db.query(
  `INSERT INTO Partners (Name, LoginId, Password, PartnerId, Email, BankName, BankAccount, BankMaster,
                         Balance, Point, Role, CasinoRate, SlotRate, SportsRate, Status, CreatedAt, UpdatedAt)
   VALUES (:name, :loginId, :password, :partnerId, :email, :bankName, :bankAccount, :bankMaster,
           0, 0, :role, :casinoRate, :slotRate, :sportsRate, 'Active', :now, :now)`,
  p);

export async function seed() {
  const now = new Date();

  const [{ partners }] = await db.query('SELECT COUNT(*) AS partners FROM Partners');
  if (Number(partners) === 0) {
    // Super administrator: Role 1, no parent, rates 0.
    const admin = await insertPartner({
      name: 'Admin', loginId: 'Admin', password: await hashPassword(SHARED_PASSWORD), partnerId: null,
      email: 'admin@example.com', bankName: null, bankAccount: null, bankMaster: null,
      role: 1, casinoRate: '0', slotRate: '0', sportsRate: '0', now,
    });
    // Top agent directly under the administrator (Role 2).
    await insertPartner({
      name: 'agent', loginId: 'agent', password: await hashPassword(SHARED_PASSWORD), partnerId: admin.insertId,
      email: 'agent@example.com', bankName: randomBank(), bankAccount: randomAccount(), bankMaster: 'agent',
      role: 2, casinoRate: '5.0', slotRate: '4.0', sportsRate: '3.0', now,
    });
  }

  const [{ users }] = await db.query('SELECT COUNT(*) AS users FROM Users');
  if (Number(users) === 0) {
    const [agent] = await db.query("SELECT Uid FROM Partners WHERE LoginId = 'agent' LIMIT 1");
    if (!agent) throw new Error("Cannot seed the demo user: partner 'agent' does not exist.");
    await db.query(
      `INSERT INTO Users (Name, LoginId, Password, PartnerId, Email, BankName, BankAccount, BankMaster,
                          Status, Balance, Point, CreatedAt, UpdatedAt)
       VALUES ('user', 'user', :password, :partnerId, 'user@example.com', :bankName, :bankAccount, 'user',
               'Active', 1000.00, 250.00, :now, :now)`,
      { password: await hashPassword(SHARED_PASSWORD), partnerId: agent.Uid, bankName: randomBank(), bankAccount: randomAccount(), now });
  }
}
