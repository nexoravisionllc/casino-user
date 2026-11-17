import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet } from '../api/client.js';
import { launchBySymbol } from '../api/launch.js';
import { liveProviderById } from '../data/liveProviders.js';
import { useSettings } from '../context/SettingsContext.jsx';

// The provider list is shared by the sidebar and the /providers page, so it is
// fetched once per page load and cached at module level.
let cache = null;
let pending = null;

function loadProviders() {
  if (cache) return Promise.resolve(cache);
  if (!pending) {
    pending = apiGet('/games/provider-cards')
      .then((rows) => { cache = rows ?? []; return cache; })
      .catch(() => { pending = null; return []; });
  }
  return pending;
}

export function useProviders() {
  const [providers, setProviders] = useState(cache ?? []);

  useEffect(() => {
    let cancelled = false;
    loadProviders().then((rows) => { if (!cancelled) setProviders(rows); });
    return () => { cancelled = true; };
  }, []);

  return providers;
}

// Live providers (Evolution / Pragmatic Play Live) do not open a game list:
// when Live Casino is on they go straight to the provider lobby, otherwise a
// "Coming soon" notice is shown. Every other provider opens its game list.
export function useOpenProvider() {
  const navigate = useNavigate();
  const { liveCasino } = useSettings();

  return useCallback((p) => {
    const live = liveProviderById(p.providerId);
    if (live) {
      if (!liveCasino) { window.alert('Coming soon'); return; }
      launchBySymbol(live.symbol, live.providerId);
      return;
    }
    navigate(`/providers/${encodeURIComponent(p.name)}`);
  }, [navigate, liveCasino]);
}
