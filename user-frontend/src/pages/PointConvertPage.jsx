import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Footer from '../components/Footer.jsx';
import { ChevronLeftIcon } from '../components/Icons.jsx';
import { apiPost } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useModal } from '../context/ModalContext.jsx';

// Preset point amounts.
const PRESETS = [2500, 1000, 250, 100, 50, 30, 20, 10];

// /money/point-convert — mirrors the Deposit page but works in points ("P").
// Converts points into balance at a 1:1 rate.
export default function PointConvertPage() {
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
      const res = await apiPost('/transactions/point-convert', { amount: value }, token);
      if (res?.success) {
        setMsg({ type: 'ok', text: res.message || 'Points converted to balance successfully.' });
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
            <h2 className="deposit__title">Point Convert</h2>
            <span className="deposit__spacer" />
          </div>

          <div className="deposit__grid">
            {PRESETS.map((p) => (
              <button
                key={p}
                className={`deposit__preset ${Number(amount) === p ? 'is-selected' : ''}`}
                onClick={() => selectPreset(p)}
              >
                <span className="deposit__preset-amt">{p.toLocaleString('en-US')}P</span>
              </button>
            ))}
          </div>

          <div className="deposit__amount">
            <span className="deposit__cur">P</span>
            <input
              type="number" min="0" step="1" value={amount}
              onChange={(e) => { setAmount(e.target.value); setMsg(null); }}
              placeholder="0"
            />
          </div>

          {user && <p className="deposit__balance">Current Point: <b>{Number(user.point ?? 0).toLocaleString('en-US')}P</b></p>}
          {msg && <p className={`deposit__msg deposit__msg--${msg.type}`}>{msg.text}</p>}

          <button className="deposit__request" onClick={submit} disabled={busy}>
            {busy ? 'Converting…' : 'Convert'}
          </button>
        </div>
      </div>

      <Footer />
    </>
  );
}
