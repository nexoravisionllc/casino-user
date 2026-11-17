import { useEffect, useState } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import Footer from '../components/Footer.jsx';
import { ChevronIcon, ChevronLeftIcon, UserIcon } from '../components/Icons.jsx';
import { apiGet } from '../api/client.js';
import { launchByUid } from '../api/launch.js';
import { isLiveProviderName } from '../data/liveProviders.js';

const PAGE_SIZE = 40;

// /providers/:name — every game from one provider, paginated. The back arrow
// returns to the providers grid; clicking a game launches it in a new window.
export default function ProviderGamesPage() {
  const { name } = useParams();
  const providerName = decodeURIComponent(name ?? '');
  const navigate = useNavigate();

  // Live providers (Evolution / Pragmatic Play Live) never show a game list;
  // they are handled by the /providers page (lobby launch / Coming soon).
  const isLive = isLiveProviderName(providerName);

  const [games, setGames] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [pageInput, setPageInput] = useState('1');

  // Fetch the current page whenever the provider or page changes.
  useEffect(() => {
    if (isLive) { setGames([]); setTotalPages(0); return; }
    let cancelled = false;
    apiGet(`/games/by-provider/${encodeURIComponent(providerName)}?page=${page}&pageSize=${PAGE_SIZE}`)
      .then((res) => {
        if (cancelled) return;
        setGames(res?.items ?? []);
        setTotalPages(res?.totalPages ?? 0);
        setPageInput(String(res?.page ?? 1));
        window.scrollTo({ top: 0, behavior: 'smooth' });
      })
      .catch(() => {
        if (!cancelled) { setGames([]); setTotalPages(0); }
      });
    return () => { cancelled = true; };
  }, [providerName, page, isLive]);

  const goTo = (p) => {
    const target = Math.min(Math.max(1, p), Math.max(1, totalPages));
    setPage(target);
  };

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

  // A live provider is entered from the Providers page (straight into its
  // lobby), not a game list.
  if (isLive) return <Navigate to="/providers" replace />;

  return (
    <>
      <section className="provider-games">
        {/* Header: back arrow + provider name */}
        <div className="provider-games__head">
          <button className="provider-games__back" onClick={() => navigate('/providers')} aria-label="Back to providers">
            <ChevronLeftIcon width={20} height={20} />
          </button>
          <h1 className="provider-games__title">{providerName}</h1>
        </div>

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
            <button
              className="pager__btn"
              onClick={() => goTo(page - 1)}
              disabled={page <= 1}
              aria-label="Previous page"
            >
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
            <button
              className="pager__btn"
              onClick={() => goTo(page + 1)}
              disabled={page >= totalPages}
              aria-label="Next page"
            >
              <ChevronIcon width={16} height={16} />
            </button>
          </div>
        )}
      </section>

      <Footer />
    </>
  );
}
