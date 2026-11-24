import crypto from 'node:crypto';
import { getAddress, isAddress } from 'ethers';
import express from 'express';
import { config } from '../config.js';
import { db } from '../db.js';
import { currentUserId, requireAuth } from '../lib/auth.js';
import { Decimal, decimalJson, longJson } from '../lib/decimal.js';
import { dbDate } from '../lib/format.js';
import { bodyOf, jsonBody } from '../lib/http.js';
import { settlePayout } from '../services/cryptoSettle.js';
import * as onchain from '../services/onchain.js';
import { walletStatus } from '../services/walletStatus.js';
import { notifyWallet } from '../services/walletPush.js';

/**
 * Crypto deposits and withdrawals through the self-hosted gateway
 * (services/onchain.js).
 *
 * Deposit: each player has a permanent address (GET /onchain/deposit-address);
 * the on-chain worker credits confirmed transfers to it.
 *
 * Withdrawal:
 * 1. POST /crypto/withdraw records a pending "withdraw" Transaction plus the
 *    wallet address, for an admin to review like any withdrawal.
 * 2. The admin sends the coins manually from their own wallet, then accepts
 *    the request in the admin panel: it debits the balance, finishes the
 *    request and marks the payout "paid". Or the admin rejects it with a
 *    reason. Either way the player is emailed. Nothing is sent automatically.
 */
export const router = express.Router();

const PROVIDER = 'onchain';
const ADDRESS = /^[A-Za-z0-9:._-]{10,128}$/;

const newOrderId = (prefix) => `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`;

const findOption = (currency, network) =>
  onchain.payoutOptions().find((o) => o.currency === currency.trim().toUpperCase() && o.network === network.trim().toUpperCase());

// ------------------------------------------------------------- withdrawals

/** Coins a player can withdraw to. */
router.get('/crypto/withdraw/options', requireAuth, (req, res) => {
  const available = onchain.isConfigured();
  // devMode: withdrawals (crypto and manual) are switched off for the showcase.
  res.json({ available, devMode: config.devMode, currency: 'USD', options: available ? onchain.payoutOptions() : [] });
});

/** Request a crypto withdrawal; an admin reviews it like any other withdrawal. */
router.post('/crypto/withdraw', requireAuth, jsonBody, async (req, res) => {
  if (config.devMode) return res.json({ success: false, message: 'Withdrawals are disabled in demo mode.' });
  const body = bodyOf(req);
  const amount = body.decimal('Amount').rounded(2);
  const currency = body.str('Currency');
  const network = body.str('Network');
  let address = body.str('Address').trim();

  if (!amount.isPositive) return res.json({ success: false, message: 'Enter an amount greater than zero.' });
  if (!onchain.isConfigured()) return res.json({ success: false, message: 'Crypto withdrawals are not available right now.' });
  const option = findOption(currency, network);
  if (!option) return res.json({ success: false, message: 'Choose a supported coin and network.' });
  if (!ADDRESS.test(address)) return res.json({ success: false, message: 'Enter a valid wallet address.' });
  // A mixed-case address carries a checksum; isAddress rejects one with a typo.
  if (!isAddress(address)) return res.json({ success: false, message: 'Enter a valid wallet address.' });
  address = getAddress(address);
  if (await onchain.isOwnAddress(address)) return res.json({ success: false, message: 'Enter your own wallet address, not a deposit address.' });

  const result = await db.transaction(async (tx) => {
    const [user] = await tx.query(
      'SELECT LoginId, Balance, Status FROM Users WHERE Uid = :uid FOR UPDATE', { uid: currentUserId(req) });
    if (!user) return { success: false, message: 'User not found.' };
    if (user.Status !== 'Active') return { success: false, message: 'Your account cannot make withdrawals.' };
    const balance = Decimal.from(user.Balance);
    if (amount.greaterThan(balance)) return { success: false, message: 'Withdrawal amount exceeds your available balance.' };

    const [pending] = await tx.query(
      "SELECT 1 FROM Transactions WHERE userid = :loginId AND type = 'withdraw' AND status IN ('pending', 'processing') LIMIT 1",
      { loginId: user.LoginId });
    if (pending) return { success: false, message: 'Pending request exists.' };

    const [admin] = await tx.query('SELECT LoginId FROM Partners WHERE Role = 1 ORDER BY Uid LIMIT 1');
    const now = new Date();
    const memo = `Crypto ${option.currency}/${option.network} to ${address}`;

    const { insertId } = await tx.query(
      `INSERT INTO Transactions (type, status, userid, managerid, amount, beforeamount, afteramount, memo, target_type, created_at, updated_at)
       VALUES ('withdraw', 'pending', :loginId, :managerId, :amount, :before, NULL, :memo, 'user', :now, NULL)`,
      { loginId: user.LoginId, managerId: admin?.LoginId ?? null, amount: amount.toString(), before: balance.toString(), memo, now });

    await tx.query(
      `INSERT INTO CryptoPayments (order_id, direction, userid, amount, currency, provider, status, payer_currency, network, address,
                                   transaction_uid, created_at, updated_at)
       VALUES (:orderId, 'withdraw', :loginId, :amount, :currency, :provider, 'requested', :coin, :network, :address, :txUid, :now, :now)`,
      {
        orderId: newOrderId('wd'), loginId: user.LoginId, amount: amount.toString(),
        currency: 'USD', provider: PROVIDER, coin: option.currency, network: option.network, address, txUid: insertId, now,
      });

    return { success: true, message: 'Withdraw requested successfully.', uid: longJson(insertId) };
  });
  res.json(result);
});

