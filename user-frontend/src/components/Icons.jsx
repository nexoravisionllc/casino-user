// Inline SVG icon set. Each icon inherits color via currentColor.
const base = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };

export const MenuIcon = (p) => (
  <svg {...base} {...p}><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
);

export const FireIcon = (p) => (
  <svg {...base} fill="currentColor" stroke="none" {...p}><path d="M12 2c1 3-1 4-2 6-1 2 0 4 1 4 1 0 2-1 2-3 2 1 3 3 3 5a6 6 0 1 1-12 0c0-3 2-5 3-7 1-2 3-3 5-5z" /></svg>
);

export const SlotsIcon = (p) => (
  <svg {...base} {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><line x1="9" y1="4" x2="9" y2="20" /><line x1="15" y1="4" x2="15" y2="20" /></svg>
);

export const LiveCasinoIcon = (p) => (
  <svg {...base} {...p}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3" /><line x1="12" y1="3" x2="12" y2="6" /><line x1="12" y1="18" x2="12" y2="21" /><line x1="3" y1="12" x2="6" y2="12" /><line x1="18" y1="12" x2="21" y2="12" /></svg>
);

export const ProvidersIcon = (p) => (
  <svg {...base} {...p}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>
);

export const CasinoIcon = (p) => (
  <svg {...base} {...p}><path d="M12 2s7 6 7 12a7 7 0 0 1-14 0c0-6 7-12 7-12z" /></svg>
);

export const SportsIcon = (p) => (
  <svg {...base} {...p}><circle cx="12" cy="12" r="9" /><path d="M12 3v18M3 12h18M6 6l12 12M18 6L6 18" /></svg>
);

export const SunIcon = (p) => (
  <svg {...base} {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
);

export const MoonIcon = (p) => (
  <svg {...base} {...p}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
);

export const ChevronIcon = (p) => (
  <svg {...base} {...p}><polyline points="9 6 15 12 9 18" /></svg>
);

export const ChevronLeftIcon = (p) => (
  <svg {...base} {...p}><polyline points="15 6 9 12 15 18" /></svg>
);

export const ChatIcon = (p) => (
  <svg {...base} {...p}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
);

export const UserIcon = (p) => (
  <svg {...base} {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></svg>
);

export const CoinIcon = (p) => (
  <svg {...base} fill="currentColor" stroke="none" {...p}><circle cx="12" cy="12" r="9" /></svg>
);

// Piggy bank (shown next to Balance).
export const PiggyIcon = (p) => (
  <svg {...base} {...p}><path d="M4 12a6 5 0 0 1 6-5h3a5 5 0 0 1 5 4l2 .5V13l-1.5.5A5 5 0 0 1 16 17v2h-3v-1h-2v1H8v-2a6 5 0 0 1-3-4H3v-3z" /><circle cx="15" cy="11" r="1" fill="currentColor" stroke="none" /><path d="M9 7c0-1.5 3-1.5 3 0" /></svg>
);

// Circle with the letter P inside (shown next to Point).
export const PointPIcon = (p) => (
  <svg viewBox="0 0 24 24" width={20} height={20} {...p}>
    <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
    <text x="12" y="16" textAnchor="middle" fontSize="11" fontWeight="700" fill="currentColor">P</text>
  </svg>
);

export const CloseIcon = (p) => (
  <svg {...base} {...p}><line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" /></svg>
);

export const EyeIcon = (p) => (
  <svg {...base} {...p}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></svg>
);

export const SearchIcon = (p) => (
  <svg {...base} {...p}><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
);

export const HomeIcon = (p) => (
  <svg {...base} {...p}><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /><path d="M9 20v-6h6v6" /></svg>
);

// Money menu icons.
export const DepositIcon = (p) => (
  <svg {...base} {...p}><path d="M12 3v10" /><path d="M8 9l4 4 4-4" /><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></svg>
);

export const WithdrawIcon = (p) => (
  <svg {...base} {...p}><path d="M12 15V5" /><path d="M8 9l4-4 4 4" /><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></svg>
);

export const ConvertIcon = (p) => (
  <svg {...base} {...p}><path d="M4 8h13" /><path d="M14 5l3 3-3 3" /><path d="M20 16H7" /><path d="M10 13l-3 3 3 3" /></svg>
);

export const ReceiptIcon = (p) => (
  <svg {...base} {...p}><path d="M6 2h12v20l-3-2-3 2-3-2-3 2V2z" /><line x1="9" y1="8" x2="15" y2="8" /><line x1="9" y1="12" x2="15" y2="12" /></svg>
);

export const ChevronDownIcon = (p) => (
  <svg {...base} {...p}><polyline points="6 9 12 15 18 9" /></svg>
);

export const LogoutIcon = (p) => (
  <svg {...base} {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
);

export const WalletIcon = (p) => (
  <svg {...base} {...p}><path d="M20 7H5a2 2 0 0 1 0-4h13v4" /><path d="M3 5v14a2 2 0 0 0 2 2h15V7" /><circle cx="16" cy="14" r="1.2" fill="currentColor" stroke="none" /></svg>
);
