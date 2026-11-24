import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useModal } from '../context/ModalContext.jsx';
import NotificationBell from './NotificationBell.jsx';
import {
  MenuIcon, ChatIcon, PiggyIcon, PointPIcon, ChevronDownIcon, LogoutIcon,
  DepositIcon, WithdrawIcon, ConvertIcon, ReceiptIcon, UserIcon,
} from './Icons.jsx';

// Formats a numeric balance/point with two decimals and thousands separators.
function formatAmount(value) {
  return Number(value ?? 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// Account and money actions live in the profile dropdown.
const moneyItems = [
  { label: 'My profile', Icon: UserIcon, to: '/account/profile' },
  { label: 'Deposit', Icon: DepositIcon, to: '/money/deposit' },
  { label: 'Withdraw', Icon: WithdrawIcon, to: '/money/withdraw' },
  { label: 'Point Convert', Icon: ConvertIcon, to: '/money/point-convert' },
  { label: 'Transactions', Icon: ReceiptIcon, to: '/money/transaction' },
];

function UserMenu({ user, onLogout }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();
  const { pathname } = useLocation();

  // Close on outside click, Escape, or navigation.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  useEffect(() => { setOpen(false); }, [pathname]);

  const initial = (user.name || '?').trim().charAt(0).toUpperCase();

  return (
    <div className={`umenu ${open ? 'is-open' : ''}`} ref={ref}>
      <button
        type="button"
        className="umenu__trigger"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="umenu__avatar">{initial}</span>
        <span className="umenu__name">{user.name}</span>
        <ChevronDownIcon width={16} height={16} className="umenu__chev" />
      </button>

      {open && (
        <div className="umenu__panel" role="menu">
          <div className="umenu__head">
            <span className="umenu__avatar umenu__avatar--lg">{initial}</span>
            <div className="umenu__who">
              <strong>{user.name}</strong>
              {user.loginId && <span>@{user.loginId}</span>}
            </div>
          </div>

          <div className="umenu__balances">
            <div className="umenu__bal">
              <span className="umenu__bal-label"><PiggyIcon width={14} height={14} /> Balance</span>
              <span className="umenu__bal-value">{formatAmount(user.balance)}</span>
            </div>
            <div className="umenu__bal">
              <span className="umenu__bal-label"><PointPIcon width={14} height={14} /> Points</span>
              <span className="umenu__bal-value">{formatAmount(user.point)}</span>
            </div>
          </div>

          <ul className="umenu__list">
            {moneyItems.map(({ label, Icon, to }) => (
              <li key={to}>
                <button
                  type="button"
                  role="menuitem"
                  className={`umenu__item ${pathname === to ? 'is-active' : ''}`}
                  onClick={() => navigate(to)}
                >
                  <Icon width={17} height={17} /> {label}
                </button>
              </li>
            ))}
          </ul>

          <div className="umenu__sep" />
          <button
            type="button"
            role="menuitem"
            className="umenu__item umenu__item--danger"
            onClick={() => { setOpen(false); onLogout(); }}
          >
            <LogoutIcon width={17} height={17} /> Logout
          </button>
        </div>
      )}
    </div>
  );
}

export default function Header({ onToggleSidebar }) {
  const { user, logout } = useAuth();
  const { openSignIn, openSignUp } = useModal();
  const navigate = useNavigate();

  return (
    <header className="header">
      <div className="header__left">
        <button className="icon-btn icon-btn--plain" aria-label="Toggle menu" onClick={onToggleSidebar}>
          <MenuIcon />
        </button>
        <Link to="/" className="header__logo">
          <img src="/assets/logo-mark.svg" alt="" />
          <span className="header__brand">Nexora Vision Play</span>
        </Link>
      </div>

      <div className="header__right">
        {user ? (
          <>
            <div className="wallet">
              <span className="wallet__item" title="Balance">
                <PiggyIcon width={16} height={16} className="wallet__ico wallet__ico--balance" />
                {formatAmount(user.balance)}
              </span>
              <span className="wallet__divider" />
              <span className="wallet__item" title="Points">
                <PointPIcon width={16} height={16} className="wallet__ico wallet__ico--point" />
                {formatAmount(user.point)}
              </span>
              <button className="wallet__deposit" onClick={() => navigate('/money/deposit')}>
                Deposit
              </button>
            </div>
            <button className="icon-btn" aria-label="Support chat">
              <ChatIcon width={18} height={18} />
            </button>
            <NotificationBell />
            <UserMenu user={user} onLogout={logout} />
          </>
        ) : (
          <>
            <button className="icon-btn" aria-label="Support chat">
              <ChatIcon width={18} height={18} />
            </button>
            <button className="btn btn--ghost" onClick={openSignIn}>
              Sign In
            </button>
            <button className="btn btn--primary" onClick={openSignUp}>
              Sign Up
            </button>
          </>
        )}
      </div>
    </header>
  );
}
