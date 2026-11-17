import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useModal } from '../context/ModalContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { useProviders, useOpenProvider } from '../hooks/useProviders.js';
import { ChevronIcon } from './Icons.jsx';

const accountLinks = [
  { label: 'Deposit', to: '/money/deposit' },
  { label: 'Withdraw', to: '/money/withdraw' },
  { label: 'Point Convert', to: '/money/point-convert' },
  { label: 'Transactions', to: '/money/transaction' },
];

// Compact site footer: brand, working navigation, the provider logo strip,
// a responsible-gaming notice and a back-to-top control.
export default function Footer() {
  const { user } = useAuth();
  const { openSignIn } = useModal();
  const { slots: showSlots } = useSettings();
  const navigate = useNavigate();
  const providers = useProviders();
  const openProvider = useOpenProvider();

  const casinoLinks = [
    { label: 'Hot Games', to: '/hotgame' },
    showSlots && { label: 'Slots', to: '/slot' },
    { label: 'Providers', to: '/providers' },
  ].filter(Boolean);

  // Account pages need a signed-in user; otherwise prompt to sign in.
  const openAccount = (to) => (user ? navigate(to) : openSignIn());

  return (
    <footer className="footer">
      <div className="footer__top">
        <div className="footer__brand">
          <Link to="/" className="footer__logo">
            <img src="/assets/logo-mark.svg" alt="" />
            <span>Nexora Vision Play</span>
          </Link>
          <p>Slots and live tables from leading providers, in one place.</p>
        </div>

        <nav className="footer__cols" aria-label="Footer">
          <div className="footer__col">
            <h4>Casino</h4>
            <ul>
              {casinoLinks.map((l) => (
                <li key={l.to}><Link to={l.to}>{l.label}</Link></li>
              ))}
            </ul>
          </div>
          <div className="footer__col">
            <h4>Account</h4>
            <ul>
              {accountLinks.map((l) => (
                <li key={l.to}>
                  <button type="button" className="footer__link" onClick={() => openAccount(l.to)}>
                    {l.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </nav>
      </div>

      {providers.length > 0 && (
        <div className="footer__providers">
          {providers.map((p) => (
            <button
              type="button"
              key={p.providerId}
              className="footer__prov"
              onClick={() => openProvider(p)}
              title={p.name}
            >
              {p.imageUrl ? <img src={p.imageUrl} alt={p.name} loading="lazy" /> : <span>{p.name}</span>}
            </button>
          ))}
        </div>
      )}

      <div className="footer__bottom">
        <div className="footer__rg">
          <span className="footer__age">18+</span>
          <span>Play responsibly. You must be of legal age to play in your jurisdiction.</span>
        </div>
        <div className="footer__meta">
          <span>© {new Date().getFullYear()} Nexora Vision Play</span>
          <button
            type="button"
            className="footer__top-btn"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            aria-label="Back to top"
          >
            <ChevronIcon width={14} height={14} style={{ transform: 'rotate(-90deg)' }} /> Top
          </button>
        </div>
      </div>
    </footer>
  );
}
