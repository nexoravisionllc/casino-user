import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import webpush from 'web-push';
import { NOTIFY_SECRET, PASSWORD, db, get, loginAs, post, resetData, shutdown } from './helpers.js';

beforeEach(resetData);
after(shutdown);

// Intercept push delivery: record what would be sent; endpoints containing
// "gone" answer 410 like a push service does for an expired subscription.
const sent = [];
const realSend = webpush.sendNotification;
webpush.sendNotification = async (sub, data) => {
  if (sub.endpoint.includes('gone')) { const e = new Error('Gone'); e.statusCode = 410; throw e; }
  sent.push({ endpoint: sub.endpoint, data: JSON.parse(data) });
  return { statusCode: 201 };
};
after(() => { webpush.sendNotification = realSend; });
beforeEach(() => { sent.length = 0; });

const internal = (body, secret = NOTIFY_SECRET) =>
  post('/api/notifications/internal', body, { headers: { 'X-Notify-Secret': secret } });
const subscription = (name) => ({ endpoint: `https://push.example.com/send/${name}`, keys: { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) } });

test('the internal notify endpoint needs the shared secret and a known event', async () => {
  assert.equal((await internal({ loginId: 'user', event: 'withdraw-accepted', details: {} }, 'wrong')).status, 401);
  assert.equal((await internal({ loginId: 'user', event: 'nope' })).status, 400);
});

test('an event is stored, listed under the bell, and marked read', async () => {
  const token = await loginAs('user');
  const res = await internal({ loginId: 'user', event: 'withdraw-rejected', details: { uid: 7, amount: 25.5, reason: 'Wrong network' } });
  assert.equal(res.status, 200);
  assert.equal(res.json.stored, true);

  let list = (await get('/api/notifications', { token })).json;
  assert.equal(list.unread, 1);
  assert.equal(list.items[0].title, 'Withdrawal not approved');
  assert.equal(list.items[0].body, 'Your withdrawal #7 of $25.50 was not approved. Reason: Wrong network');
  assert.equal(list.items[0].url, '/money/transaction');

  await post('/api/notifications/read', { ids: [list.items[0].id] }, { token });
  list = (await get('/api/notifications', { token })).json;
  assert.equal(list.unread, 0);
  assert.equal(list.items[0].read, true);

  // Another player sees nothing.
  const other = await loginAs('orphan', PASSWORD);
  assert.equal((await get('/api/notifications', { token: other })).json.items.length, 0);
});

test('mark all as read', async () => {
  const token = await loginAs('user');
  await internal({ loginId: 'user', event: 'deposit-accepted', details: { amount: 10 } });
  await internal({ loginId: 'user', event: 'balance-adjusted', details: { field: 'point', mode: 'pay', amount: 5 } });
  assert.equal((await get('/api/notifications', { token })).json.unread, 2);
  await post('/api/notifications/read', {}, { token });
  assert.equal((await get('/api/notifications', { token })).json.unread, 0);
});

test('push goes to every subscribed browser; expired ones are removed', async () => {
  const token = await loginAs('user');
  assert.equal((await get('/api/notifications/push/key', { token })).json.enabled, true);
  assert.equal((await post('/api/notifications/push/subscribe', subscription('phone'), { token })).json.success, true);
  assert.equal((await post('/api/notifications/push/subscribe', subscription('gone-laptop'), { token })).json.success, true);

  const res = await internal({ loginId: 'user', event: 'crypto-deposit', details: { coins: '50', coin: 'USDT', amount: 50 } });
  assert.equal(res.json.pushed, 1);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].endpoint, 'https://push.example.com/send/phone');
  assert.equal(sent[0].data.title, 'Deposit received');
  assert.equal(sent[0].data.url, '/money/transaction');
  const left = await db.query('SELECT endpoint FROM PushSubscriptions');
  assert.deepEqual(left.map((r) => r.endpoint), ['https://push.example.com/send/phone'], 'the 410 subscription was dropped');
});

test('subscriptions are validated, move to the signed-in player, and can be removed', async () => {
  const token = await loginAs('user');
  assert.equal((await post('/api/notifications/push/subscribe', { endpoint: 'http://insecure/x', keys: { p256dh: 'x', auth: 'y' } }, { token })).status, 400);
  assert.equal((await post('/api/notifications/push/subscribe', subscription('a'))).status, 401);

  await post('/api/notifications/push/subscribe', subscription('shared'), { token });
  const other = await loginAs('orphan', PASSWORD);
  await post('/api/notifications/push/subscribe', subscription('shared'), { token: other });
  assert.deepEqual((await db.query('SELECT userid FROM PushSubscriptions')).map((r) => r.userid), ['orphan']);

  await post('/api/notifications/push/unsubscribe', { endpoint: subscription('shared').endpoint }, { token: other });
  assert.equal((await db.query('SELECT COUNT(*) n FROM PushSubscriptions'))[0].n, '0');
});

test('changing the password notifies the player', async () => {
  const token = await loginAs('user');
  assert.equal((await post('/api/profile/password', { currentPassword: PASSWORD, newPassword: 'new-pass-123' }, { token })).json.success, true);
  await new Promise((r) => setTimeout(r, 200)); // sent after the reply
  const list = (await get('/api/notifications', { token })).json;
  assert.equal(list.items[0].title, 'Your password was changed');
});
