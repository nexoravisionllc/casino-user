import { config } from '../config.js';
import { log } from '../lib/log.js';

/**
 * Tells the admin backend (which hosts the SignalR wallet hub) that a user's
 * wallet changed, so the front-page header updates live.
 */
export async function notifyWallet(loginId, balance, point) {
  try {
    await fetch(`${config.adminBackend.baseUrl}/api/wallet/notify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'X-Notify-Secret': config.adminBackend.notifySecret,
      },
      body: JSON.stringify({ loginId, balance, point }),
      signal: AbortSignal.timeout(3000),
    });
  } catch (err) {
    // Never let a push failure break the game callback.
    log.warn(`Wallet push notify failed for ${loginId}.`, err);
  }
}
