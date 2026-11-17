import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import GameRow from './GameRow.jsx';
import { FireIcon, SlotsIcon } from './Icons.jsx';
import { apiGet } from '../api/client.js';
import { launchByUid } from '../api/launch.js';
import { useSettings } from '../context/SettingsContext.jsx';

// Map an API game row to the card shape used by GameRow.
const toCard = (g) => ({ id: g.uid, title: g.name, provider: g.provider, players: g.review, img: g.imageUrl });

// The Hot Games / Slots rows on the home page. Slots hides when disabled in
// settings; the "All" buttons jump to the full pages, and cards launch the game in a new window.
export default function CasinoSections() {
  const navigate = useNavigate();
  const { slots: showSlots } = useSettings();
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
      {showSlots && <GameRow title="Slots" Icon={SlotsIcon} games={slotsGames} onLaunch={(g) => launchByUid(g.id)} onAll={() => navigate('/slot')} />}
    </>
  );
}
