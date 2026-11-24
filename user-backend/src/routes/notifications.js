import express from 'express';
import { config } from '../config.js';
import { db } from '../db.js';
import { currentUserId, requireAuth } from '../lib/auth.js';
import { longJson } from '../lib/decimal.js';
import { dbDate } from '../lib/format.js';
import { RawNumber, bodyOf } from '../lib/http.js';
import { NOTICES, notifyEvent, pushEnabled } from '../services/notify.js';

/**
 * Player notifications: the bell list, read state, and Web Push subscriptions.
 * POST /internal is server-to-server (the admin backend), authenticated with
 * the shared NOTIFY_SECRET.
 */
export const router = express.Router();

const LIST_LIMIT = 30;

// Bodies are parsed losslessly (numbers arrive as RawNumber); turn them back
// into plain values for these small payloads.
const plain = (v) => (v instanceof RawNumber ? Number(v.source)
  : Array.isArray(v) ? v.map(plain)
  : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)]))
  : v);
const MAX_SUBSCRIPTIONS_PER_USER = 10;

/** Admin backend -> notify a player about an event. Body: { loginId, event, details }. */
router.post('/internal', async (req, res) => {
  const secret = config.adminBackend.notifySecret;
  if (!secret || (req.get('x-notify-secret') ?? '') !== secret) return res.status(401).end();
  const body = bodyOf(req);
  const loginId = body.optionalStr('loginId');
  const event = body.optionalStr('event');
  const details = req.body?.details && typeof req.body.details === 'object' ? plain(req.body.details) : {};
  if (!loginId || !event || !NOTICES[event]) return res.status(400).json({ message: 'loginId and a known event are required.' });
  res.json(await notifyEvent(loginId, event, details));
});

router.use(requireAuth);

async function loginOf(req) {
  const [u] = await db.query('SELECT LoginId FROM Users WHERE Uid = :uid LIMIT 1', { uid: currentUserId(req) });
  return u?.LoginId ?? null;
}

/** Latest notifications and the unread count. */
router.get('/', async (req, res) => {
  const loginId = await loginOf(req);
  if (!loginId) return res.status(401).end();
  const rows = await db.query(
    `SELECT uid, type, title, body, url, read_at, created_at FROM Notifications
     WHERE userid = :loginId ORDER BY uid DESC LIMIT ${LIST_LIMIT}`, { loginId });
  const [{ n }] = await db.query('SELECT COUNT(*) AS n FROM Notifications WHERE userid = :loginId AND read_at IS NULL', { loginId });
  res.json({
    unread: Number(n),
    items: rows.map((r) => ({
      id: longJson(r.uid), type: r.type, title: r.title, body: r.body, url: r.url ?? null,
      read: r.read_at != null, createdAt: dbDate(r.created_at),
    })),
  });
});

/** Mark notifications read: body { ids: [...] }, or {} for all of them. */
router.post('/read', async (req, res) => {
  const loginId = await loginOf(req);
  if (!loginId) return res.status(401).end();
  const ids = Array.isArray(req.body?.ids) ? plain(req.body.ids).map(Number).filter((x) => Number.isSafeInteger(x) && x > 0).slice(0, 100) : null;
  const now = new Date();
  if (ids && !ids.length) return res.json({ success: true });
  await db.query(
    `UPDATE Notifications SET read_at = :now WHERE userid = :loginId AND read_at IS NULL${ids ? ' AND uid IN (:ids)' : ''}`,
    { now, loginId, ids });
  res.json({ success: true });
});

/** What the browser needs to subscribe. */
router.get('/push/key', (req, res) => {
  res.json({ enabled: pushEnabled(), publicKey: pushEnabled() ? config.webPush.publicKey : null });
});

const PUSH_HOST = /^https:\/\/[a-z0-9.-]+(:\d+)?\//i;

/** Save this browser's push subscription. Body: the PushSubscription JSON. */
router.post('/push/subscribe', async (req, res) => {
  const loginId = await loginOf(req);
  if (!loginId) return res.status(401).end();
  if (!pushEnabled()) return res.json({ success: false, message: 'Push notifications are not available.' });
  const sub = req.body ?? {};
  const endpoint = typeof sub.endpoint === 'string' ? sub.endpoint : '';
  const p256dh = typeof sub.keys?.p256dh === 'string' ? sub.keys.p256dh : '';
  const auth = typeof sub.keys?.auth === 'string' ? sub.keys.auth : '';
  if (!PUSH_HOST.test(endpoint) || endpoint.length > 768 || !p256dh || p256dh.length > 128 || !auth || auth.length > 64)
    return res.status(400).json({ success: false, message: 'Invalid push subscription.' });

  const now = new Date();
  const userAgent = (req.get('user-agent') ?? '').slice(0, 256) || null;
  // The same browser may have been signed in as another player before: it now belongs to this one.
  await db.query(
    `INSERT INTO PushSubscriptions (userid, endpoint, p256dh, auth, user_agent, created_at)
     VALUES (:loginId, :endpoint, :p256dh, :auth, :userAgent, :now)
     ON DUPLICATE KEY UPDATE userid = VALUES(userid), p256dh = VALUES(p256dh), auth = VALUES(auth),
                             user_agent = VALUES(user_agent), created_at = VALUES(created_at)`,
    { loginId, endpoint, p256dh, auth, userAgent, now });
  // Keep only the newest few devices per player.
  const extra = await db.query(
    `SELECT uid FROM PushSubscriptions WHERE userid = :loginId ORDER BY created_at DESC, uid DESC LIMIT 1000 OFFSET ${MAX_SUBSCRIPTIONS_PER_USER}`,
    { loginId });
  if (extra.length) await db.query('DELETE FROM PushSubscriptions WHERE uid IN (:ids)', { ids: extra.map((r) => r.uid) });
  res.json({ success: true });
});

/** Forget this browser (turned off, or signing out). Body: { endpoint }. */
router.post('/push/unsubscribe', async (req, res) => {
  const loginId = await loginOf(req);
  if (!loginId) return res.status(401).end();
  const endpoint = typeof req.body?.endpoint === 'string' ? req.body.endpoint : '';
  if (endpoint) await db.query('DELETE FROM PushSubscriptions WHERE endpoint = :endpoint AND userid = :loginId', { endpoint, loginId });
  res.json({ success: true });
});
