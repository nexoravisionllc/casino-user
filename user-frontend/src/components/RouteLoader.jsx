import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

// Full-screen loading screen shown briefly on every route change: the logo sits
// large in the center with a grass-green ring spinning around it.
export default function RouteLoader() {
  const { pathname } = useLocation();
  const [loading, setLoading] = useState(false);
  const first = useRef(true);

  useEffect(() => {
    // Skip the very first render (initial page load, not a navigation).
    if (first.current) { first.current = false; return; }
    setLoading(true);
    const id = setTimeout(() => setLoading(false), 650);
    return () => clearTimeout(id);
  }, [pathname]);

  if (!loading) return null;

  return (
    <div className="route-loader" role="status" aria-live="polite" aria-label="Loading">
      <div className="route-loader__badge">
        <span className="route-loader__ring" />
        <img className="route-loader__logo" src="/assets/logo-mark.svg" alt="Loading" />
      </div>
    </div>
  );
}
