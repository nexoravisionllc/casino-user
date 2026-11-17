import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useModal } from '../context/ModalContext.jsx';
import { MenuIcon, ChatIcon, UserIcon, PiggyIcon, PointPIcon } from './Icons.jsx';

// Formats a numeric balance/point with two decimals and thousands separators.
function formatAmount(value) {
  return Number(value ?? 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function Header({ onToggleSidebar }) {
  const { user, logout } = useAuth();
  const { openSignIn, openSignUp } = useModal();

  return (
    <header className="header">
      <div className="header__left">
        <button className="icon-btn" aria-label="Toggle menu" onClick={onToggleSidebar}>
          <MenuIcon />
        </button>
        <Link to="/" className="header__logo">
          <img src="/assets/logo.png" alt="BC Game" />
        </Link>
      </div>

      <div className="header__right">
        {user ? (
          <>
            <div className="wallet">
              <span className="wallet__item wallet__name">
                <UserIcon width={15} height={15} className="wallet__ico wallet__ico--name" />
                {user.name}
              </span>
              <span className="wallet__item">
                <PiggyIcon width={16} height={16} className="wallet__ico wallet__ico--balance" />
                {formatAmount(user.balance)}
              </span>
              <span className="wallet__item">
                <PointPIcon width={16} height={16} className="wallet__ico wallet__ico--point" />
                {formatAmount(user.point)}
              </span>
            </div>
            <button className="icon-btn" aria-label="Support chat">
              <ChatIcon />
            </button>
            {/* Logout sits where the language switch used to be (far right), filled style. */}
            <button className="btn btn--primary" onClick={logout}>
              Logout
            </button>
          </>
        ) : (
          <>
            <button className="btn btn--ghost" onClick={openSignIn}>
              Sign In
            </button>
            <button className="btn btn--primary" onClick={openSignUp}>
              Sign Up
            </button>
            <button className="icon-btn" aria-label="Support chat">
              <ChatIcon />
            </button>
          </>
        )}
      </div>
    </header>
  );
}
