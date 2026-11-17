import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext.jsx';
import {
  FireIcon, SlotsIcon, LiveCasinoIcon, ProvidersIcon,
  CasinoIcon, ChevronIcon, SunIcon, MoonIcon,
  DepositIcon, WithdrawIcon, ConvertIcon, ReceiptIcon, CoinIcon,
} from './Icons.jsx';

// Casino sub menu: only hot games, slots, live casino, providers remain.
// Each item carries its own icon tile with a distinct accent color.
const casinoItems = [
  { label: 'Hot Games', Icon: FireIcon, tone: 'hot' },
  { label: 'Slots', Icon: SlotsIcon, tone: 'slots' },
  { label: 'Live Casino', Icon: LiveCasinoIcon, tone: 'live' },
  { label: 'Providers', Icon: ProvidersIcon, tone: 'providers' },
];

// Money sub menu: deposit, withdraw, point convert, transaction.
const moneyItems = [
  { label: 'Deposit', Icon: DepositIcon, tone: 'deposit', to: '/money/deposit' },
  { label: 'Withdraw', Icon: WithdrawIcon, tone: 'withdraw', to: '/money/withdraw' },
  { label: 'Point Convert', Icon: ConvertIcon, tone: 'convert', to: '/money/point-convert' },
  { label: 'Transaction', Icon: ReceiptIcon, tone: 'transaction', to: '/money/transaction' },
];

// `open` = expanded (full width). When false, the sidebar becomes a narrow
// icon rail: everything above the Casino menu is hidden, only the Casino icons
// remain, and hovering an icon reveals its label as a flyout.
export default function Sidebar({ open }) {
  const { theme, setDark, setLight } = useTheme();
  const navigate = useNavigate();
  const [casinoOpen, setCasinoOpen] = useState(true);
  const [moneyOpen, setMoneyOpen] = useState(true);

  // Hot Games opens /hotgame; Slots opens /slot; Providers opens /providers;
  // Live Casino opens /livecasino; others go home.
  const clickCasinoItem = (label) => {
    if (label === 'Hot Games') navigate('/hotgame');
    else if (label === 'Slots') navigate('/slot');
    else if (label === 'Providers') navigate('/providers');
    else if (label === 'Live Casino') navigate('/livecasino');
    else navigate('/');
  };

  return (
    <aside className={`sidebar ${open ? '' : 'sidebar--rail'}`}>
      <div className="sidebar__scroll">
        {/* Promo section is hidden in the collapsed rail. */}
        <div className="promo">
          <a className="promo__app">
            <img className="promo__app-logo" src="/assets/logo.png" alt="BC Game" />
            <img className="promo__phone" src="/assets/app-phone.png" alt="" />
          </a>

          <a className="promo__ad promo__ad--sports" onClick={() => navigate('/sports')}>
            <img src="/assets/sports.png" alt="" />
            <span>Sports</span>
          </a>
          <a className="promo__ad promo__ad--casino" onClick={() => navigate('/casino')}>
            <img src="/assets/casino.png" alt="" />
            <span>Casino</span>
          </a>
        </div>

        {/* Casino group */}
        <div className="nav-group">
          <button className="nav-group__head" onClick={() => setCasinoOpen((v) => !v)}>
            <span className="nav-group__title">
              <CasinoIcon width={18} height={18} /> <span className="nav-group__label">Casino</span>
            </span>
            <ChevronIcon
              className="nav-group__chev"
              width={16}
              height={16}
              style={{ transform: casinoOpen ? 'rotate(90deg)' : 'none', transition: 'transform .2s' }}
            />
          </button>

          {(casinoOpen || !open) && (
            <ul className="nav-dropdown">
              {casinoItems.map(({ label, Icon, tone }) => (
                <li key={label}>
                  <a className="nav-dropdown__item" onClick={() => clickCasinoItem(label)}>
                    <span className={`nav-dropdown__ico nav-dropdown__ico--${tone}`}>
                      <Icon width={18} height={18} />
                    </span>
                    <span className="nav-dropdown__text">{label}</span>
                    {/* Flyout label shown when collapsed and hovered. */}
                    <span className="nav-dropdown__flyout">{label}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Money group */}
        <div className="nav-group">
          <button className="nav-group__head" onClick={() => setMoneyOpen((v) => !v)}>
            <span className="nav-group__title">
              <CoinIcon width={18} height={18} /> <span className="nav-group__label">Money</span>
            </span>
            <ChevronIcon
              className="nav-group__chev"
              width={16}
              height={16}
              style={{ transform: moneyOpen ? 'rotate(90deg)' : 'none', transition: 'transform .2s' }}
            />
          </button>

          {(moneyOpen || !open) && (
            <ul className="nav-dropdown">
              {moneyItems.map(({ label, Icon, tone, to }) => (
                <li key={label}>
                  <a className="nav-dropdown__item" onClick={() => navigate(to)}>
                    <span className={`nav-dropdown__ico nav-dropdown__ico--${tone}`}>
                      <Icon width={18} height={18} />
                    </span>
                    <span className="nav-dropdown__text">{label}</span>
                    <span className="nav-dropdown__flyout">{label}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Bottom: dark / light theme switch. */}
      <div className="sidebar__footer">
        <div className="theme-switch">
          <button
            className={`theme-switch__btn ${theme === 'dark' ? 'is-active' : ''}`}
            onClick={setDark}
            aria-label="Dark theme"
          >
            <MoonIcon width={16} height={16} /> <span className="theme-switch__label">Dark</span>
          </button>
          <button
            className={`theme-switch__btn ${theme === 'light' ? 'is-active' : ''}`}
            onClick={setLight}
            aria-label="Light theme"
          >
            <SunIcon width={16} height={16} /> <span className="theme-switch__label">Light</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
