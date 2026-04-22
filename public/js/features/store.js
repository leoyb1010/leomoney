/**
 * Leomoney 统一状态仓库
 * 替代 app.js 中散落的全局变量
 */

export const store = {
  marketStatus: { isOpen: false, status: '检测中' },
  quotesData: { indices: [], astocks: [], hkstocks: [], usstocks: [], metals: [], crypto: [], ts: 0 },
  quoteStatus: null,
  accountData: { balance: 1000000, holdings: {}, history: [], pendingOrders: [] },
  accountSummary: null,
  accounts: [],
  currentAccountId: null,
  watchlist: [],
  fxRates: { CNY: 1, USD: 7.25, HKD: 0.93 },
  currentView: 'quotes',
  currentListMode: 'hot',
  currentMarketCat: 'all',
  selectedStock: null,
  selectedIndex: null,
  tradeType: 'buy',
  timeframe: 5,
  candles: {},
  searchFilter: '',
  searchResults: [],
  searchTimer: null,
  historyFilter: 'all',
  lastQuoteTime: null,
  analysisData: null,
  pendingDeleteAccountId: null,
  selectedAccountColor: '#3b82f6',
};

export function setStore(key, value) {
  store[key] = value;
}

export function getStore(key) {
  return store[key];
}
