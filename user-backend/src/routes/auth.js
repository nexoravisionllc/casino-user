import express from 'express';
import { config } from '../config.js';
import { db, isUniqueViolation } from '../db.js';
import { createToken, currentUserId, requireAuth } from '../lib/auth.js';
import { Decimal, decimalJson, longJson } from '../lib/decimal.js';
import { bodyOf, isBlank } from '../lib/http.js';
import { hashPassword, verifyPassword } from '../lib/password.js';

export const router = express.Router();

/** Authenticate with login id and password only. */
router.post('/login', async (req, res) => {
  const body = bodyOf(req);
  const loginId = body.requiredStr('LoginId');
  const password = body.requiredStr('Password');
  if (isBlank(loginId) || isBlank(password))
    return res.status(400).json({ message: 'Login id and password are required.' });

  const [user] = await db.query(
    'SELECT Uid, Name, LoginId, Password, Balance, Point, Status FROM Users WHERE LoginId = :loginId LIMIT 1',
    { loginId });
  if (!user || !(await verifyPassword(password, user.Password)))
    return res.status(401).json({ message: 'Invalid login id or password.' });

  if (String(user.Status).toLowerCase() !== 'active')
    return res.status(401).json({ message: 'This account is not active.' });

  res.json({
    token: createToken(user),
    user: {
      uid: longJson(user.Uid),
      name: user.Name,
      loginId: user.LoginId,
      balance: decimalJson(user.Balance),
      point: decimalJson(user.Point),
      status: user.Status,
    },
  });
});

/** The signed-in user's current profile and wallet (re-read on page load/focus). */
router.get('/me', requireAuth, async (req, res) => {
  const [user] = await db.query(
    'SELECT Uid, Name, LoginId, Balance, Point, Status FROM Users WHERE Uid = :uid LIMIT 1',
    { uid: currentUserId(req) });
  if (!user || String(user.Status).toLowerCase() !== 'active') return res.status(401).end();

  res.json({
    uid: longJson(user.Uid),
    name: user.Name,
    loginId: user.LoginId,
    balance: decimalJson(user.Balance),
    point: decimalJson(user.Point),
    status: user.Status,
  });
});

// A blank referral attaches the user under the administrator (the only partner
// with no parent); otherwise the referral code must match a partner.
async function findReferrer(referral) {
  if (isBlank(referral)) {
    const [admin] = await db.query('SELECT Uid FROM Partners WHERE PartnerId IS NULL ORDER BY Role, Uid LIMIT 1');
    return admin ? { uid: admin.Uid } : { error: 'No administrator account is configured.' };
  }
  const [partner] = await db.query('SELECT Uid FROM Partners WHERE ReferralId = :referral LIMIT 1', { referral });
  return partner ? { uid: partner.Uid } : { error: 'The referral ID does not exist.' };
}

/**
 * Submit a sign-up request. The user is created "Pending" (awaiting admin
 * approval), or "Active" in demo mode (DEV_MODE), and is not signed in. Business outcomes are always HTTP 200; the
 * body's `ok` flag reports the result.
 */
router.post('/register', async (req, res) => {
  const body = bodyOf(req);
  const nameInput = body.requiredStr('Name');
  const loginInput = body.requiredStr('LoginId');
  const password = body.requiredStr('Password');
  const referral = body.optionalStr('ReferralId')?.trim();
  const email = body.optionalStr('Email');
  const bankName = body.optionalStr('BankName');
  const bankAccount = body.optionalStr('BankAccount');
  const bankMaster = body.optionalStr('BankMaster');

  if (isBlank(nameInput) || isBlank(loginInput) || isBlank(password))
    return res.json({ ok: false, message: 'Name, login id and password are required.' });

  const loginId = loginInput.trim();
  const taken = { ok: false, message: `The login ID "${loginId}" is already taken.` };

  const [existing] = await db.query('SELECT 1 FROM Users WHERE LoginId = :loginId LIMIT 1', { loginId });
  if (existing) return res.json(taken);

  const referrer = await findReferrer(referral);
  if (referrer.error) return res.json({ ok: false, message: referrer.error });

  const now = new Date();
  // Demo mode: the account is approved at once and starts with a credit,
  // recorded as a finished deposit.
  const status = config.devMode ? 'Active' : 'Pending';
  const credit = config.devMode ? Decimal.from(config.devSignupCredit).rounded(2) : null;
  const passwordHash = await hashPassword(password);
  try {
    await db.transaction(async (tx) => {
      await tx.query(
        `INSERT INTO Users (Name, LoginId, Password, PartnerId, Email, BankName, BankAccount, BankMaster,
                            Balance, Point, Status, CreatedAt, UpdatedAt)
         VALUES (:name, :loginId, :password, :partnerId, :email, :bankName, :bankAccount, :bankMaster,
                 :balance, 0, :status, :now, :now)`,
        {
          name: nameInput.trim(), loginId, password: passwordHash, partnerId: referrer.uid,
          email, bankName, bankAccount, bankMaster, balance: credit ? credit.toString() : '0', status, now,
        });
      if (credit?.isPositive) {
        await tx.query(
          `INSERT INTO Transactions (type, status, userid, managerid, amount, beforeamount, afteramount, memo, target_type, created_at, updated_at)
           VALUES ('deposit', 'finished', :loginId, NULL, :amount, 0, :amount, 'Demo sign-up credit', 'user', :now, :now)`,
          { loginId, amount: credit.toString(), now });
      }
    });
  } catch (err) {
    // Two sign-ups raced for the same login id.
    if (isUniqueViolation(err)) return res.json(taken);
    throw err;
  }

  res.json({
    ok: true,
    message: config.devMode
      ? `Your account is ready. You can sign in now.${credit?.isPositive ? ` Demo credit of $${credit.toString()} has been added to your account.` : ''}`
      : 'Your sign-up request has been submitted and is pending approval.',
  });
});
