import { apiGet, apiPost } from '../api/client.js';

/**
 * Browser push notifications: registers /sw.js and stores this browser's push
 * subscription on the server (POST /notifications/push/subscribe).
 */

export const NOTIFICATIONS_CHANGED_EVENT = 'casino:notifications-changed';

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;

/**
 * 'unsupported' | 'ios-home-screen' (iPhone/iPad: only works once the site is
 * added to the Home Screen) | 'denied' | 'default' | 'granted'.
 */
export function pushSupport() {
  const capable = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (!capable) return isIos() && !isStandalone() ? 'ios-home-screen' : 'unsupported';
  return Notification.permission;
}

function urlBase64ToUint8Array(base64) {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

const registration = () => navigator.serviceWorker.register('/sw.js');

/** This browser's current subscription, or null. */
export async function currentSubscription() {
  if (!('serviceWorker' in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration('/');
  return reg ? reg.pushManager.getSubscription() : null;
}

/** Ask permission (must run from a click) and subscribe. Returns { ok, message }. */
export async function enablePush(token) {
  const support = pushSupport();
  if (support === 'ios-home-screen') return { ok: false, message: 'On iPhone/iPad, add this site to your Home Screen (Share → Add to Home Screen), open it from there and turn notifications on.' };
  if (support === 'unsupported') return { ok: false, message: 'This browser does not support push notifications.' };
  if (support === 'denied') return { ok: false, message: 'Notifications are blocked for this site. Allow them in your browser settings, then try again.' };

  const { enabled, publicKey } = await apiGet('/notifications/push/key', token);
  if (!enabled || !publicKey) return { ok: false, message: 'Push notifications are not available right now.' };

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return { ok: false, message: 'Notifications were not allowed.' };

  const reg = await registration();
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
  const res = await apiPost('/notifications/push/subscribe', sub.toJSON(), token);
  if (!res?.success) return { ok: false, message: res?.message || 'Could not turn on notifications.' };
  return { ok: true, message: 'Notifications are on for this device.' };
}

/** Stop push on this browser (also used on sign-out). Never throws. */
export async function disablePush(token) {
  try {
    const sub = await currentSubscription();
    if (!sub) return;
    if (token) await apiPost('/notifications/push/unsubscribe', { endpoint: sub.endpoint }, token).catch(() => {});
    await sub.unsubscribe();
  } catch {
    // Nothing to undo.
  }
}

/**
 * Re-send an existing subscription after sign-in, so a browser that already
 * allowed notifications keeps getting them for the account now signed in.
 */
export async function syncPush(token) {
  try {
    if (pushSupport() !== 'granted') return;
    const sub = await currentSubscription();
    if (sub) await apiPost('/notifications/push/subscribe', sub.toJSON(), token);
  } catch {
    // Best effort.
  }
}
