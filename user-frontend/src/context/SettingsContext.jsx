import { createContext, useContext, useEffect, useState } from 'react';
import { apiGet } from '../api/client.js';

// Provides the game-visibility flags (Slots / Live Casino / Sports) from the backend.
const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  // `loaded` lets pages avoid revealing live content before the flags arrive.
  const [flags, setFlags] = useState({ slots: true, liveCasino: true, sports: true, loaded: false });

  useEffect(() => {
    apiGet('/games/settings')
      .then((rows) => {
        const map = {};
        (rows ?? []).forEach((r) => { map[r.name] = r.showEnable; });
        setFlags({
          slots: map['Slots'] ?? true,
          liveCasino: map['Live Casino'] ?? true,
          sports: map['Sports'] ?? true,
          loaded: true,
        });
      })
      .catch(() => setFlags((f) => ({ ...f, loaded: true })));
  }, []);

  return (
    <SettingsContext.Provider value={flags}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within a SettingsProvider');
  return ctx;
}
