import { useNavigate } from 'react-router-dom';
import { gameOfWeek, bigWins } from '../data/games.js';
import { CasinoIcon, SportsIcon, UserIcon } from './Icons.jsx';
import GameRow from './GameRow.jsx';
import { launchBySymbol } from '../api/launch.js';

// The Pragmatic Play game symbol is the image file name (e.g. .../vs20multcann.png).
const symbolFromImg = (img) => img.split('/').pop().replace(/\.png$/i, '');

// "Game of the Week": a flowing slider like Hot Games, arrows only (no All).
// These are Pragmatic Play games (provider_id 1); clicking launches by symbol.
export function GameOfWeek() {
  return (
    <GameRow
      title="Game of the Week"
      games={gameOfWeek}
      showAll={false}
      onLaunch={(g) => launchBySymbol(symbolFromImg(g.img), 1)}
    />
  );
}

export function RecentBigWins() {
  // Duplicate the list so the marquee can loop seamlessly.
  const loop = [...bigWins, ...bigWins];

  return (
    <section className="row">
      <div className="row__head">
        <h2 className="row__title">Recent Big Wins</h2>
      </div>

      {/* Continuously flowing (marquee) row of recent wins. */}
      <div className="marquee">
        <div className="marquee__track">
          {loop.map((w, i) => (
            <article className="win-card" key={`${w.id}-${i}`}>
              <img src={w.img} alt={w.title} loading="lazy" />
              <div className="win-card__meta">
                <span className="win-card__title">{w.title}</span>
                <span className="win-card__player">
                  <UserIcon width={12} height={12} /> {w.player}
                </span>
                <span className="win-card__amount">
                  {w.amount} {w.currency}
                </span>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

// Category tiles: only Casino and Sports remain
// (poker, racing, lottery, up or down, bingo removed).
export function GameCategories() {
  const navigate = useNavigate();
  return (
    <section className="categories">
      <a className="category category--casino" onClick={() => navigate('/casino')}>
        <div className="category__icon"><CasinoIcon width={28} height={28} /></div>
        <div className="category__text">
          <strong>Casino</strong>
          <span>Slots, Live Casino & more</span>
        </div>
        <img className="category__art" src="/assets/casino.png" alt="" />
      </a>
      <a className="category category--sports" onClick={() => navigate('/sports')}>
        <div className="category__icon"><SportsIcon width={28} height={28} /></div>
        <div className="category__text">
          <strong>Sports</strong>
          <span>Pre-match & Live betting</span>
        </div>
        <img className="category__art" src="/assets/sports.png" alt="" />
      </a>
    </section>
  );
}
