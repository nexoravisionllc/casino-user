// The live-casino providers (Evolution, Pragmatic Play Live). From the Providers
// page these are entered straight into the provider lobby rather than shown as
// a game list, and only while the admin "Live Casino" setting is on. The lobby
// symbols are the providers' lobby games.
export const LIVE_PROVIDERS = [
  { providerId: 6, name: 'Evolution', symbol: 'L_EVL0001s' },
  { providerId: 8, name: 'Pragmatic Play Live', symbol: '101' },
];

const norm = (s) => (s || '').trim().toLowerCase();

export const isLiveProviderId = (id) => LIVE_PROVIDERS.some((p) => p.providerId === id);
export const isLiveProviderName = (name) => LIVE_PROVIDERS.some((p) => norm(p.name) === norm(name));
export const liveProviderById = (id) => LIVE_PROVIDERS.find((p) => p.providerId === id) || null;
export const liveProviderByName = (name) => LIVE_PROVIDERS.find((p) => norm(p.name) === norm(name)) || null;
