import express from 'express';
import { config } from '../config.js';
import { db } from '../db.js';
import { currentUserId, requireAuth } from '../lib/auth.js';
import { Decimal, decimalJson, longJson } from '../lib/decimal.js';
import { dbDate } from '../lib/format.js';
import { bodyOf, jsonBody } from '../lib/http.js';
import { txRefsFromMemo } from '../services/onchain.js';
import { notifyWallet } from '../services/walletPush.js';

export const router = express.Router();

router.use(requireAuth, jsonBody);

const AMOUNT_NOT_POSITIVE = { success: false, message: 'Enter an amount greater than zero.' };
const USER_NOT_FOUND = { success: false, message: 'User not found.' };

// Every wallet write locks the user row first, so two simultaneous requests
// cannot both spend the same balance or both pass the "pending" check.
async function lockUser(tx, req) {
  const [row] = await tx.query(
    'SELECT LoginId, Balance, Point FROM Users WHERE Uid = :uid FOR UPDATE',
    { uid: currentUserId(req) });
  return row ? { loginId: row.LoginId, balance: Decimal.from(row.Balance), point: Decimal.from(row.Point) } : null;
}

/** The logged-in user's own transactions, newest first. */
router.get('/', async (req, res) => {
  const [user] = await db.query('SELECT LoginId FROM Users WHERE Uid = :uid LIMIT 1', { uid: currentUserId(req) });
  if (!user) return res.json([]);

  const rows = await db.query(
    `SELECT uid, type, amount, beforeamount, afteramount, status, managerid, memo, created_at
     FROM Transactions WHERE userid = :loginId ORDER BY uid DESC`,
    { loginId: user.LoginId });

  res.json(rows.map((t) => ({
    uid: longJson(t.uid),
    type: t.type,
    amount: decimalJson(t.amount),
    beforeAmount: decimalJson(t.beforeamount),
    afterAmount: decimalJson(t.afteramount),
    status: t.status,
    managerId: t.managerid ?? null,
    memo: t.memo ?? null,
    txLinks: txRefsFromMemo(t.memo) ?? [],
    createdAt: dbDate(t.created_at),
  })));
});

// Deposit and withdraw share one flow: a pending request an admin later settles.
// Business outcomes are HTTP 200 with a success flag, which the client reads.
function pendingRequest(type, label, checkFunds) {
  return async (req, res) => {
    const amount = bodyOf(req).decimal('Amount');
    if (!amount.isPositive) return res.json(AMOUNT_NOT_POSITIVE);

    const result = await db.transaction(async (tx) => {
      const user = await lockUser(tx, req);
      if (!user) return USER_NOT_FOUND;

      const refusal = checkFunds?.(amount, user);
      if (refusal) return { success: false, message: refusal };

      // Only one pending request of each type per user at a time.
      const [pending] = await tx.query(
        "SELECT 1 FROM Transactions WHERE userid = :loginId AND type = :type AND status = 'pending' LIMIT 1",
        { loginId: user.loginId, type });
      if (pending) return { success: false, message: 'Pending request exists.' };

      // The top-level administrator handles the request.
      const [admin] = await tx.query('SELECT LoginId FROM Partners WHERE Role = 1 ORDER BY Uid LIMIT 1');

      const { insertId } = await tx.query(
        `INSERT INTO Transactions (type, status, userid, managerid, amount, beforeamount, afteramount, memo, target_type, created_at, updated_at)
         VALUES (:type, 'pending', :loginId, :managerId, :amount, :before, NULL, NULL, 'user', :now, NULL)`,
        { type, loginId: user.loginId, managerId: admin?.LoginId ?? null, amount: amount.toString(), before: user.balance.toString(), now: new Date() });

      return { success: true, message: `${label} requested successfully.`, uid: longJson(insertId) };
    });
    res.json(result);
  };
}

router.post('/deposit', pendingRequest('deposit', 'Deposit'));

router.post('/withdraw', (req, res, next) => (config.devMode
  ? res.json({ success: false, message: 'Withdrawals are disabled in demo mode.' })
  : next()));
router.post('/withdraw', pendingRequest('withdraw', 'Withdraw', (amount, user) =>
  (amount.greaterThan(user.balance) ? 'Withdrawal amount exceeds your available balance.' : null)));

/**
 * Convert points into balance at 1:1, immediately. The point side is recorded in
 * PointHistory and the balance side in Transactions (status "finished").
 */
router.post('/point-convert', async (req, res) => {
  const amount = bodyOf(req).decimal('Amount');
  if (!amount.isPositive) return res.json(AMOUNT_NOT_POSITIVE);

  const outcome = await db.transaction(async (tx) => {
    const user = await lockUser(tx, req);
    if (!user) return { body: USER_NOT_FOUND };
    if (amount.greaterThan(user.point)) return { body: { success: false, message: "You don't have enough points." } };

    const now = new Date();
    const point = user.point.minus(amount);
    const balance = user.balance.plus(amount);
    const memo = `${user.loginId} converts ${amount}P to ${amount}$`;

    await tx.query(
      'UPDATE Users SET Point = :point, Balance = :balance, UpdatedAt = :now WHERE LoginId = :loginId',
      { point: point.toString(), balance: balance.toString(), now, loginId: user.loginId });

    await tx.query(
      `INSERT INTO PointHistory (type, amount, beforeamount, afteramount, userid, memo, target_type, created_at)
       VALUES ('point-convert', :amount, :before, :after, :loginId, :memo, 'user', :now)`,
      { amount: amount.toString(), before: user.point.toString(), after: point.toString(), loginId: user.loginId, memo, now });

    await tx.query(
      `INSERT INTO Transactions (type, status, userid, managerid, amount, beforeamount, afteramount, memo, target_type, created_at, updated_at)
       VALUES ('point-convert', 'finished', :loginId, NULL, :amount, :before, :after, :memo, 'user', :now, :now)`,
      { amount: amount.toString(), before: user.balance.toString(), after: balance.toString(), loginId: user.loginId, memo, now });

    return {
      body: { success: true, message: 'Points converted to balance successfully.' },
      wallet: { loginId: user.loginId, balance, point },
    };
  });

  // Push the new balance/point so the front-page header updates live.
  if (outcome.wallet) await notifyWallet(outcome.wallet.loginId, outcome.wallet.balance, outcome.wallet.point);
  res.json(outcome.body);
});
