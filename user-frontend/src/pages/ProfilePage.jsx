import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Footer from '../components/Footer.jsx';
import { ChevronLeftIcon } from '../components/Icons.jsx';
import { apiGet, apiPost } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

const FIELDS = [
  { key: 'name', label: 'Name', max: 64, autoComplete: 'name', required: true },
  { key: 'email', label: 'Email', max: 128, type: 'email', autoComplete: 'email', hint: 'Withdrawal updates are sent here.' },
  { key: 'bankName', label: 'Bank name', max: 64 },
  { key: 'bankAccount', label: 'Bank account number', max: 64 },
  { key: 'bankMaster', label: 'Account holder name', max: 64 },
];
// Changing these needs the current password (they decide where money and notices go).
const SENSITIVE = ['email', 'bankName', 'bankAccount', 'bankMaster'];
const EMPTY = { name: '', email: '', bankName: '', bankAccount: '', bankMaster: '' };

// /account/profile — the player's own details and a password change.
export default function ProfilePage() {
  const navigate = useNavigate();
  const { token, refreshUser } = useAuth();
  const [saved, setSaved] = useState(null); // profile as stored on the server
  const [form, setForm] = useState(EMPTY);
  const [currentPassword, setCurrentPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // { type: 'ok'|'warn'|'err', text }
  const [loadError, setLoadError] = useState('');

  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState(null);

  useEffect(() => {
    if (!token) return undefined;
    let stopped = false;
    apiGet('/profile', token)
      .then((p) => { if (!stopped) { setSaved(p); setForm({ ...EMPTY, ...p }); } })
      .catch(() => { if (!stopped) setLoadError('Could not load your profile. Please try again.'); });
    return () => { stopped = true; };
  }, [token]);

  const dirty = useMemo(() => saved && FIELDS.some(({ key }) => form[key].trim() !== (saved[key] ?? '')), [form, saved]);
  const needsPassword = useMemo(() => saved && SENSITIVE.some((k) => form[k].trim() !== (saved[k] ?? '')), [form, saved]);

  const set = (key) => (e) => { setForm((f) => ({ ...f, [key]: e.target.value })); setMsg(null); };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setMsg({ type: 'err', text: 'Name is required.' }); return; }
    if (needsPassword && !currentPassword) { setMsg({ type: 'err', text: 'Enter your current password to change your email or bank details.' }); return; }
    setBusy(true);
    setMsg(null);
    try {
      const res = await apiPost('/profile', { ...form, currentPassword: needsPassword ? currentPassword : undefined }, token);
      if (res?.success) {
        setSaved(res.profile);
        setForm({ ...EMPTY, ...res.profile });
        setCurrentPassword('');
        setMsg({ type: 'ok', text: res.message });
        refreshUser(); // the header shows the name
      } else {
        setMsg({ type: 'warn', text: res?.message || 'Your profile could not be saved.' });
      }
    } catch (err) {
      setMsg({ type: 'err', text: err.message });
    } finally {
      setBusy(false);
    }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    setPwMsg(null);
    if (pw.next !== pw.confirm) { setPwMsg({ type: 'err', text: 'The new passwords do not match.' }); return; }
    setPwBusy(true);
    try {
      const res = await apiPost('/profile/password', { currentPassword: pw.current, newPassword: pw.next }, token);
      if (res?.success) {
        setPw({ current: '', next: '', confirm: '' });
        setPwMsg({ type: 'ok', text: res.message });
      } else {
        setPwMsg({ type: 'warn', text: res?.message || 'Your password could not be changed.' });
      }
    } catch (err) {
      setPwMsg({ type: 'err', text: err.message });
    } finally {
      setPwBusy(false);
    }
  };

  return (
    <>
      <div className="deposit profile">
        <form className="deposit__card" onSubmit={submit}>
          <div className="deposit__head">
            <button type="button" className="deposit__back" onClick={() => navigate(-1)} aria-label="Back">
              <ChevronLeftIcon width={20} height={20} />
            </button>
            <h2 className="deposit__title">My profile</h2>
            <span className="deposit__spacer" />
          </div>

          {loadError && <p className="deposit__msg deposit__msg--err">{loadError}</p>}
          {!saved && !loadError && <p className="deposit__hint">Loading…</p>}

          {saved && (
            <>
              <label className="deposit__field">
                <span className="deposit__label">Login ID</span>
                <input type="text" value={saved.loginId} disabled readOnly />
              </label>

              {FIELDS.map(({ key, label, max, type, autoComplete, required, hint }) => (
                <label key={key} className="deposit__field">
                  <span className="deposit__label">{label}{required ? '' : ' (optional)'}</span>
                  <input type={type || 'text'} value={form[key]} maxLength={max} onChange={set(key)}
                    autoComplete={autoComplete || 'off'} spellCheck={false} required={required} />
                  {hint && <span className="profile__hint">{hint}</span>}
                </label>
              ))}

              <p className="deposit__hint">Withdrawals are paid to these bank details. They can't be changed while a withdrawal is waiting for review.</p>

              {needsPassword && (
                <label className="deposit__field">
                  <span className="deposit__label">Current password</span>
                  <input type="password" value={currentPassword} autoComplete="current-password"
                    onChange={(e) => { setCurrentPassword(e.target.value); setMsg(null); }} />
                  <span className="profile__hint">Required to change your email or bank details.</span>
                </label>
              )}

              {msg && <p className={`deposit__msg deposit__msg--${msg.type}`}>{msg.text}</p>}
              <button type="submit" className="deposit__request" disabled={busy || !dirty}>
                {busy ? 'Saving…' : 'Save changes'}
              </button>
            </>
          )}
        </form>

        {saved && (
          <form className="deposit__card" onSubmit={changePassword}>
            <h3 className="profile__subtitle">Change password</h3>
            <label className="deposit__field">
              <span className="deposit__label">Current password</span>
              <input type="password" value={pw.current} autoComplete="current-password" required
                onChange={(e) => { setPw((p) => ({ ...p, current: e.target.value })); setPwMsg(null); }} />
            </label>
            <label className="deposit__field">
              <span className="deposit__label">New password</span>
              <input type="password" value={pw.next} autoComplete="new-password" minLength={6} maxLength={128} required
                onChange={(e) => { setPw((p) => ({ ...p, next: e.target.value })); setPwMsg(null); }} />
              <span className="profile__hint">At least 6 characters.</span>
            </label>
            <label className="deposit__field">
              <span className="deposit__label">Confirm new password</span>
              <input type="password" value={pw.confirm} autoComplete="new-password" required
                onChange={(e) => { setPw((p) => ({ ...p, confirm: e.target.value })); setPwMsg(null); }} />
            </label>
            {pwMsg && <p className={`deposit__msg deposit__msg--${pwMsg.type}`}>{pwMsg.text}</p>}
            <button type="submit" className="deposit__request" disabled={pwBusy}>
              {pwBusy ? 'Changing…' : 'Change password'}
            </button>
          </form>
        )}
      </div>

      <Footer />
    </>
  );
}
