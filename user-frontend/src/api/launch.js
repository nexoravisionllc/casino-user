import { apiGet } from './client.js';

// Read the signed-in user's JWT (if any) so the backend can resolve/create the
// player's FortuneGate UserCode. Anonymous launches send no token and fall back
// to the shared demo user code.
function authToken() {
  try {
    return JSON.parse(localStorage.getItem('auth'))?.token ?? null;
  } catch {
    return null;
  }
}

// Open a game in a new window. Must be called from inside a click handler so the
// browser allows the popup: the blank window opens synchronously, then we fill
// in the real URL once the backend responds. Seamless play needs a logged-in
// user (to resolve their FortuneGate UserCode), so prompt sign-in if anonymous.
export async function launchGameWindow(apiPath) {
  const token = authToken();
  if (!token) {
    window.dispatchEvent(new Event('auth:required'));
    return;
  }
  const win = window.open('', '_blank');
  try {
    const res = await apiGet(apiPath, token);
    // Session expired / not recognized: close the tab and prompt sign-in.
    if (res?.requireLogin) {
      if (win) win.close();
      window.dispatchEvent(new Event('auth:required'));
      return;
    }
    if (res?.url && win) win.location.href = res.url;
    else if (res?.url) window.open(res.url, '_blank');
    else if (win) win.close();
  } catch {
    if (win) win.close();
  }
}

// Launch a game already stored in the Games DB (Hot Games / Slots — have a uid).
export const launchByUid = (uid) => launchGameWindow(`/games/launch/${uid}`);

// Launch a game by symbol + provider (Game of the Week — hardcoded PP tiles).
export const launchBySymbol = (symbol, providerId = 1) =>
  launchGameWindow(`/games/launch-symbol?providerId=${providerId}&symbol=${encodeURIComponent(symbol)}`);
