import webpush from 'web-push';
import { config } from '../config.js';
import { db } from '../db.js';
import { log } from '../lib/log.js';

/**
 * Player notifications for important account events. Each one is stored
 * (the bell on the player site lists them) and sent as a Web Push to every
 * browser the player allowed notifications in. Sending never throws: a failed
 * push only logs, and a subscription the push service reports as gone is
 * removed.
 */

export const pushEnabled = () => Boolean(config.webPush.publicKey && config.webPush.privateKey);

if (pushEnabled()) webpush.setVapidDetails(config.webPush.subject, config.webPush.publicKey, config.webPush.privateKey);

const clip = (s, n) => String(s ?? '').slice(0, n);

/**
 * Notify a player. `notice` is { type, title, body, url? } (url is a path on the
 * player site such as "/money/transaction"). Returns { stored, pushed }.
 */
export async function notifyUser(loginId, notice) {
  const type = clip(notice.type || 'info', 32);
  const title = clip(notice.title, 128);
  const body = clip(notice.body, 512);
  const url = notice.url && notice.url.startsWith('/') ? clip(notice.url, 256) : null;
  let insertId;
  try {
    ({ insertId } = await db.query(
      `INSERT INTO Notifications (userid, type, title, body, url, created_at)
       VALUES (:loginId, :type, :title, :body, :url, :now)`,
      { loginId, type, title, body, url, now: new Date() }));
  } catch (err) {
    log.warn(`Could not store a notification for ${loginId}.`, err);
    return { stored: false, pushed: 0 };
  }
  const pushed = await pushToUser(loginId, { id: String(insertId), type, title, body, url: url ?? '/' });
  return { stored: true, pushed };
}

async function pushToUser(loginId, payload) {
  if (!pushEnabled()) return 0;
  let subs;
  try {
    subs = await db.query('SELECT uid, endpoint, p256dh, auth FROM PushSubscriptions WHERE userid = :loginId', { loginId });
  } catch (err) {
    log.warn(`Could not read push subscriptions for ${loginId}.`, err);
    return 0;
  }
  const data = JSON.stringify(payload);
  const results = await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, data,
        { TTL: 24 * 3600, urgency: 'high', timeout: 10_000 });
      await db.query('UPDATE PushSubscriptions SET last_used_at = :now WHERE uid = :uid', { now: new Date(), uid: s.uid });
      return 1;
    } catch (err) {
      // 404 / 410: the browser unsubscribed or the subscription expired.
      if (err.statusCode === 404 || err.statusCode === 410) {
        await db.query('DELETE FROM PushSubscriptions WHERE uid = :uid', { uid: s.uid }).catch(() => {});
      } else {
        log.warn(`Push to ${loginId} failed (HTTP ${err.statusCode ?? '-'}).`, err);
      }
      return 0;
    }
  }));
  return results.reduce((a, b) => a + b, 0);
}

// --------------------------------------------------------------- messages

const usd = (n) => `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pts = (n) => `${Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 })} points`;
const HISTORY = '/money/transaction';

/** The notice for each event. `d` carries the event's details. */
export const NOTICES = {
  'withdraw-accepted': (d) => ({
    type: 'withdraw', url: HISTORY, title: 'Withdrawal sent',
    body: `Your withdrawal #${d.uid} of ${usd(d.amount)} has been sent${d.toWallet ? ' to your wallet' : ''}.`,
  }),
  'withdraw-rejected': (d) => ({
    type: 'withdraw', url: HISTORY, title: 'Withdrawal not approved',
    body: `Your withdrawal #${d.uid} of ${usd(d.amount)} was not approved. Reason: ${d.reason}`,
  }),
  'deposit-accepted': (d) => ({
    type: 'deposit', url: HISTORY, title: 'Deposit approved',
    body: `Your deposit of ${usd(d.amount)} has been added to your balance.`,
  }),
  'deposit-rejected': (d) => ({
    type: 'deposit', url: HISTORY, title: 'Deposit not approved',
    body: `Your deposit request of ${usd(d.amount)} was not approved.${d.reason ? ` Reason: ${d.reason}` : ''}`,
  }),
  'deposit-reversed': (d) => ({
    type: 'deposit', url: HISTORY, title: 'Deposit reversed',
    body: `Your deposit of ${usd(d.amount)} was reversed and taken back from your balance.`,
  }),
  'crypto-deposit': (d) => ({
    type: 'deposit', url: HISTORY, title: 'Deposit received',
    body: `${d.coins} ${d.coin} received. ${usd(d.amount)} has been added to your balance.`,
  }),
  'balance-adjusted': (d) => ({
    type: 'balance', url: HISTORY,
    title: d.field === 'point'
      ? (d.mode === 'pay' ? 'Points added' : 'Points deducted')
      : (d.mode === 'pay' ? 'Balance credited' : 'Balance deducted'),
    body: d.field === 'point'
      ? `${pts(d.amount)} ${d.mode === 'pay' ? 'added to' : 'deducted from'} your account.`
      : `${usd(d.amount)} ${d.mode === 'pay' ? 'added to' : 'deducted from'} your balance.`,
  }),
  'password-changed': () => ({
    type: 'security', url: '/account/profile', title: 'Your password was changed',
    body: 'If you did not make this change, contact support right away.',
  }),
};

/** Notify a player about a named event (see NOTICES). Never throws. */
export function notifyEvent(loginId, event, details = {}) {
  const make = NOTICES[event];
  if (!make) {
    log.warn(`Unknown notification event "${event}".`);
    return Promise.resolve({ stored: false, pushed: 0 });
  }
  return notifyUser(loginId, make(details)).catch((err) => {
    log.warn(`Notification "${event}" for ${loginId} failed.`, err);
    return { stored: false, pushed: 0 };
  });
}
