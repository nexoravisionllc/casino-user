import { useEffect } from 'react';
import * as signalR from '@microsoft/signalr';
import { useAuth } from '../context/AuthContext.jsx';

// The admin backend hosts the wallet hub (it owns all balance/point changes).
//const HUB_URL = 'https://adminbackend.fufvkgylntiyepgk.net/hubs/wallet';
const HUB_URL = 'http://localhost:5100/hubs/wallet';

// While a user is signed in, keep a live connection to the wallet hub and push
// balance/point changes straight into the auth state (so the header updates).
export default function WalletRealtime() {
  const { user, updateWallet } = useAuth();
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
    conn.onreconnected(subscribe);

    return () => {
      active = false;
      started.finally(() => conn.stop().catch(() => {}));
    };
  }, [loginId, updateWallet]);

  return null;
}
