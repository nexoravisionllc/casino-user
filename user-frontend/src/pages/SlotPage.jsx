import { useEffect, useMemo, useState } from 'react';
import Footer from '../components/Footer.jsx';
import { SlotsIcon, SearchIcon, UserIcon } from '../components/Icons.jsx';
import { apiGet } from '../api/client.js';
import { launchByUid } from '../api/launch.js';
import { isLiveProviderName } from '../data/liveProviders.js';

// How many cards to reveal at once (infinite-scroll style "Load more").
const PAGE = 48;

const SORTS = ['Popular', 'A-Z', 'Z-A'];

// Map an API game row to the card shape.
const toCard = (g) => ({ id: g.uid, title: g.name, provider: g.provider, players: g.review, img: g.imageUrl });

// /slot: browse every slot game in the Games DB with search, sort and a
// provider filter. Layout mirrors the reference slots page.
export default function SlotPage() {
  const [games, setGames] = useState([]);
  const [providers, setProviders] = useState([]);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('Popular');
  const [provider, setProvider] = useState('All');
  const [visible, setVisible] = useState(PAGE);

  // Load the full slot catalog and the provider names once.
  useEffect(() => {
    let cancelled = false;
    apiGet('/games/list')
      .then((rows) => { if (!cancelled) setGames((rows ?? []).map(toCard)); })
      .catch(() => { if (!cancelled) setGames([]); });
    apiGet('/games/providers')
      .then((names) => { if (!cancelled) setProviders(names ?? []); })
      .catch(() => { if (!cancelled) setProviders([]); });
    return () => { cancelled = true; };
  }, []);

  // Filter (search + provider) then sort. Recomputed only when inputs change.
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    let list = games.filter((g) => {
      if (provider !== 'All' && g.provider !== provider) return false;
      if (term && !g.title.toLowerCase().includes(term)) return false;
      return true;
    });
    if (sort === 'A-Z') list = [...list].sort((a, b) => a.title.localeCompare(b.title));
    else if (sort === 'Z-A') list = [...list].sort((a, b) => b.title.localeCompare(a.title));
    else list = [...list].sort((a, b) => b.players - a.players); // Popular
    return list;
  }, [games, search, sort, provider]);

  // Reset paging whenever the visible set changes.
  useEffect(() => { setVisible(PAGE); }, [search, sort, provider]);

  const shown = filtered.slice(0, visible);

  // Launch via the shared helper so the user's JWT is attached (needed to
  // resolve their FortuneGate UserCode) and sign-in is prompted when anonymous.
  const [launching, setLaunching] = useState(null);
  const launchGame = async (g) => {
    if (launching) return;
    setLaunching(g.id);
    try {
      await launchByUid(g.id);
    } finally {
      setLaunching(null);
    }
  };

  return (
    <>
      <section className="slot-page">
        {/* Search games */}
        <div className="slot-search">
          <SearchIcon width={18} height={18} />
          <input
            type="text"
            placeholder="Search games"
            value={search}
            autoComplete="off"
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Title */}
        <h1 className="slot-page__title">
          <SlotsIcon width={22} height={22} /> Slots
        </h1>

        {/* Sort By + Providers */}
        <div className="slot-filters">
          <label className="slot-select">
            <span className="slot-select__label">Sort By</span>
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              {SORTS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className="slot-select">
            <span className="slot-select__label">Providers</span>
            <select value={provider} onChange={(e) => setProvider(e.target.value)}>
              <option value="All">All</option>
              {/* Slots never include live providers, so hide them from the filter. */}
              {providers.filter((p) => !isLiveProviderName(p))
                .map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
        </div>

        {/* Game grid */}
        {shown.length === 0 ? (
          <p className="slot-empty">No games found.</p>
        ) : (
          <div className="slot-grid">
            {shown.map((g) => (
              <article className="game-card" key={g.id}>
                <button
                  type="button"
                  className={`game-card__img game-card__launch ${launching === g.id ? 'is-launching' : ''}`}
                  onClick={() => launchGame(g)}
                  aria-label={`Play ${g.title}`}
                >
                  <img src={g.img} alt={g.title} loading="lazy" />
                  <span className="game-card__players">
                    <UserIcon width={12} height={12} /> {g.players}
                  </span>
                  <span className="game-card__play">{launching === g.id ? 'Loading…' : 'Play'}</span>
                </button>
                <div className="game-card__meta">
                  <span className="game-card__title">{g.title}</span>
                  <span className="game-card__provider">{g.provider}</span>
                </div>
              </article>
            ))}
          </div>
        )}

        {visible < filtered.length && (
          <div className="slot-more">
            <button className="chip" onClick={() => setVisible((v) => v + PAGE)}>
              Load more
            </button>
          </div>
        )}
      </section>

      <Footer />
    </>
  );
}
