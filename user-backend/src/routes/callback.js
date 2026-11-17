import express from 'express';
import { config } from '../config.js';
import { db } from '../db.js';
import { Decimal, ZERO } from '../lib/decimal.js';
import { bodyOf } from '../lib/http.js';
import { notifyWallet } from '../services/walletPush.js';

/**
 * Seamless wallet callback for the game company (SlotCity / FortuneGate V4).
 * Handles authenticate / balance / bet / win / cancel / status. Every response
 * is HTTP 200 with a { result, status, data } body (result 0 = OK).
 */
export const router = express.Router();

const COMPANY = 'FortuneGate';

// Standard result codes (from the V4 ResultCode enum).
const OK = [0, 'OK'];
const TOKEN_INVALID = [1009, 'TOKEN_INVALID'];
const LOGIN_NOT_ALLOWED = [1013, 'LOGIN_NOT_ALLOWED'];
const CALLBACK_COMMAND_INVALID = [1017, 'CALLBACK_COMMAND_INVALID'];
const USER_NOT_FOUND = [2002, 'USER_NOT_FOUND'];
const BALANCE_NOT_ENOUGH = [2006, 'BALANCE_NOT_ENOUGH'];
const TRANS_NOT_FOUND = [2016, 'TRANS_NOT_FOUND'];
const TRANS_ALREADY_PROCESSED = [2018, 'TRANS_ALREADY_PROCESSED'];

const make = ([result, status], data = {}) => ({ body: { result, status, data } });

function bindRequest(req) {
  const body = bodyOf(req);
  const data = body.object('data');
  return {
    command: body.str('command'),
    timestamp: body.str('timestamp'),
    check: body.str('check'),
    data: {
      account: data.str('account'),
      userCode: data.long('user_code'),
      transId: data.long('trans_id'),
      callId: data.long('call_id'),
      roundId: data.str('round_id'),
      providerId: data.long('provider_id'),
      providerName: data.str('provider_name'),
      gameCode: data.str('game_code'),
      gameName: data.str('game_name'),
      gameType: data.str('game_type'),
      amount: data.decimal('amount'),
    },
  };
}

async function findUser(q, account) {
  const [row] = await q.query(
    'SELECT Uid, LoginId, PartnerId, Balance, Point, Status FROM Users WHERE LoginId = :account LIMIT 1',
    { account });
  return row ? { ...row, Balance: Decimal.from(row.Balance), Point: Decimal.from(row.Point) } : null;
}

async function findBet(q, transId) {
  const [row] = await q.query(
    'SELECT uid, type, amount FROM GameHistory WHERE trans_id = :transId ORDER BY uid LIMIT 1',
    { transId });
  return row ? { uid: row.uid, type: row.type, amount: Decimal.from(row.amount) } : null;
}

const insertGameRow = (q, cb, userId, type, before, after, now) => q.query(
  `INSERT INTO GameHistory (trans_id, round_id, user_id, game_code, game_name, game_type, provider_name,
                            amount, type, beforeamount, afteramount, company, created_at)
   VALUES (:transId, :roundId, :userId, :gameCode, :gameName, :gameType, :providerName,
           :amount, :type, :before, :after, :company, :now)`,
  {
    transId: cb.data.transId,
    roundId: cb.data.roundId,
    userId,
    gameCode: cb.data.gameCode,
    gameName: cb.data.gameName || null,
    gameType: cb.data.gameType || null,
    providerName: cb.data.providerName || null,
    amount: cb.data.amount.toString(),
    type,
    before: before.toString(),
    after: after.toString(),
    company: COMPANY,
    now,
  });

const saveUserBalance = (q, user, now) => q.query(
  'UPDATE Users SET Balance = :balance, UpdatedAt = :now WHERE Uid = :uid',
  { balance: user.Balance.toString(), now, uid: user.Uid });

const insertTransaction = (q, t) => q.query(
  `INSERT INTO Transactions (type, amount, beforeamount, afteramount, status, userid, managerid, memo, created_at, updated_at)
   VALUES (:type, :amount, :before, :after, 'finished', :userId, :managerId, :memo, :now, :now)`,
  t);

