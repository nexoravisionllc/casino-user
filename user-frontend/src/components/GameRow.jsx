import { useRef, useState } from 'react';
import { ChevronIcon, ChevronLeftIcon, UserIcon } from './Icons.jsx';

// A horizontally scrolling row of game cards with left/right controls.
// When `onLaunch` is provided, each card image becomes a button that launches
// the game (onLaunch receives the card object).
export default function GameRow({ title, Icon, games, showAll = true, onLaunch, onAll }) {
  const trackRef = useRef(null);
  const [launchingId, setLaunchingId] = useState(null);

  // The track has a hidden scrollbar and no free scrolling; it only moves when
  // the arrow controls are clicked.
  const scrollBy = (dir) => {
    const el = trackRef.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' });
  };

  const handleLaunch = async (g) => {
    if (!onLaunch || launchingId) return;
    setLaunchingId(g.id);
    try {
      await onLaunch(g);
    } finally {
      setLaunchingId(null);
    }
  };

  return (
    <section className="row">
      <div className="row__head">
        <h2 className="row__title">
          {Icon && <Icon width={20} height={20} />} {title}
        </h2>
        <div className="row__controls">
          {showAll && <button className="chip row__ctrl" onClick={onAll}>All</button>}
          <button className="icon-btn row__ctrl" onClick={() => scrollBy(-1)} aria-label="Scroll left">
            <ChevronLeftIcon width={18} height={18} />
          </button>
          <button className="icon-btn row__ctrl" onClick={() => scrollBy(1)} aria-label="Scroll right">
            <ChevronIcon width={18} height={18} />
          </button>
        </div>
      </div>

      <div className="row__track row__track--arrows" ref={trackRef}>
        {games.map((g) => (
          <article className="game-card" key={g.id}>
            {onLaunch ? (
              <button
                type="button"
                className={`game-card__img game-card__launch ${launchingId === g.id ? 'is-launching' : ''}`}
                onClick={() => handleLaunch(g)}
                aria-label={`Play ${g.title}`}
              >
                <img src={g.img} alt={g.title} loading="lazy" />
                {g.players ? (
                  <span className="game-card__players">
                    <UserIcon width={12} height={12} /> {g.players}
                  </span>
                ) : null}
                <span className="game-card__play">{launchingId === g.id ? 'Loading…' : 'Play'}</span>
              </button>
            ) : (
              <div className="game-card__img">
                <img src={g.img} alt={g.title} loading="lazy" />
                {g.players ? (
                  <span className="game-card__players">
                    <UserIcon width={12} height={12} /> {g.players}
                  </span>
                ) : null}
              </div>
            )}
            <div className="game-card__meta">
              <span className="game-card__title">{g.title}</span>
              <span className="game-card__provider">{g.provider}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
