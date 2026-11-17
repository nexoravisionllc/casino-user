import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import GameRow from './GameRow.jsx';
import { FireIcon, LiveCasinoIcon, SlotsIcon } from './Icons.jsx';
import { apiGet } from '../api/client.js';
import { launchByUid, launchBySymbol } from '../api/launch.js';
import { LIVE_PROVIDERS } from '../data/liveProviders.js';
import { useSettings } from '../context/SettingsContext.jsx';

// Map an API game row to the card shape used by GameRow.
const toCard = (g) => ({ id: g.uid, title: g.name, provider: g.provider, players: g.review, img: g.imageUrl });

// The Live Casino row is the two live providers (Evolution / Pragmatic Play Live)
// as tiles; each carries its lobby symbol so a click enters that provider lobby.
const liveCards = LIVE_PROVIDERS.map((p) => ({
  id: p.providerId,
  title: p.name,
  provider: 'Live Casino',
  players: '',
  img: p.image,
  symbol: p.symbol,
  providerId: p.providerId,
}));

// The shared Hot Games / Live Casino / Slots rows used by both the home page and
// the /casino lobby. Live Casino and Slots hide when disabled in settings; the
// "All" buttons jump to the full pages, and cards launch the game in a new window.
export default function CasinoSections() {
  const navigate = useNavigate();
  const { slots: showSlots, liveCasino: showLiveCasino } = useSettings();
  const [hotGames, setHotGames] = useState([]);
  const [slotsGames, setSlotsGames] = useState([]);

  useEffect(() => {
    let cancelled = false;
    apiGet('/games/hot?count=20')
      .then((rows) => { if (!cancelled) setHotGames((rows ?? []).map(toCard)); })
      .catch(() => { if (!cancelled) setHotGames([]); });
    apiGet('/games/slots?count=50')
      .then((rows) => { if (!cancelled) setSlotsGames((rows ?? []).map(toCard)); })
      .catch(() => { if (!cancelled) setSlotsGames([]); });
    return () => { cancelled = true; };
  }, []);

  return (
    <>
      <GameRow title="Hot Games" Icon={FireIcon} games={hotGames} onLaunch={(g) => launchByUid(g.id)} onAll={() => navigate('/hotgame')} />
      {showLiveCasino && (
        <GameRow
          title="Live Casino"
          Icon={LiveCasinoIcon}
          games={liveCards}
          onLaunch={(g) => launchBySymbol(g.symbol, g.providerId)}
          onAll={() => navigate('/livecasino')}
        />
      )}
      {showSlots && <GameRow title="Slots" Icon={SlotsIcon} games={slotsGames} onLaunch={(g) => launchByUid(g.id)} onAll={() => navigate('/slot')} />}
    </>
  );
}