async function findPartner(q, column, value) {
  // FOR UPDATE: partners earn from many users at once, so their balance needs its own lock.
  const [row] = await q.query(
    `SELECT Uid, LoginId, PartnerId, Balance, CasinoRate, SlotRate, SportsRate FROM Partners WHERE ${column} = :value LIMIT 1 FOR UPDATE`,
    { value });
  return row ? { ...row, Balance: Decimal.from(row.Balance) } : null;
}

// Which commission rate applies, based on the game type (defaults to slot).
function rateColumn(gameType) {
  const t = gameType.toLowerCase();
  if (t.includes('casino') || t.includes('live')) return 'CasinoRate';
  if (t.includes('sport')) return 'SportsRate';
  return 'SlotRate';
}

/**
 * Pay rolling up the partner chain for a bet. Each partner earns
 * bet x (own rate - downline rate) / 100; the direct upline earns the full rate
 * (the member below has rate 0). The trans_id is carried in the memo so a cancel
 * can find and reverse the payment.
 */
async function applyRollingPayment(q, user, cb, now) {
  const bet = cb.data.amount;
  if (!bet.isPositive) return;
  const column = rateColumn(cb.data.gameType);

  let downlineLoginId = user.LoginId;
  let downlineRate = ZERO;
  let partner = user.PartnerId == null ? null : await findPartner(q, 'Uid', user.PartnerId);

  while (partner) {
    const rate = Decimal.from(partner[column]);
    const roll = bet.times(rate.minus(downlineRate)).percent().rounded(2);
    if (roll.isPositive) {
      const before = partner.Balance;
      partner.Balance = before.plus(roll);
      await q.query('UPDATE Partners SET Balance = :balance, UpdatedAt = :now WHERE Uid = :uid',
        { balance: partner.Balance.toString(), now, uid: partner.Uid });
      await insertTransaction(q, {
        type: 'rolling payment',
        amount: roll.toString(),
        before: before.toString(),
        after: partner.Balance.toString(),
        userId: partner.LoginId,
        managerId: downlineLoginId,
        memo: `${user.LoginId} placed a bet (trans_id ${cb.data.transId}, amount $${bet.toFixed(2)}), so $${bet.toFixed(2)} × (${rate.toFixed(2)}% - ${downlineRate.toFixed(2)}%) / 100 = $${roll.toFixed(2)} paid to ${partner.LoginId}.`,
        now,
      });
    }
    // Move up: the current partner becomes the downline for its parent.
    downlineLoginId = partner.LoginId;
    downlineRate = rate;
    partner = partner.PartnerId == null ? null : await findPartner(q, 'Uid', partner.PartnerId);
  }
}

/** Reverse the rolling paid for a bet's trans_id, recording a "rolling collect" for each. */
async function applyRollingCollect(q, user, transId, now) {
  const payments = await q.query(
    `SELECT userid, managerid, amount FROM Transactions
     WHERE type = 'rolling payment' AND memo IS NOT NULL AND LOCATE(:marker, memo) > 0 ORDER BY uid`,
    { marker: `(trans_id ${transId}, ` });

  for (const pay of payments) {
    const partner = await findPartner(q, 'LoginId', pay.userid);
    if (!partner) continue;

    const amount = Decimal.from(pay.amount);
    const after = partner.Balance.minus(amount);
    await q.query('UPDATE Partners SET Balance = :balance, UpdatedAt = :now WHERE Uid = :uid',
      { balance: after.toString(), now, uid: partner.Uid });
    await insertTransaction(q, {
      type: 'rolling collect',
      amount: amount.toString(),
      before: partner.Balance.toString(),
      after: after.toString(),
      userId: partner.LoginId,
      managerId: pay.managerid,
      memo: `${user.LoginId}'s bet (trans_id ${transId}) was cancelled — rolling collect (reversal): $${amount.toFixed(2)} taken back from ${partner.LoginId}.`,
      now,
    });
  }
}

// The codes listed in `check`, in order; non-numeric entries are ignored.
const checkCodes = (check) => check.split(',').map((s) => s.trim()).filter((s) => /^[+-]?\d+$/.test(s)).map(Number);

const NEEDS_USER = new Set(['authenticate', 'balance', 'bet', 'win', 'cancel']);
const NEEDS_BET = new Set(['cancel', 'status']);
const MOVES_MONEY = new Set(['bet', 'win', 'cancel']);

