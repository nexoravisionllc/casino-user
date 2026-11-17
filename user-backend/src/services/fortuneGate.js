import { config } from '../config.js';

/** HTTP client for the FortuneGate game API (front page: launch only). */

const options = config.fortuneGate;

// user_code is a 64-bit integer; keep its digits exact.
const keepUserCodeExact = (key, value, context) =>
  (key === 'user_code' && typeof value === 'number' ? context.source : value);

async function post(path, payload) {
  const res = await fetch(`${options.baseUrl}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${options.token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(100_000),
  });
  if (!res.ok)
    throw new Error(`Response status code does not indicate success: ${res.status} (${res.statusText}).`);

  // Standard envelope: { code, message, data }; code 0 means success.
  const body = JSON.parse(await res.text(), keepUserCodeExact);
  if (!body || (body.code ?? 0) !== 0)
    throw new Error(`FortuneGate ${path} failed: code=${body?.code ?? ''}, message=${body?.message ?? ''}`);
  return body.data;
}

export const fortuneGate = {
  /** POST /v4/game/game-url: the play URL for one game, or '' when none came back. */
  async getGameUrl(gameSymbol, providerId, userCode) {
    const data = await post(options.gameUrlPath, {
      game_symbol: gameSymbol,
      lang: options.lang,
      provider_id: providerId,
      return_url: options.returnUrl,
      user_code: JSON.rawJSON(userCode),
      win_ratio: JSON.rawJSON(options.defaultWinRatio),
    });
    return data?.game_url ?? '';
  },

  /** POST /v4/user/create: creates (or returns) the player; its user_code as digit text. */
  async createUser(name) {
    const data = await post(options.userCreatePath, { name });
    return String(data?.user_code ?? '0');
  },
};
