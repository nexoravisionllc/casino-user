import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { useProviders, useOpenProvider } from '../hooks/useProviders.js';
import {
  HomeIcon, FireIcon, SlotsIcon, ProvidersIcon, ChevronDownIcon, SunIcon, MoonIcon,
} from './Icons.jsx';

// Two-letter monogram used when a provider has no logo.
const initials = (name) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

// Left navigation. `open` = full panel; when false it becomes a narrow icon
// rail where hovering an icon shows its label as a flyout.
// The Casino panel holds the main game links plus the full provider list.
export default function Sidebar({ open }) {
  const { theme, setDark, setLight } = useTheme();
  const { slots: showSlots } = useSettings();
  const { pathname } = useLocation();
  const providers = useProviders();
  const openProvider = useOpenProvider();
  const [providersOpen, setProvidersOpen] = useState(true);

  const links = [
    { to: '/', label: 'Home', Icon: HomeIcon, end: true },
    { to: '/hotgame', label: 'Hot Games', Icon: FireIcon },
    showSlots && { to: '/slot', label: 'Slots', Icon: SlotsIcon },
    { to: '/providers', label: 'All Providers', Icon: ProvidersIcon, end: true },
  ].filter(Boolean);

  const activeProvider = pathname.startsWith('/providers/')
    ? decodeURIComponent(pathname.slice('/providers/'.length))
    : null;

  return (
    <aside className={`sidebar ${open ? '' : 'sidebar--rail'}`}>
      <div className="sidebar__scroll">
        <p className="sidebar__section">Casino</p>
        <ul className="snav">
          {links.map(({ to, label, Icon, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) => `snav__item ${isActive ? 'is-active' : ''}`}
              >
                <Icon width={18} height={18} className="snav__ico" />
                <span className="snav__text">{label}</span>
                <span className="snav__flyout">{label}</span>
              </NavLink>
            </li>
          ))}
        </ul>

        {/* Every provider, listed inline under the Casino panel. */}
        {open && providers.length > 0 && (
          <div className="sprov">
            <button
              type="button"
              className="sidebar__section sidebar__section--toggle"
              onClick={() => setProvidersOpen((v) => !v)}
              aria-expanded={providersOpen}
            >
              <span>Providers</span>
              <span className="sprov__count">{providers.length}</span>
              <ChevronDownIcon
                width={14}
                height={14}
                className="sprov__chev"
                style={{ transform: providersOpen ? 'none' : 'rotate(-90deg)' }}
              />
            </button>

            {providersOpen && (
              <ul className="snav">
                {providers.map((p) => (
                  <li key={p.providerId}>
                    <button
                      type="button"
                      className={`snav__item snav__item--prov ${activeProvider === p.name ? 'is-active' : ''}`}
                      onClick={() => openProvider(p)}
                      title={p.name}
                    >
                      <span className="sprov__logo">
                        {p.imageUrl
                          ? <img src={p.imageUrl} alt="" loading="lazy" />
                          : <span>{initials(p.name)}</span>}
                      </span>
                      <span className="snav__text">{p.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Bottom: dark / light theme switch. */}
      <div className="sidebar__footer">
        <div className="theme-switch">
          <button
            className={`theme-switch__btn ${theme === 'dark' ? 'is-active' : ''}`}
            onClick={setDark}
            aria-label="Dark theme"
          >
            <MoonIcon width={15} height={15} /> <span className="theme-switch__label">Dark</span>
          </button>
          <button
            className={`theme-switch__btn ${theme === 'light' ? 'is-active' : ''}`}
            onClick={setLight}
            aria-label="Light theme"
          >
            <SunIcon width={15} height={15} /> <span className="theme-switch__label">Light</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
