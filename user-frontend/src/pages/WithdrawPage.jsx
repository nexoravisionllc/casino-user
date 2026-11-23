import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Footer from '../components/Footer.jsx';
import { ChevronLeftIcon } from '../components/Icons.jsx';
import { apiGet, apiPost } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useModal } from '../context/ModalContext.jsx';

// Preset withdraw amounts.
const PRESETS = [2500, 1000, 250, 100, 50, 30, 20, 10];

const METHODS = [
  { id: 'crypto', label: 'Crypto' },
  { id: 'manual', label: 'Manual request' },
];

const optionKey = (o) => `${o.currency}:${o.network}`;

// /money/withdraw — mirrors the Deposit page. Submitting inserts a pending
// withdraw transaction that the admin reviews on the Money > Withdraw page.
// A crypto withdrawal also carries the wallet address; once the admin accepts
// it, the payout is sent on-chain from the hot wallet.
export default function WithdrawPage() {
  const navigate = useNavigate();
  const { user, token } = useAuth();
  const { openSignIn } = useModal();
  const [method, setMethod] = useState('crypto');
  const [amount, setAmount] = useState('100');
  const [crypto, setCrypto] = useState(null); // { available, options }
  const [coin, setCoin] = useState('');
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // { type: 'ok'|'warn'|'err', text }

  // Coins the player can withdraw to.
  useEffect(() => {
    if (!token) return undefined;
    let stopped = false;
    apiGet('/payments/crypto/withdraw/options', token)
      .then((d) => {
        if (stopped) return;
        setCrypto(d);
        if (d.options?.length) setCoin((c) => c || optionKey(d.options[0]));
        if (!d.available) setMethod('manual');
      })
      .catch(() => { if (!stopped) setCrypto({ available: false, options: [] }); });
    return () => { stopped = true; };
  }, [token]);

  const cryptoReady = Boolean(crypto?.available && crypto.options?.length);
  const devMode = Boolean(crypto?.devMode); // demo: no withdrawals of any kind
  const methods = cryptoReady || !crypto ? METHODS : METHODS.filter((m) => m.id !== 'crypto');

  const selectPreset = (v) => { setAmount(String(v)); setMsg(null); };

  const submit = async () => {
    setMsg(null);
    if (!token) { openSignIn(); return; }
    if (devMode) return;
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setMsg({ type: 'err', text: 'Enter an amount greater than zero.' });
      return;
    }
    const isCrypto = method === 'crypto';
    if (isCrypto && !address.trim()) {
      setMsg({ type: 'err', text: 'Enter your wallet address.' });
      return;
    }
    setBusy(true);
    try {
      let res;
      if (isCrypto) {
        const [currency, network] = coin.split(':');
        res = await apiPost('/payments/crypto/withdraw', { amount: value, currency, network, address: address.trim() }, token);
      } else {
        res = await apiPost('/transactions/withdraw', { amount: value }, token);
      }
      if (res?.success) {
        setMsg({
          type: 'ok',
          text: isCrypto
            ? 'Withdrawal requested. Once it is approved, the crypto is sent to your wallet automatically.'
            : res.message || 'Withdraw requested successfully.',
        });
        if (isCrypto) setAddress('');
      } else {
        setMsg({ type: 'warn', text: res?.message || 'Request could not be completed.' });
      }
    } catch (err) {
      setMsg({ type: 'err', text: err.message });
    } finally {
      setBusy(false);
    }
  };

  const [coinName, network] = coin.split(':');

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

          {methods.length > 1 && (
            <div className="deposit__methods" role="tablist">
              {methods.map((m) => (
                <button
                  key={m.id}
                  role="tab"
                  aria-selected={method === m.id}
                  className={`deposit__method ${method === m.id ? 'is-selected' : ''}`}
                  onClick={() => { setMethod(m.id); setMsg(null); }}
                >
                  {m.label}
                </button>
              ))}
            </div>
          )}

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

          {method === 'crypto' && cryptoReady && (
            <>
              <label className="deposit__field">
                <span className="deposit__label">Coin and network</span>
                <select value={coin} onChange={(e) => { setCoin(e.target.value); setMsg(null); }}>
                  {crypto.options.map((o) => (
                    <option key={optionKey(o)} value={optionKey(o)}>
                      {o.currency === o.network ? o.currency : `${o.currency} · ${o.network}`}
                    </option>
                  ))}
                </select>
              </label>
              <label className="deposit__field">
                <span className="deposit__label">Your {coinName} wallet address{coinName !== network ? ` (${network} network)` : ''}</span>
                <input
                  type="text" value={address} spellCheck={false} autoComplete="off" maxLength={128}
                  onChange={(e) => { setAddress(e.target.value); setMsg(null); }}
                  placeholder="Paste your wallet address"
                />
              </label>
              <p className="deposit__hint">
                The ${Number(amount) > 0 ? Number(amount).toLocaleString('en-US') : '0'} is converted to {coinName} at the current rate when it is sent.
                Double-check the address and network: crypto sent to a wrong address cannot be recovered.
              </p>
            </>
          )}

          {user && <p className="deposit__balance">Current balance: <b>${Number(user.balance ?? 0).toLocaleString('en-US')}</b></p>}
          {msg && <p className={`deposit__msg deposit__msg--${msg.type}`}>{msg.text}</p>}
          {devMode && <p className="deposit__msg deposit__msg--warn">Demo mode: withdrawals are disabled.</p>}

          <button className="deposit__request" onClick={submit} disabled={busy || devMode}>
            {busy ? 'Submitting…' : method === 'crypto' ? 'Request crypto withdrawal' : 'Request'}
          </button>
        </div>
      </div>

      <Footer />
    </>
  );
}
