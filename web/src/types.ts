export type Category = 'indices' | 'astocks' | 'hkstocks' | 'usstocks' | 'metals' | 'crypto';
export type Currency = 'CNY' | 'USD' | 'HKD' | 'USDT';
export type Language = 'zh' | 'en';
export type Theme = 'dark' | 'light' | 'system';
export type UpDownMode = 'cn' | 'us';

export interface DataQuality {
  isSynthetic?: boolean;
  source?: string;
  note?: string;
}

export interface Quote {
  symbol: string;
  name: string;
  price: number;
  prevClose?: number;
  open?: number;
  high?: number;
  low?: number;
  change?: number;
  changePercent?: number;
  volume?: number;
  quoteVolume?: number;
  market?: string;
  category: Category;
  currency?: Currency | string;
  product?: string;
  source?: string;
  asOf?: string;
  dataQuality?: DataQuality;
  yahooSymbol?: string;
}

export interface QuotesPayload {
  success: boolean;
  indices: Quote[];
  astocks: Quote[];
  hkstocks: Quote[];
  usstocks: Quote[];
  metals: Quote[];
  crypto: Quote[];
  market?: any;
  quoteStatus?: Record<string, any>;
  ts?: number;
}

export interface MarketOverview {
  success: boolean;
  asOf: string;
  indices: Quote[];
  crypto: Quote[];
  freshness?: { quoteTs: number; ageMs: number };
}

export interface Holding {
  symbol: string;
  name: string;
  totalQty: number;
  sellableQty: number;
  frozenQty: number;
  avgCost: number;
  latestPrice: number;
  priceCurrency: Currency | string;
  marketValueOrig: number;
  marketValueCNY: number;
  costBasisCNY: number;
  unrealizedPnL: number;
  unrealizedPnLRatio: number;
  realizedPnl: number;
  isUp: boolean;
  category: Category;
  currency: Currency | string;
  conversionHint?: string;
}

export interface AccountSummary {
  success: boolean;
  accountId: string;
  baseCurrency: 'CNY';
  cash: { available: number; frozen: number; total: number };
  cashAvailable: number;
  cashFrozen: number;
  balance: number;
  holdingValue: number;
  totalAssets: number;
  totalUnrealizedPnL: number;
  todayRealizedPnL: number;
  holdingCount: number;
  holdings: Holding[];
  pendingOrders: Order[];
  rates: Record<string, number>;
  analytics?: any;
}

export interface Account {
  accountId: string;
  accountName?: string;
  color?: string;
  balance?: number;
  cashAvailable?: number;
  holdingsCount?: number;
  historyCount?: number;
  watchlistCount?: number;
  status?: string;
}

export interface TradeRecord {
  type: string;
  symbol: string;
  name: string;
  price: number;
  qty: number;
  total: number;
  fee?: number;
  realizedPnl?: number;
  time: string;
  category?: Category;
  currency?: Currency | string;
}

export interface AccountDetail {
  success: boolean;
  accountId: string;
  accountName?: string;
  history?: TradeRecord[];
  positions?: Record<string, any>;
  pendingOrders?: Order[];
  watchlist?: WatchItem[];
  ledgerLog?: any[];
}

export interface Order {
  id: string;
  symbol: string;
  name: string;
  side: 'buy' | 'sell';
  type?: string;
  triggerType: 'gte' | 'lte';
  triggerPrice: number;
  qty: number;
  category?: Category;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
  executedPrice?: number;
}

export interface WatchItem {
  symbol: string;
  name: string;
  category: Category;
  currency?: Currency | string;
  addedAt?: string;
}

export interface KlinePoint {
  time: string;
  label?: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface RelatedSymbol {
  symbol: string;
  name: string;
  market: string;
  price?: number;
  changePercent?: number;
  currency?: Currency | string;
  relevance?: number;
  reason?: string;
}

export interface IntelItem {
  title: string;
  titleZh?: string;
  titleEn?: string;
  snippet?: string;
  snippetZh?: string;
  snippetEn?: string;
  url?: string;
  source?: string;
  publishedAt?: string;
  related?: RelatedSymbol[];
  translationQuality?: 'native' | 'glossary' | 'llm';
}

export interface IntelEntry {
  id: string;
  ts: string;
  type: string;
  query: string;
  symbol?: string;
  quote?: Quote;
  news: IntelItem[];
  search: IntelItem[];
  related?: RelatedSymbol[];
  analysis?: any;
  sourceMeta?: any;
  agentLinked?: boolean;
}

export interface AgentStatus {
  success: boolean;
  llmReady: boolean;
  llmInfo?: any;
  agent?: any;
  circuitBreaker?: any;
  risk?: any;
}

export interface Strategy {
  id: string;
  name: string;
  description: string;
  icon?: string;
  riskLevel: string;
  confidenceThreshold: number;
}
