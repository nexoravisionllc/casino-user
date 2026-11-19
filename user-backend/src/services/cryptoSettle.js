import { Decimal } from '../lib/decimal.js';
import { log } from '../lib/log.js';

/** Final payout status that means the coins were sent. */
export const PAYOUT_PAID = new Set(['paid']);

/**
 * Settle a payout that reached a final status, inside `tx` with the payment row
 * already locked. Only a request still "processing" changes, so repeats are
 * harmless. Returns { wallet } when the balance was refunded.
 */
export async function settlePayout(tx, payment, status, reason, note = null) {
  const [request] = await tx.query(
    'SELECT uid, status, memo FROM Transactions WHERE uid = :uid FOR UPDATE', { uid: payment.transaction_uid });
  if (!request || request.status !== 'processing') return {};
  const now = new Date();

  if (PAYOUT_PAID.has(status)) {
    const memo = note ? `${request.memo ?? ''} · ${note}`.slice(0, 512) : request.memo;
    await tx.query("UPDATE Transactions SET status = 'finished', memo = :memo, updated_at = :now WHERE uid = :uid",
      { memo, now, uid: request.uid });
    log.info(`Crypto withdrawal ${payment.order_id} was paid out.`);
    return {};
  }

  // Not sent: give the amount back and undo the accept's withdrawal totals.
  const [user] = await tx.query(
    'SELECT Uid, LoginId, Balance, Point FROM Users WHERE LoginId = :loginId FOR UPDATE', { loginId: payment.userid });
  const memo = `${request.memo ?? ''} · payout ${reason}, refunded`.slice(0, 512);
  await tx.query("UPDATE Transactions SET status = 'failed', memo = :memo, updated_at = :now WHERE uid = :uid",
    { memo, now, uid: request.uid });
  if (!user) {
    log.warn(`Crypto withdrawal ${payment.order_id} failed but user ${payment.userid} no longer exists; nothing refunded.`);
    return {};
  }

  const amount = Decimal.from(payment.amount);
  const balance = Decimal.from(user.Balance).plus(amount);
  await tx.query(
    `UPDATE Users SET Balance = :balance, WithdrawAmount = WithdrawAmount - :amount,
       WithdrawCount = GREATEST(WithdrawCount - 1, 0), UpdatedAt = :now WHERE Uid = :uid`,
    { balance: balance.toString(), amount: amount.toString(), now, uid: user.Uid });

  log.warn(`Crypto withdrawal ${payment.order_id} ${reason}; refunded ${amount} to ${user.LoginId}.`);
  return { wallet: { loginId: user.LoginId, balance, point: Decimal.from(user.Point) } };
}
