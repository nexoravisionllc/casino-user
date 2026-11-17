import { useEffect } from 'react';
import * as signalR from '@microsoft/signalr';
import { useAuth } from '../context/AuthContext.jsx';

// The admin backend hosts the wallet hub (it owns all balance/point changes).
// The hub is NOT on the user backend, so a relative '/hubs/wallet' only works if
// something forwards it to the admin backend (the Vite dev proxy does). In
// production set VITE_WALLET_HUB_URL to the admin backend's full hub URL, e.g.
// https://adminbackend.example.net/hubs/wallet (and add this site's origin to
// the admin backend's CORS_ORIGINS).
const HUB_URL = import.meta.env.VITE_WALLET_HUB_URL || '/hubs/wallet';

// While a user is signed in, keep a live connection to the wallet hub and push
// balance/point changes straight into the auth state (so the header updates).
export default function WalletRealtime() {
  const { user, updateWallet, refreshUser } = useAuth();
  const loginId = user?.loginId;

  useEffect(() => {
    if (!loginId) return;

    const conn = new signalR.HubConnectionBuilder()
      .withUrl(HUB_URL)
      .withAutomaticReconnect()
      .build();

    conn.on('walletUpdated', (data) => {
      if (data) updateWallet({ balance: data.balance, point: data.point });
    });

    let active = true;
    const subscribe = () => conn.invoke('SubscribeUser', loginId).catch(() => {});
    // Wait for negotiation to finish before stopping in cleanup — avoids the
    // harmless "stopped during negotiation" error from React StrictMode's
    // double mount/unmount in dev.
    const started = conn.start().then(() => { if (active) subscribe(); }).catch(() => {});
    // Pushes missed while disconnected are lost, so re-read the wallet too.
    conn.onreconnected(() => { subscribe(); refreshUser(); });

    return () => {
      active = false;
      started.finally(() => conn.stop().catch(() => {}));
    };
  }, [loginId, updateWallet, refreshUser]);

  return null;
}
