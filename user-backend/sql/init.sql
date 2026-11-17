-- ============================================================================
-- Solution database: schema + initial accounts (MySQL 8+)
--
-- Run:   mysql -u root -p < sql\init.sql
--
-- Safe to re-run: tables use IF NOT EXISTS, and each account is inserted only
-- when its LoginId does not exist yet. Nothing is dropped or overwritten.
--
-- You do NOT have to run this by hand: the backend does the same thing on
-- startup (src/schema.js). The script is for setting up or inspecting the
-- database without starting the app.
--
-- All three accounts use the password:  @12345#$%
-- (PBKDF2-SHA256, 100000 iterations: same format as the original C# backend)
-- ============================================================================

CREATE DATABASE IF NOT EXISTS Solution CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE Solution;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
  UserCode       BIGINT        NULL,
  UNIQUE KEY UX_Users_LoginId (LoginId),
  KEY IX_Users_PartnerId (PartnerId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS Providers (
  uid         BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  provider_id INT          NOT NULL,
  name        VARCHAR(128) NOT NULL,
  company     VARCHAR(64)  NOT NULL,
  status      INT          NOT NULL,
  image_url   VARCHAR(512) NULL,
  created_at  DATETIME(6)  NOT NULL,
  UNIQUE KEY UX_Providers_company_provider (company, provider_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS GameSetting (
  uid         BIGINT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
  Name        VARCHAR(64) NOT NULL,
  Show_Enable TINYINT(1)  NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Initial accounts (password for all: @12345#$%)
-- ---------------------------------------------------------------------------

-- Super administrator (Role 1, no parent)
INSERT INTO Partners (Name, LoginId, Password, PartnerId, Email, Balance, Point, Role,
                      CasinoRate, SlotRate, SportsRate, Status, CreatedAt, UpdatedAt)
SELECT 'Admin', 'Admin', '100000.OqrUZ1GEji4dZ9R90MwcQA==.+falGfbj/l+b5gqYZ9YcFv2nkaScOAMp2u/s4/yuvE8=',
       NULL, 'admin@example.com', 0, 0, 1, 0, 0, 0, 'Active', NOW(6), NOW(6)
WHERE NOT EXISTS (SELECT 1 FROM Partners WHERE LoginId = 'Admin');

-- Agent under the administrator (Role 2)
INSERT INTO Partners (Name, LoginId, Password, PartnerId, Email, BankName, BankAccount, BankMaster,
                      Balance, Point, Role, CasinoRate, SlotRate, SportsRate, Status, CreatedAt, UpdatedAt)
SELECT 'agent', 'agent', '100000.LFrK55Rl81leAzq7O1uqRg==.MH6qFUcq8IGRMdOrZJYXtAcvR7UM7bI/J/PjVZxcO4o=',
       (SELECT Uid FROM (SELECT Uid FROM Partners WHERE LoginId = 'Admin') a),
       'agent@example.com', 'JPMorgan Chase', '482915736', 'agent',
       0, 0, 2, 5.0, 4.0, 3.0, 'Active', NOW(6), NOW(6)
WHERE NOT EXISTS (SELECT 1 FROM Partners WHERE LoginId = 'agent');

-- Player under the agent: balance 1000, points 250
INSERT INTO Users (Name, LoginId, Password, PartnerId, Email, BankName, BankAccount, BankMaster,
                   Status, Balance, Point, CreatedAt, UpdatedAt)
SELECT 'user', 'user', '100000.HuddyMs62HasNmzmzis94A==.iGevGrI+hl01vEi9PvlazZYdEzveeJ8+NpOgizmvfDc=',
       (SELECT Uid FROM Partners WHERE LoginId = 'agent'),
       'user@example.com', 'Wells Fargo', '615204983', 'user',
       'Active', 1000.00, 250.00, NOW(6), NOW(6)
WHERE NOT EXISTS (SELECT 1 FROM Users WHERE LoginId = 'user');

SELECT 'Partners' AS tbl, Uid, LoginId, Role, PartnerId FROM Partners
UNION ALL
SELECT 'Users', Uid, LoginId, NULL, PartnerId FROM Users;
