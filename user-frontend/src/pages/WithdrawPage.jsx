import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Footer from '../components/Footer.jsx';
import { ChevronLeftIcon } from '../components/Icons.jsx';
import { apiPost } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useModal } from '../context/ModalContext.jsx';

// Preset withdraw amounts.
const PRESETS = [2500, 1000, 250, 100, 50, 30, 20, 10];

// /money/withdraw — mirrors the Deposit page. Submitting inserts a pending
// withdraw transaction that the admin reviews on the Money > Withdraw page.
export default function WithdrawPage() {
  const navigate = useNavigate();
  const { user, token } = useAuth();
  const { openSignIn } = useModal();
  const [amount, setAmount] = useState('100');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // { type: 'ok'|'warn'|'err', text }

  const selectPreset = (v) => { setAmount(String(v)); setMsg(null); };

  const submit = async () => {
    setMsg(null);
    if (!token) { openSignIn(); return; }
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setMsg({ type: 'err', text: 'Enter an amount greater than zero.' });
      return;
    }
    setBusy(true);
    try {
      const res = await apiPost('/transactions/withdraw', { amount: value }, token);
      if (res?.success) {
        setMsg({ type: 'ok', text: res.message || 'Withdraw requested successfully.' });
      } else {
        setMsg({ type: 'warn', text: res?.message || 'Request could not be completed.' });
      }
    } catch (err) {
      setMsg({ type: 'err', text: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="deposit">
        <div className="deposit__card">
          <div className="deposit__head">
            <button className="deposit__back" onClick={() => navigate(-1)} aria-label="Back">
              <ChevronLeftIcon width={20} height={20} />
            </button>
            <h2 className="deposit__title">Withdraw</h2>
            <span className="deposit__spacer" />
          </div>

          <div className="deposit__grid">
            {PRESETS.map((p) => (
              <button
                key={p}
                className={`deposit__preset ${Number(amount) === p ? 'is-selected' : ''}`}
                onClick={() => selectPreset(p)}
              >
                <span className="deposit__preset-amt">${p.toLocaleString('en-US')}</span>
              </button>
            ))}
          </div>

          <div className="deposit__amount">
            <span className="deposit__cur">$</span>
            <input
              type="number" min="0" step="1" value={amount}
              onChange={(e) => { setAmount(e.target.value); setMsg(null); }}
              placeholder="0"
            />
          </div>

          {user && <p className="deposit__balance">Current balance: <b>${Number(user.balance ?? 0).toLocaleString('en-US')}</b></p>}
          {msg && <p className={`deposit__msg deposit__msg--${msg.type}`}>{msg.text}</p>}

          <button className="deposit__request" onClick={submit} disabled={busy}>
            {busy ? 'Submitting…' : 'Request'}
          </button>
        </div>
      </div>

      <Footer />
    </>
  );
}
