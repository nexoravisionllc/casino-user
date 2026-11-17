import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useModal } from '../context/ModalContext.jsx';
import { useProviders } from '../hooks/useProviders.js';
import { apiGet } from '../api/client.js';
import { launchByUid } from '../api/launch.js';
import { SlotsIcon, WalletIcon, ConvertIcon, FireIcon } from './Icons.jsx';

const features = [
  { Icon: SlotsIcon, text: 'Instant play in your browser, no downloads' },
  { Icon: WalletIcon, text: 'One wallet for every game and provider' },
  { Icon: ConvertIcon, text: 'Convert points to balance at any time' },
];

const formatCount = (n) => Number(n).toLocaleString('en-US');

// Hero banner. Left: brand, headline, pitch, features, calls to action and
// live stats. Right: a fanned stack of current hot games (click to play).
export default function Banner() {
  const { user } = useAuth();
  const { openSignUp } = useModal();
  const navigate = useNavigate();
  const providers = useProviders();
  const [games, setGames] = useState([]);
  const [totalGames, setTotalGames] = useState(null);

  useEffect(() => {
    let cancelled = false;
    apiGet('/games/hot?count=5')
      .then((rows) => { if (!cancelled) setGames((rows ?? []).filter((g) => g.imageUrl).slice(0, 5)); })
      .catch(() => {});
    apiGet('/games/top?page=1&pageSize=1')
      .then((res) => { if (!cancelled && res?.total) setTotalGames(res.total); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const highlight = providers.slice(0, 3).map((p) => p.name).join(', ');

  return (
    <section className="banner">
      <div className="banner__glow" aria-hidden="true" />

      <div className="banner__content">
        <span className="banner__eyebrow">
          <img src="/assets/logo-mark.svg" alt="" /> Nexora Vision Play
        </span>

        <h1 className="banner__title">
          Your next big win <span className="banner__accent">starts here.</span>
        </h1>

        <p className="banner__sub">
          Spin {totalGames ? `${formatCount(totalGames)}+` : 'over a thousand'} slots and live
          tables{providers.length ? ` from ${providers.length} leading providers` : ''}
          {highlight ? ` like ${highlight}` : ''}. All in one place.
        </p>

        <ul className="banner__features">
          {features.map(({ Icon, text }) => (
            <li key={text}><Icon width={16} height={16} /> {text}</li>
          ))}
        </ul>

        <div className="banner__actions">
          {user ? (
            <button className="btn btn--primary banner__cta" onClick={() => navigate('/hotgame')}>
              Play Hot Games
            </button>
          ) : (
            <button className="btn btn--primary banner__cta" onClick={openSignUp}>
              Create Free Account
            </button>
          )}
          <button className="btn banner__cta banner__cta--ghost" onClick={() => navigate('/providers')}>
            Browse Providers
          </button>
        </div>

        <dl className="banner__stats">
          {totalGames && (
            <div><dt>{formatCount(totalGames)}+</dt><dd>Games</dd></div>
          )}
          {providers.length > 0 && (
            <div><dt>{providers.length}</dt><dd>Providers</dd></div>
          )}
          <div><dt>24/7</dt><dd>Play anytime</dd></div>
        </dl>
      </div>

      {games.length > 0 && (
        <div className="banner__fan" aria-label="Hot games">
          {games.map((g, i) => (
            <button
              type="button"
              key={g.uid}
              className={`fan-card fan-card--${i}`}
              onClick={() => launchByUid(g.uid)}
              title={`Play ${g.name}`}
            >
              <img src={g.imageUrl} alt={g.name} />
              <span className="fan-card__meta">
                <strong>{g.name}</strong>
                <span>{g.provider}</span>
              </span>
            </button>
          ))}
          <span className="banner__hot-tag"><FireIcon width={14} height={14} /> Hot right now</span>
        </div>
      )}
    </section>
  );
}
