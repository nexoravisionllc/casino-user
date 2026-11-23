import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { useNavigate } from 'react-router-dom';
import Footer from '../components/Footer.jsx';
import { ChevronLeftIcon } from '../components/Icons.jsx';
import { apiGet, apiPost } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useModal } from '../context/ModalContext.jsx';

// Preset deposit amounts.
const PRESETS = [2500, 1000, 250, 100, 50, 30, 20, 10];

const METHODS = [
  { id: 'crypto', label: 'Crypto' },
  { id: 'manual', label: 'Manual request' },
];

const shortHash = (h) => `${h.slice(0, 10)}…${h.slice(-6)}`;

/**
 * Self-hosted gateway: the player's permanent address on BSC and Ethereum.
 * Deposits are credited automatically; the list refreshes every 15 seconds.
 */
function OnchainDeposit({ info, token, refreshUser }) {
  const [copied, setCopied] = useState(false);
  const [recent, setRecent] = useState(null);
  const [fresh, setFresh] = useState(null);
  const [qr, setQr] = useState(null);
  const [checking, setChecking] = useState(false);

  // The plain address scans in every wallet; a chain-specific payment link would
  // lock the player to one network.
  useEffect(() => {
    let stopped = false;
    QRCode.toString(info.address, { type: 'svg', errorCorrectionLevel: 'M', margin: 2, color: { dark: '#000000', light: '#ffffff' } })
      .then((svg) => { if (!stopped) setQr(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`); })
      .catch(() => { if (!stopped) setQr(null); });
    return () => { stopped = true; };
  }, [info.address]);

  useEffect(() => {
    if (info.devMode) return undefined; // demo: no real address to watch
    let stopped = false;
    let timer;
    let known = null;
    const load = async () => {
      if (!stopped) setChecking(true);
      try {
        const list = await apiGet('/payments/onchain/deposits', token);
        if (stopped) return;
        if (known && list.length && !known.has(list[0].orderId)) {
          setFresh(list[0]);
          refreshUser();
        }
        known = new Set(list.map((d) => d.orderId));
        setRecent(list);
      } catch { /* keep the last list */ }
      finally { if (!stopped) setChecking(false); }
      if (!stopped) timer = setTimeout(load, 15000);
    };
    load();
    return () => { stopped = true; clearTimeout(timer); };
  }, [token, refreshUser, info.devMode]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(info.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard blocked; the address is selectable */ }
  };

  return (
    <>
      <p className="deposit__hint">
        Send any amount to your personal address below. Your balance is credited automatically in US dollars once the
        transfer is confirmed. Stablecoins count 1:1 and BNB/ETH at the market rate.
      </p>
      <div className="onchain__networks">
        {info.networks.map((n) => (
          <div key={n.network} className="onchain__network">
            <b>{n.name}</b>
            <span>{n.assets.join(' · ')}</span>
          </div>
        ))}
      </div>
      {qr && (
        <div className="onchain__qr">
          <img src={qr} alt={`QR code of deposit address ${info.address}`} width="180" height="180" />
        </div>
      )}
      <label className="deposit__field">
        <span className="deposit__label">Your deposit address (same on every network above)</span>
        <div className="onchain__address">
          <input type="text" readOnly value={info.address} onFocus={(e) => e.target.select()} />
          <button type="button" className="onchain__copy" onClick={copy} disabled={info.devMode}>{copied ? 'Copied' : 'Copy'}</button>
        </div>
      </label>
      <p className="deposit__hint">
        Minimum ${Number(info.minDepositUsd).toLocaleString('en-US')}; smaller transfers are added up until they reach it.
        Only send the coins listed above, on those networks. Other tokens sent here cannot be credited.
      </p>
      {info.devMode ? (
        <p className="deposit__msg deposit__msg--warn">Demo mode: deposit addresses are not available.</p>
      ) : (
      <div className={`onchain__status ${checking ? 'is-checking' : ''}`} role="status" aria-live="polite">
        <span className="onchain__status-dot" aria-hidden="true" />
        <span>
          {recent === null
            ? 'Checking for your deposit…'
            : checking
              ? 'Checking for new deposits…'
              : 'Watching this address — your deposit appears here automatically once confirmed.'}
        </span>
      </div>
      )}
      {fresh && (
        <p className="deposit__msg deposit__msg--ok">
          Received {fresh.coinAmount} {fresh.coin}: ${Number(fresh.amount).toLocaleString('en-US')} was added to your balance.
        </p>
      )}
      {recent?.length > 0 && (
        <div className="onchain__recent">
          <span className="deposit__label">Recent deposits</span>
          {recent.map((d) => (
            <div key={d.orderId} className="onchain__row">
              <span>{d.coinAmount} {d.coin} <small>{d.network}</small></span>
              <span>${Number(d.amount).toLocaleString('en-US')}</span>
              {d.txLinks?.length ? (
                <span className="onchain__row-tx">
                  {d.txLinks.map((l) => (
                    <a
                      key={l.hash}
                      className="txchip"
                      href={l.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={`View ${l.hash} on the block explorer`}
                    >
                      {shortHash(l.hash)} ↗
                    </a>
                  ))}
                </span>
              ) : (
                <small title={d.txids.join(', ')}>{d.txids[0] ? shortHash(d.txids[0]) : new Date(d.createdAt).toLocaleString()}</small>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export default function DepositPage() {
  const navigate = useNavigate();
  const { user, token, refreshUser } = useAuth();
  const { openSignIn } = useModal();
  const [method, setMethod] = useState('crypto');
  const [amount, setAmount] = useState('100');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // { type: 'ok'|'err', text }
  const [onchain, setOnchain] = useState(null); // self-hosted gateway info

  // Crypto deposits go to the player's own address on the self-hosted gateway.
  useEffect(() => {
    if (!token) return undefined;
    let stopped = false;
    apiGet('/payments/onchain/deposit-address', token)
      .then((d) => {
        if (stopped) return;
        setOnchain(d);
        if (!d.available) setMethod('manual');
      })
      .catch(() => { if (!stopped) { setOnchain({ available: false }); setMethod('manual'); } });
    return () => { stopped = true; };
  }, [token]);
  const methods = onchain && !onchain.available ? METHODS.filter((m) => m.id !== 'crypto') : METHODS;
  const showOnchain = method === 'crypto' && onchain?.available;

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
      const res = await apiPost('/transactions/deposit', { amount: value }, token);
      if (res?.success) {
        setMsg({ type: 'ok', text: res.message || 'Deposit requested successfully.' });
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
            <h2 className="deposit__title">Deposit</h2>
            <span className="deposit__spacer" />
          </div>

          <div className="deposit__methods" role="tablist">
            {methods.map((m) => (
              <button
                key={m.id}
                role="tab"
                aria-selected={method === m.id}
                className={`deposit__method ${method === m.id ? 'is-selected' : ''}`}
                onClick={() => {
                  setMethod(m.id);
                  setMsg(null);
                }}
              >
                {m.label}
              </button>
            ))}
          </div>
          {method === 'crypto' && !onchain && (
            <p className="deposit__hint">{token ? 'Loading…' : 'Sign in to get your personal crypto deposit address.'}</p>
          )}

          {showOnchain ? (
            <>
              <OnchainDeposit info={onchain} token={token} refreshUser={refreshUser} />
              {user && <p className="deposit__balance">Current balance: <b>${Number(user.balance ?? 0).toLocaleString('en-US')}</b></p>}
            </>
          ) : method === 'manual' && (
          <>
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
          </>
          )}
        </div>
      </div>

      <Footer />
    </>
  );
}
