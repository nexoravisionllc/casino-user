import { useEffect, useMemo, useState } from 'react';
import Footer from '../components/Footer.jsx';
import { apiGet } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

const money = (v) => (v == null ? null : Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const pad = (n) => String(n).padStart(2, '0');
const dateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fmtTime = (d) => {
  const x = new Date(d);
  return `${dateStr(x)} ${pad(x.getHours())}:${pad(x.getMinutes())}:${pad(x.getSeconds())}`;
};
const label = (t) => (t || '').replace(/-/g, ' ').toUpperCase();
const shortHash = (h) => `${h.slice(0, 8)}…${h.slice(-6)}`;

// /money/transaction — the logged-in user's own transaction history for a period.
export default function TransactionPage() {
  const { token } = useAuth();
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');

  const today = useMemo(() => dateStr(new Date()), []);
  const monthAgo = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return dateStr(d);
  }, []);
  const [from, setFrom] = useState(monthAgo);
  const [to, setTo] = useState(today);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    apiGet('/transactions', token)
      .then((data) => { if (!cancelled) { setRows(data ?? []); setError(''); } })
      .catch((err) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [token]);

  const filtered = useMemo(() => rows.filter((t) => {
    const d = dateStr(new Date(t.createdAt));
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  }), [rows, from, to]);

  return (
    <>
      <div className="txpage">
        <div className="txpage__panel">
          <h1 className="txpage__title">Transaction</h1>

          <div className="txpage__filters">
            <label className="txpage__field">
              <span>From</span>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label className="txpage__field">
              <span>End</span>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </label>
          </div>

          {error && <p className="txpage__error">{error}</p>}

          <div className="txpage__scroll">
            <table className="txpage__table">
              <thead>
                <tr>
                  <th>#</th><th>Type</th><th>Amount</th><th>Before</th><th>After</th><th>Status</th><th>Time</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t, i) => (
                  <tr key={t.uid}>
                    <td>{i + 1}</td>
                    <td>
                      <span className={`txtag txtag--${t.type}`}>{label(t.type)}</span>
                      {t.txLinks?.length ? (
                        <span className="txpage__txtags">
                          {t.txLinks.map((l) => (
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
                      ) : null}
                    </td>
                    <td className="txpage__num"><b>${money(t.amount)}</b></td>
                    <td className="txpage__num">${money(t.beforeAmount)}</td>
                    <td className="txpage__num">{t.afterAmount == null ? '—' : `$${money(t.afterAmount)}`}</td>
                    <td><span className={`txstat txstat--${t.status}`}>{(t.status || '').toUpperCase()}</span></td>
                    <td className="txpage__time">{fmtTime(t.createdAt)}</td>
                  </tr>
                ))}
                {!filtered.length && (
                  <tr><td colSpan="7" className="txpage__empty">No transactions in this period.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <Footer />
    </>
  );
}
