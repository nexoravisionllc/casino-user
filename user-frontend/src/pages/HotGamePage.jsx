import { useEffect, useState } from 'react';
import Footer from '../components/Footer.jsx';
import { ChevronIcon, ChevronLeftIcon, FireIcon, SearchIcon, UserIcon } from '../components/Icons.jsx';
import { apiGet } from '../api/client.js';
import { launchByUid } from '../api/launch.js';

const PAGE_SIZE = 40;

// /hotgame — the most popular games (by review) across all categories, with a
// name search and page-number pagination. Clicking a game launches it.
export default function HotGamePage() {
  const [games, setGames] = useState([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [pageInput, setPageInput] = useState('1');

  // Reset to the first page whenever the search term changes.
  useEffect(() => { setPage(1); }, [search]);

  // Fetch the current page (debounced so typing doesn't spam the backend).
  useEffect(() => {
    let cancelled = false;
    const term = search.trim();
    const run = () => {
      apiGet(`/games/top?page=${page}&pageSize=${PAGE_SIZE}&search=${encodeURIComponent(term)}`)
        .then((res) => {
          if (cancelled) return;
          setGames(res?.items ?? []);
          setTotalPages(res?.totalPages ?? 0);
          setPageInput(String(res?.page ?? 1));
          window.scrollTo({ top: 0, behavior: 'smooth' });
        })
        .catch(() => { if (!cancelled) { setGames([]); setTotalPages(0); } });
    };
    const id = setTimeout(run, term ? 250 : 0);
    return () => { cancelled = true; clearTimeout(id); };
  }, [search, page]);

  const goTo = (p) => setPage(Math.min(Math.max(1, p), Math.max(1, totalPages)));
  const submitPageInput = () => {
    const n = parseInt(pageInput, 10);
    if (Number.isFinite(n)) goTo(n);
    else setPageInput(String(page));
  };

  // Launch via the shared helper so the user's JWT is attached.
  const [launching, setLaunching] = useState(null);
  const launchGame = async (g) => {
    if (launching) return;
    setLaunching(g.uid);
    try {
      await launchByUid(g.uid);
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

        <h1 className="slot-page__title">
          <FireIcon width={22} height={22} /> Hot Games
        </h1>

        {games.length === 0 ? (
          <p className="slot-empty">No games found.</p>
        ) : (
          <div className="slot-grid">
            {games.map((g) => (
              <article className="game-card" key={g.uid}>
                <button
                  type="button"
                  className={`game-card__img game-card__launch ${launching === g.uid ? 'is-launching' : ''}`}
                  onClick={() => launchGame(g)}
                  aria-label={`Play ${g.name}`}
                >
                  <img src={g.imageUrl} alt={g.name} loading="lazy" />
                  <span className="game-card__players">
                    <UserIcon width={12} height={12} /> {g.review}
                  </span>
                  <span className="game-card__play">{launching === g.uid ? 'Loading…' : 'Play'}</span>
                </button>
                <div className="game-card__meta">
                  <span className="game-card__title">{g.name}</span>
                  <span className="game-card__provider">{g.provider}</span>
                </div>
              </article>
            ))}
          </div>
        )}

        {/* Pagination: < [page] of N > */}
        {totalPages > 1 && (
          <div className="pager">
            <button className="pager__btn" onClick={() => goTo(page - 1)} disabled={page <= 1} aria-label="Previous page">
              <ChevronLeftIcon width={16} height={16} />
            </button>
            <input
              className="pager__input"
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value.replace(/\D/g, ''))}
              onBlur={submitPageInput}
              onKeyDown={(e) => { if (e.key === 'Enter') submitPageInput(); }}
              aria-label="Page number"
            />
            <span className="pager__total">of {totalPages}</span>
            <button className="pager__btn" onClick={() => goTo(page + 1)} disabled={page >= totalPages} aria-label="Next page">
              <ChevronIcon width={16} height={16} />
            </button>
          </div>
        )}
      </section>

      <Footer />
    </>
  );
}