/**
 * Server-to-server: read-only balances of the gateway's hot wallet and
 * treasury, for the admin "Wallet" page. Authenticated with NOTIFY_SECRET.
 */
router.get('/internal/crypto/wallet', async (req, res) => {
  const secret = config.adminBackend.notifySecret;
  if (!secret || (req.get('x-notify-secret') ?? '') !== secret) return res.status(401).end();
  res.json(await walletStatus());
});

// ------------------------------------------------------- on-chain deposits

/** The player's permanent deposit address and what it accepts. */
router.get('/onchain/deposit-address', requireAuth, async (req, res) => {
  // devMode: show the deposit page without handing out (or creating) a real address.
  if (config.devMode) {
    return res.json({
      available: true,
      devMode: true,
      address: 'N/A',
      minDepositUsd: Decimal.from(config.onchain.minDepositUsd),
      networks: onchain.depositNetworks(),
    });
  }
  if (!onchain.isConfigured()) return res.json({ available: false });
  const [user] = await db.query('SELECT LoginId, Status FROM Users WHERE Uid = :uid LIMIT 1', { uid: currentUserId(req) });
  if (!user) return res.status(404).end();
  if (user.Status !== 'Active') return res.json({ available: false, message: 'Your account cannot make deposits.' });
  res.json({
    available: true,
    address: await onchain.depositAddressFor(user.LoginId),
    minDepositUsd: Decimal.from(config.onchain.minDepositUsd),
    networks: onchain.depositNetworks(),
  });
});

/** The player's latest credited on-chain deposits, newest first. */
router.get('/onchain/deposits', requireAuth, async (req, res) => {
  const [user] = await db.query('SELECT LoginId FROM Users WHERE Uid = :uid LIMIT 1', { uid: currentUserId(req) });
  if (!user) return res.status(404).end();
  const rows = await db.query(
    `SELECT order_id, amount, payer_amount, payer_currency, network, txid, created_at FROM CryptoPayments
     WHERE userid = :loginId AND provider = :provider AND direction = 'deposit' ORDER BY uid DESC LIMIT 10`,
    { loginId: user.LoginId, provider: PROVIDER });
  res.json(rows.map((r) => ({
    orderId: r.order_id,
    amount: decimalJson(r.amount),
    coinAmount: r.payer_amount,
    coin: r.payer_currency,
    network: r.network,
    txids: r.txid ? r.txid.split(',') : [],
    txLinks: (r.txid ? r.txid.split(',') : [])
      .map((hash) => ({ hash, url: onchain.explorerTxUrl(r.network, hash) }))
      .filter((t) => t.url),
    createdAt: dbDate(r.created_at),
  })));
});
