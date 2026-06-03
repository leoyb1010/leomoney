import { create } from 'zustand';
import type {
  Account,
  AccountDetail,
  AccountSummary,
  Currency,
  IntelEntry,
  Language,
  MarketOverview,
  Quote,
  QuotesPayload,
  Theme,
  UpDownMode,
  WatchItem,
} from './types';

interface AppState {
  currency: Currency;
  language: Language;
  theme: Theme;
  upDownMode: UpDownMode;
  sidebarCollapsed: boolean;
  selectedSymbol: string;
  quotes?: QuotesPayload;
  overview?: MarketOverview;
  summary?: AccountSummary;
  account?: AccountDetail;
  accounts: Account[];
  watchlist: WatchItem[];
  intel: IntelEntry[];
  llmReady: boolean;
  toast?: { id: number; kind: 'ok' | 'warn' | 'error'; text: string };
  setPreference: (patch: Partial<Pick<AppState, 'currency' | 'language' | 'theme' | 'upDownMode' | 'sidebarCollapsed'>>) => void;
  setData: (patch: Partial<AppState>) => void;
  setSelectedSymbol: (symbol: string) => void;
  notify: (text: string, kind?: 'ok' | 'warn' | 'error') => void;
  allQuotes: () => Quote[];
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

const PREF_KEYS: Record<string, string> = {
  currency: 'leo_display_currency',
  language: 'leo_language',
  theme: 'leo_theme',
  upDownMode: 'leo_up_down_mode',
  sidebarCollapsed: 'leo_sidebar_collapsed',
};

export const useAppStore = create<AppState>((set, get) => ({
  currency: read<Currency>('leo_display_currency', 'USD'),
  language: read<Language>('leo_language', 'zh'),
  theme: read<Theme>('leo_theme', 'dark'),
  upDownMode: read<UpDownMode>('leo_up_down_mode', 'cn'),
  sidebarCollapsed: read<boolean>('leo_sidebar_collapsed', false),
  selectedSymbol: read<string>('leo_selected_symbol', 'AAPL'),
  accounts: [],
  watchlist: [],
  intel: [],
  llmReady: false,
  setPreference: (patch) => {
    Object.entries(patch).forEach(([key, value]) => write(PREF_KEYS[key] || `leo_${key}`, value));
    set(patch);
  },
  setData: (patch) => set(patch),
  setSelectedSymbol: (symbol) => {
    write('leo_selected_symbol', symbol);
    set({ selectedSymbol: symbol });
  },
  notify: (text, kind = 'ok') => set({ toast: { id: Date.now(), kind, text } }),
  allQuotes: () => {
    const q = get().quotes;
    if (!q) return [];
    return [...(q.usstocks || []), ...(q.crypto || []), ...(q.indices || []), ...(q.astocks || []), ...(q.hkstocks || []), ...(q.metals || [])];
  },
}));
