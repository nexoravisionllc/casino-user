import express from 'express';
import { db } from '../db.js';
import { currentUserId, optionalAuth } from '../lib/auth.js';
import { longJson } from '../lib/decimal.js';
import { ValidationError, clamp, isBlank, queryInt, queryStr } from '../lib/http.js';
import { fortuneGate } from '../services/fortuneGate.js';

export const router = express.Router();

const CARD_COLUMNS = 'g.uid, g.name, p.name AS provider, g.image_url, g.review';

// A game's provider is the row matching (provider id, company); it may not exist.
const WITH_PROVIDER = 'FROM Games g LEFT JOIN Providers p ON p.provider_id = g.providerid AND p.company = g.company';

// Hot Games are slot games only. A NULL category counts as "not Live".
const NOT_LIVE = "(g.category <> 'Live' OR g.category IS NULL)";

// uid breaks ties in popularity so that pages never overlap.
const BY_POPULARITY = 'ORDER BY g.review DESC, g.uid';

const toCard = (r) => ({
  uid: longJson(r.uid),
  name: r.name,
  provider: r.provider ?? null,
  imageUrl: r.image_url ?? null,
  review: r.review,
});

const paged = (items, total, page, pageSize) => ({
  items,
  total,
  page,
  pageSize,
  totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
});

/** Top games by popularity, with provider name. Public. */
router.get('/hot', async (req, res) => {
  const count = clamp(queryInt(req, 'count', 20), 1, 100);
  const rows = await db.query(
    `SELECT ${CARD_COLUMNS} ${WITH_PROVIDER} WHERE ${NOT_LIVE} ${BY_POPULARITY} LIMIT :count`,
    { count });
  res.json(rows.map(toCard));
});

/** Slots for the front page; skips the top 20 (shown in Hot Games). Public. */
router.get('/slots', async (req, res) => {
  const count = clamp(queryInt(req, 'count', 50), 1, 200);
  const rows = await db.query(
    `SELECT ${CARD_COLUMNS} ${WITH_PROVIDER} WHERE g.category = 'Slots' ${BY_POPULARITY} LIMIT :count OFFSET 20`,
    { count });
  res.json(rows.map(toCard));
});

/** Paginated top games with an optional name search; backs /hotgame. Public. */
router.get('/top', async (req, res) => {
  const page = Math.max(1, queryInt(req, 'page', 1));
  const pageSize = clamp(queryInt(req, 'pageSize', 40), 1, 100);
  const search = queryStr(req, 'search');

  let where = NOT_LIVE;
  const params = { pageSize, offset: (page - 1) * pageSize };
  if (!isBlank(search)) {
    // ESCAPE '': a backslash in the search is literal, as it is on SQL Server.
    where += " AND g.name LIKE :term ESCAPE ''";
    params.term = `%${search.trim()}%`;
  }

  const [{ total }] = await db.query(`SELECT COUNT(*) AS total ${WITH_PROVIDER} WHERE ${where}`, params);
  const rows = await db.query(
    `SELECT ${CARD_COLUMNS} ${WITH_PROVIDER} WHERE ${where} ${BY_POPULARITY} LIMIT :pageSize OFFSET :offset`,
    params);
  res.json(paged(rows.map(toCard), Number(total), page, pageSize));
});

/** All slot games for the /slot page (the client filters and sorts). Public. */
router.get('/list', async (req, res) => {
  const rows = await db.query(`SELECT ${CARD_COLUMNS} ${WITH_PROVIDER} WHERE g.category = 'Slots' ${BY_POPULARITY}`);
  res.json(rows.map(toCard));
});

/** Provider names for the dropdown. Public. */
router.get('/providers', async (req, res) => {
  const rows = await db.query('SELECT name FROM Providers ORDER BY provider_id, uid');
  res.json(rows.map((r) => r.name));
});