async function handle(cb, q) {
  const { account, transId, amount } = cb.data;
  let user = null;
  let bet = null;

  // Pre-validation: run the codes in `check` in order and fail fast. A check that
  // needs the user but runs before code 21 fails with a 500, as it always has.
  for (const code of checkCodes(cb.check)) {
    switch (code) {
      case 21: // The user exists
        user = await findUser(q, account);
        if (!user) return make(USER_NOT_FOUND);
        break;
      case 22: // The user is active
        if (user.Status !== 'Active') return make(LOGIN_NOT_ALLOWED);
        break;
      case 31: // The user can cover the amount
        if (user.Balance.lessThan(amount)) return make(BALANCE_NOT_ENOUGH, { balance: user.Balance });
        break;
      case 41: // Duplicate prevention: this trans was already processed
        if (await findBet(q, transId)) return make(TRANS_ALREADY_PROCESSED, { balance: user.Balance });
        break;
      case 42: // The referenced trans must exist (cancel / status)
        bet = await findBet(q, transId);
        if (!bet) return make(TRANS_NOT_FOUND, { balance: user.Balance });
        break;
      default:
        break;
    }
  }

  // Load what the command needs, in case `check` omitted it.
  if (!user && NEEDS_USER.has(cb.command)) {
    user = await findUser(q, account);
    if (!user) return make(USER_NOT_FOUND);
  }
  if (!bet && NEEDS_BET.has(cb.command)) {
    bet = await findBet(q, transId);
    if (!bet) return make(TRANS_NOT_FOUND, { balance: user?.Balance ?? ZERO });
  }

  const now = new Date();
  const wallet = () => ({ loginId: user.LoginId, balance: user.Balance, point: user.Point });

  switch (cb.command) {
    case 'authenticate':
      return make(OK, { account: user.LoginId, balance: user.Balance });

    case 'balance':
      return make(OK, { balance: user.Balance });

    case 'bet': {
      const before = user.Balance;
      user.Balance = before.minus(amount);
      await insertGameRow(q, cb, user.LoginId, 'BET', before, user.Balance, now);
      await saveUserBalance(q, user, now);
      await applyRollingPayment(q, user, cb, now);
      return { ...make(OK, { balance: user.Balance }), wallet: wallet() };
    }

    case 'win': {
      const before = user.Balance;
      const after = before.plus(amount);
      if (amount.isPositive) user.Balance = after;
      await insertGameRow(q, cb, user.LoginId, 'WIN', before, after, now);
      await saveUserBalance(q, user, now);
      return { ...make(OK, { balance: after }), wallet: wallet() };
    }

    case 'cancel': {
      if (bet.type === 'CANCEL') return make(OK, { balance: user.Balance });

      // Cancel a bet: refund it. Cancel a win: take it back.
      const delta = bet.type === 'BET' ? bet.amount : bet.type === 'WIN' ? bet.amount.negated() : ZERO;
      const before = user.Balance;
      user.Balance = before.plus(delta);
      await q.query("UPDATE GameHistory SET type = 'CANCEL', beforeamount = :before, afteramount = :after WHERE uid = :uid",
        { before: before.toString(), after: user.Balance.toString(), uid: bet.uid });
      await saveUserBalance(q, user, now);
      await applyRollingCollect(q, user, transId, now);
      return { ...make(OK, { balance: user.Balance }), wallet: wallet() };
    }

    case 'status':
      return make(OK, {
        trans_id: JSON.rawJSON(transId),
        trans_status: bet.type === 'CANCEL' ? 'CANCELED' : 'OK',
      });

    default:
      return make(CALLBACK_COMMAND_INVALID);
  }
}

router.post('/', async (req, res) => {
  const cb = bindRequest(req);

  if ((req.get('callback-token') ?? '') !== config.fortuneGate.callbackToken)
    return res.json(make(TOKEN_INVALID).body);

  // Money-moving commands run in one transaction with the user's row locked
  // first, so a retried or concurrent callback for that user waits its turn and
  // then sees the committed balance and the duplicate check's latest state.
  const outcome = MOVES_MONEY.has(cb.command)
    ? await db.transaction(async (tx) => {
        await tx.query('SELECT Uid FROM Users WHERE LoginId = :account FOR UPDATE', { account: cb.data.account });
        return handle(cb, tx);
      })
    : await handle(cb, db);

  if (outcome.wallet) await notifyWallet(outcome.wallet.loginId, outcome.wallet.balance, outcome.wallet.point);
  res.json(outcome.body);
});
