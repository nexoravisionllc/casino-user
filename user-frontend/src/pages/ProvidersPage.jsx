import { useMemo, useState } from 'react';
import Footer from '../components/Footer.jsx';
import { ProvidersIcon, SearchIcon } from '../components/Icons.jsx';
import { useProviders, useOpenProvider } from '../hooks/useProviders.js';

// /providers: a searchable grid of game providers. Each card shows the
// provider logo (served by the admin backend) with the name as a fallback.
export default function ProvidersPage() {
  const providers = useProviders();
  const openProvider = useOpenProvider();
  const [search, setSearch] = useState('');

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
