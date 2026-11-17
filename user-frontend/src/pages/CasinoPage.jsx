import Footer from '../components/Footer.jsx';
import { LiveCasinoIcon } from '../components/Icons.jsx';
import { launchBySymbol } from '../api/launch.js';
import { LIVE_PROVIDERS } from '../data/liveProviders.js';
import { useSettings } from '../context/SettingsContext.jsx';

// /livecasino: when Live Casino is on (1) it shows the live provider tiles
// (Evolution / Pragmatic Play Live); clicking a tile enters that provider's
// lobby. When off (0) it shows "Coming soon". Nothing renders until the flag
// loads, so live content never flashes in.
export default function CasinoPage() {
  const { liveCasino, loaded } = useSettings();

  if (!loaded) return null;

  if (!liveCasino) {
    return (
      <div className="coming-soon">
        <h1>Live Casino</h1>
        <p>Coming soon</p>
      </div>
    );
  }

  return (
    <>
      <section className="providers-page">
        <h1 className="slot-page__title">
          <LiveCasinoIcon width={22} height={22} /> Live Casino
        </h1>

        <div className="providers-grid">
          {LIVE_PROVIDERS.map((p) => (
            <article
              className="provider-item"
              key={p.providerId}
              onClick={() => launchBySymbol(p.symbol, p.providerId)}
            >
              <div className="provider-card">
                <img src={p.image} alt={p.name} loading="lazy" />
              </div>
              <span className="provider-item__name">{p.name}</span>
            </article>
          ))}
        </div>
      </section>

      <Footer />
    </>
  );
}
