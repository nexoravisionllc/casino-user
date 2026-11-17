import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Footer from '../components/Footer.jsx';
import { ProvidersIcon, SearchIcon } from '../components/Icons.jsx';
import { apiGet } from '../api/client.js';
import { launchBySymbol } from '../api/launch.js';
import { liveProviderById } from '../data/liveProviders.js';
import { useSettings } from '../context/SettingsContext.jsx';

// /providers: a searchable grid of game providers. Each card shows the
// provider logo (served by the admin backend) with the name as a fallback.
export default function ProvidersPage() {
  const navigate = useNavigate();
  const { liveCasino } = useSettings();
  const [providers, setProviders] = useState([]);
  const [search, setSearch] = useState('');

  // Live providers (Evolution / Pragmatic Play Live) do not open a game list:
  // when Live Casino is on they go straight to the provider lobby, otherwise a
  // "Coming soon" notice is shown. Every other provider opens its game list.
  const openProvider = (p) => {
    const live = liveProviderById(p.providerId);
    if (live) {
      if (!liveCasino) { window.alert('Coming soon'); return; }
      launchBySymbol(live.symbol, live.providerId);
      return;
    }
    navigate(`/providers/${encodeURIComponent(p.name)}`);
  };

  useEffect(() => {
    let cancelled = false;
    apiGet('/games/provider-cards')
      .then((rows) => { if (!cancelled) setProviders(rows ?? []); })
      .catch(() => { if (!cancelled) setProviders([]); });
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return providers;
    return providers.filter((p) => p.name.toLowerCase().includes(term));
  }, [providers, search]);

  return (
    <>
      <section className="providers-page">
        {/* Search providers */}
        <div className="slot-search">
          <SearchIcon width={18} height={18} />
          <input
            type="text"
            placeholder="Search providers"
            value={search}
            autoComplete="off"
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <h1 className="slot-page__title">
          <ProvidersIcon width={22} height={22} /> Providers
        </h1>

        {filtered.length === 0 ? (
          <p className="slot-empty">No providers found.</p>
        ) : (
          <div className="providers-grid">
            {filtered.map((p) => (
              <article
                className="provider-item"
                key={p.providerId}
                onClick={() => openProvider(p)}
              >
                <div className="provider-card">
                  {p.imageUrl ? (
                    <img src={p.imageUrl} alt={p.name} loading="lazy" />
                  ) : (
                    <span className="provider-card__name">{p.name}</span>
                  )}
                </div>
                <span className="provider-item__name">{p.name}</span>
              </article>
            ))}
          </div>
        )}
      </section>

      <Footer />
    </>
  );
}
