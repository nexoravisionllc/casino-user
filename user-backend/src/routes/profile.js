import express from 'express';
import { db } from '../db.js';
import { currentUserId, requireAuth } from '../lib/auth.js';
import { dbDate } from '../lib/format.js';
import { bodyOf } from '../lib/http.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { notifyEvent } from '../services/notify.js';

/**
 * The signed-in player's own profile: name, email and the bank details
 * withdrawals are paid to, plus a password change. The login id is fixed.
 *
 * Changing the email or bank details (where money is sent) needs the current
 * password, so a stolen session alone cannot redirect withdrawals, and is
 * refused while a withdrawal is waiting for review, so the admin always pays
 * the details the request was made with. Business outcomes are HTTP 200 with
 * { success, message }, like the other player endpoints.
 */
export const router = express.Router();
router.use(requireAuth);

const LIMITS = { name: 64, email: 128, bankName: 64, bankAccount: 64, bankMaster: 64 };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 6;
// One line of printable text (no control characters).
const PRINTABLE = /^[^\p{C}]*$/u;

const SENSITIVE = ['email', 'bankName', 'bankAccount', 'bankMaster'];

const toProfile = (u) => ({
  name: u.Name,
  loginId: u.LoginId,
  email: u.Email ?? '',
  bankName: u.BankName ?? '',
  bankAccount: u.BankAccount ?? '',
  bankMaster: u.BankMaster ?? '',
  createdAt: dbDate(u.CreatedAt),
});

const PROFILE_COLUMNS = 'Uid, Name, LoginId, Password, Email, BankName, BankAccount, BankMaster, Status, CreatedAt';

router.get('/', async (req, res) => {
  const [user] = await db.query(`SELECT ${PROFILE_COLUMNS} FROM Users WHERE Uid = :uid LIMIT 1`, { uid: currentUserId(req) });
  if (!user || String(user.Status).toLowerCase() !== 'active') return res.status(401).end();
  res.json(toProfile(user));
});

/** Update name, email and bank details. Body: { name, email, bankName, bankAccount, bankMaster, currentPassword }. */
router.post('/', async (req, res) => {
  const body = bodyOf(req);
  const input = {};
  for (const [field, max] of Object.entries(LIMITS)) {
    const value = (body.optionalStr(field) ?? '').trim();
    if (value.length > max) return res.json({ success: false, message: `${label(field)} must be at most ${max} characters.` });
    if (!PRINTABLE.test(value)) return res.json({ success: false, message: `${label(field)} contains characters that are not allowed.` });
    input[field] = value;
  }
  if (!input.name) return res.json({ success: false, message: 'Name is required.' });
  if (input.email && !EMAIL.test(input.email)) return res.json({ success: false, message: 'Enter a valid email address.' });
  const currentPassword = body.optionalStr('currentPassword') ?? '';

  const result = await db.transaction(async (tx) => {
    const [user] = await tx.query(`SELECT ${PROFILE_COLUMNS} FROM Users WHERE Uid = :uid FOR UPDATE`, { uid: currentUserId(req) });
    if (!user || String(user.Status).toLowerCase() !== 'active') return { status: 401 };

    const current = toProfile(user);
    const changed = SENSITIVE.filter((f) => input[f] !== current[f]);
    if (input.name === current.name && !changed.length) return { body: { success: true, message: 'Nothing to update.', profile: current } };

    if (changed.length) {
      if (!currentPassword) return { body: { success: false, message: 'Enter your current password to change your email or bank details.' } };
      if (!(await verifyPassword(currentPassword, user.Password))) return { body: { success: false, message: 'Your current password is incorrect.' } };
      if (changed.some((f) => f !== 'email')) {
        const [pending] = await tx.query(
          "SELECT 1 FROM Transactions WHERE userid = :loginId AND type = 'withdraw' AND status IN ('pending', 'processing') LIMIT 1",
          { loginId: user.LoginId });
        if (pending) return { body: { success: false, message: 'You have a withdrawal waiting for review. Bank details can be changed once it is processed.' } };
      }
    }

    await tx.query(
      `UPDATE Users SET Name = :name, Email = :email, BankName = :bankName, BankAccount = :bankAccount, BankMaster = :bankMaster,
                        UpdatedAt = :now WHERE Uid = :uid`,
      {
        name: input.name, email: input.email || null, bankName: input.bankName || null,
        bankAccount: input.bankAccount || null, bankMaster: input.bankMaster || null, now: new Date(), uid: user.Uid,
      });
    return { body: { success: true, message: 'Your profile has been updated.', profile: { ...current, ...input } } };
  });

  if (result.status) return res.status(result.status).end();
  res.json(result.body);
});

/** Change the password. Body: { currentPassword, newPassword }. */
router.post('/password', async (req, res) => {
  const body = bodyOf(req);
  const currentPassword = body.optionalStr('currentPassword') ?? '';
  const newPassword = body.optionalStr('newPassword') ?? '';
  if (!currentPassword) return res.json({ success: false, message: 'Enter your current password.' });
  if (newPassword.length < MIN_PASSWORD) return res.json({ success: false, message: `The new password must be at least ${MIN_PASSWORD} characters.` });
  if (newPassword.length > 128) return res.json({ success: false, message: 'The new password must be at most 128 characters.' });
  if (newPassword === currentPassword) return res.json({ success: false, message: 'The new password must be different from the current one.' });

  const [user] = await db.query('SELECT Uid, Password, Status FROM Users WHERE Uid = :uid LIMIT 1', { uid: currentUserId(req) });
  if (!user || String(user.Status).toLowerCase() !== 'active') return res.status(401).end();
  if (!(await verifyPassword(currentPassword, user.Password))) return res.json({ success: false, message: 'Your current password is incorrect.' });

  await db.query('UPDATE Users SET Password = :password, UpdatedAt = :now WHERE Uid = :uid',
    { password: await hashPassword(newPassword), now: new Date(), uid: user.Uid });
  res.json({ success: true, message: 'Your password has been changed.' });
  // A heads-up on every device, in case it was not the player.
  const [who] = await db.query('SELECT LoginId FROM Users WHERE Uid = :uid', { uid: user.Uid });
  if (who) notifyEvent(who.LoginId, 'password-changed');
});

function label(field) {
  return { name: 'Name', email: 'Email', bankName: 'Bank name', bankAccount: 'Bank account', bankMaster: 'Account holder' }[field];
}