/** Provider cards (logo + name) for the /providers page. Public. */
router.get('/provider-cards', async (req, res) => {
  const rows = await db.query('SELECT provider_id, name, image_url FROM Providers ORDER BY provider_id, uid');
  res.json(rows.map((r) => ({ providerId: r.provider_id, name: r.name, imageUrl: r.image_url ?? null })));
});

/** Paginated games for one provider (by name). Public. */
router.get('/by-provider/:name', async (req, res) => {
  const page = Math.max(1, queryInt(req, 'page', 1));
  const pageSize = clamp(queryInt(req, 'pageSize', 40), 1, 100);
  const params = { name: req.params.name, pageSize, offset: (page - 1) * pageSize };
  const from = 'FROM Games g JOIN Providers p ON p.provider_id = g.providerid AND p.company = g.company WHERE p.name = :name';

  const [{ total }] = await db.query(`SELECT COUNT(*) AS total ${from}`, params);
  const rows = await db.query(`SELECT ${CARD_COLUMNS} ${from} ${BY_POPULARITY} LIMIT :pageSize OFFSET :offset`, params);
  res.json(paged(rows.map(toCard), Number(total), page, pageSize));
});

// The caller's FortuneGate user_code, created and cached on first launch.
// Null for anonymous callers. Throws if the create call fails.
async function resolveUserCode(req) {
  const uid = currentUserId(req);
  if (uid == null) return null;

  const [user] = await db.query('SELECT Uid, LoginId, UserCode FROM Users WHERE Uid = :uid LIMIT 1', { uid });
  if (!user) return null;
  if (user.UserCode != null) return String(user.UserCode);

  const code = await fortuneGate.createUser(user.LoginId);
  if (BigInt(code) <= 0n) throw new Error('Failed to create FortuneGate user.');
  await db.query('UPDATE Users SET UserCode = :code, UpdatedAt = :now WHERE Uid = :uid', { code, now: new Date(), uid });
  return code;
}

// Shared launch flow: a sign-in prompt, the play URL, or a 502.
async function sendLaunch(req, res, symbol, providerId) {
  try {
    const userCode = await resolveUserCode(req);
    if (userCode == null) return res.json({ requireLogin: true, message: 'Please sign in to play.' });

    const url = await fortuneGate.getGameUrl(symbol, providerId, userCode);
    if (!url) return res.status(502).json({ message: 'Game launch is unavailable right now.' });
    res.json({ url });
  } catch {
    res.status(502).json({ message: 'Game launch is unavailable right now.' });
  }
}

/** Launch a game by symbol + provider id (hardcoded front-page tiles). Public. */
router.get('/launch-symbol', optionalAuth, async (req, res) => {
  const symbol = queryStr(req, 'symbol');
  const providerId = queryInt(req, 'providerId', 1);
  if (!symbol) throw new ValidationError('symbol', 'The symbol field is required.');
  if (isBlank(symbol)) return res.status(400).json({ message: 'Missing game symbol.' });
  await sendLaunch(req, res, symbol, providerId);
});

/** Launch a game by uid; anything but an integer uid is a 404. Public. */
router.get('/launch/:uid', optionalAuth, async (req, res, next) => {
  if (!/^-?\d{1,18}$/.test(req.params.uid)) return next('route');

  const [game] = await db.query('SELECT symbol, providerid, company FROM Games WHERE uid = :uid LIMIT 1', { uid: req.params.uid });
  if (!game) return res.status(404).json({ message: 'Game not found.' });
  if (game.company.toLowerCase() !== 'fortunegate')
    return res.status(400).json({ message: 'This game cannot be launched.' });

  await sendLaunch(req, res, game.symbol, game.providerid);
});

/** Game-visibility settings (Slots / Live Casino / Sports). Public. */
router.get('/settings', async (req, res) => {
  const rows = await db.query('SELECT Name, Show_Enable FROM GameSetting ORDER BY uid');
  res.json(rows.map((r) => ({ name: r.Name, showEnable: Boolean(r.Show_Enable) })));
});
