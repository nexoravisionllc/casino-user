import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet, apiPost } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { TRANSACTION_UPDATED_EVENT } from '../realtime/WalletRealtime.jsx';
import { NOTIFICATIONS_CHANGED_EVENT, enablePush, currentSubscription, pushSupport } from '../notifications/push.js';
import { BellIcon } from './Icons.jsx';

const POLL_MS = 60_000;

function timeAgo(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

// Header bell: the player's latest notifications, with an option to get them
// as browser push notifications on this device.
export default function NotificationBell() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState({ unread: 0, items: [] });
  const [push, setPush] = useState({ state: 'checking', busy: false, message: '' });
  const ref = useRef(null);

  const load = useCallback(async () => {
    if (!token) return;
    try { setData(await apiGet('/notifications', token)); } catch { /* keep the last list */ }
  }, [token]);

  // Refresh: now, every minute, on focus, when a push arrives or a request changes.
  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_MS);
    const onSwMessage = (e) => { if (e.data?.type === 'notification') load(); };
    window.addEventListener('focus', load);
    window.addEventListener(TRANSACTION_UPDATED_EVENT, load);
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, load);
    navigator.serviceWorker?.addEventListener('message', onSwMessage);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', load);
      window.removeEventListener(TRANSACTION_UPDATED_EVENT, load);
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, load);
      navigator.serviceWorker?.removeEventListener('message', onSwMessage);
    };
  }, [load]);

  // Is push on for this browser?
  const checkPush = useCallback(async () => {
    const support = pushSupport();
    if (support !== 'granted') return setPush((p) => ({ ...p, state: support }));
    const sub = await currentSubscription().catch(() => null);
    setPush((p) => ({ ...p, state: sub ? 'on' : 'default' }));
  }, []);
  useEffect(() => { if (open) checkPush(); }, [open, checkPush]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const markRead = async (ids) => {
    setData((d) => ({
      unread: ids ? Math.max(0, d.unread - d.items.filter((i) => ids.includes(i.id) && !i.read).length) : 0,
      items: d.items.map((i) => (!ids || ids.includes(i.id) ? { ...i, read: true } : i)),
    }));
    try { await apiPost('/notifications/read', ids ? { ids } : {}, token); } catch { load(); }
  };

  const openItem = (item) => {
    if (!item.read) markRead([item.id]);
    setOpen(false);
    if (item.url) navigate(item.url);
  };

  const turnOnPush = async () => {
    setPush((p) => ({ ...p, busy: true, message: '' }));
    try {
      const res = await enablePush(token);
      setPush({ state: res.ok ? 'on' : pushSupport(), busy: false, message: res.message });
    } catch (err) {
      setPush((p) => ({ ...p, busy: false, message: err.message || 'Could not turn on notifications.' }));
    }
  };

  const unread = data.unread;

  return (
    <div className={`nbell ${open ? 'is-open' : ''}`} ref={ref}>
      <button type="button" className="icon-btn nbell__btn" aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <BellIcon width={18} height={18} />
        {unread > 0 && <span className="nbell__count">{unread > 99 ? '99+' : unread}</span>}
      </button>

      {open && (
        <div className="nbell__panel" role="dialog" aria-label="Notifications">
          <div className="nbell__head">
            <strong>Notifications</strong>
            {unread > 0 && <button type="button" className="nbell__link" onClick={() => markRead(null)}>Mark all as read</button>}
          </div>

          <div className="nbell__list">
            {data.items.length ? data.items.map((item) => (
              <button type="button" key={item.id} className={`nbell__item ${item.read ? '' : 'is-unread'}`} onClick={() => openItem(item)}>
                <span className={`nbell__dot nbell__dot--${item.type}`} aria-hidden="true" />
                <span className="nbell__text">
                  <span className="nbell__title">{item.title}</span>
                  <span className="nbell__body">{item.body}</span>
                  <span className="nbell__time">{timeAgo(item.createdAt)}</span>
                </span>
              </button>
            )) : (
              <p className="nbell__empty">No notifications yet. Updates about your deposits, withdrawals and account appear here.</p>
            )}
          </div>

          <div className="nbell__foot">
            {push.state === 'on' && <span className="nbell__ok">Push notifications are on for this device.</span>}
            {(push.state === 'default' || push.state === 'ios-home-screen') && (
              <button type="button" className="nbell__push" onClick={turnOnPush} disabled={push.busy}>
                {push.busy ? 'Turning on…' : 'Get notifications on this device'}
              </button>
            )}
            {push.state === 'denied' && <span className="nbell__muted">Notifications are blocked for this site in your browser settings.</span>}
            {push.state === 'unsupported' && <span className="nbell__muted">This browser does not support push notifications.</span>}
            {push.message && push.state !== 'on' && <span className="nbell__muted">{push.message}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
