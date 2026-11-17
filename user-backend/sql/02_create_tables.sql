-- STEP 2 of 4: create the 8 tables
-- Safe to re-run: existing tables and their data are left alone.

USE Solution;

-- Agents / administrators
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

-- Players
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

-- Deposits, withdrawals, point conversions
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

-- Point ledger
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

-- Bets / wins / cancels from the game provider callback
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

-- Game providers
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

-- Game catalog
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

-- Game category switches
CREATE TABLE IF NOT EXISTS GameSetting (
  uid         BIGINT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
  Name        VARCHAR(64) NOT NULL,
  Show_Enable TINYINT(1)  NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
