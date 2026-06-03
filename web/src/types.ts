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

export type KlinePeriod = '1m' | '5m' | '15m' | '30m' | '1h' | '1D' | '1W' | '1M';

export interface KlineResponse {
  success: boolean;
  symbol: string;
  quote: Quote;
  source: string;
  provider?: string;
  providerTier?: string;
  period: string;
  points: KlinePoint[];
  cached?: boolean;
  fallback?: boolean;
  cacheAgeMs?: number;
  cacheTtlMs?: number;
  diagnostics?: Array<{
    id: string;
    source: string;
    tier: string;
    ok: boolean;
    skipped?: boolean;
    reason?: string | null;
    latencyMs?: number;
  }>;
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

export type ResearchRating = 'BUY' | 'OVERWEIGHT' | 'HOLD' | 'UNDERWEIGHT' | 'SELL';
export type ResearchDepth = 'quick' | 'deep';

export interface ResearchAnalystReport {
  role: string;
  title: string;
  score: number;
  rating: ResearchRating;
  ratingLabel: string;
  summary: string;
  evidence: string[];
  risks: string[];
  dataGrounding?: string[];
}

export interface ResearchRun {
  id: string;
  symbol: string;
  requestedSymbol?: string;
  status: 'running' | 'completed' | 'failed';
  depth: ResearchDepth;
  horizon?: string;
  startedAt: string;
  completedAt?: string | null;
  progress: Array<{ id: string; label: string; status: string; at?: string | null }>;
  quote?: Quote;
  benchmark?: any;
  context?: {
    quote?: Quote;
    benchmark?: any;
    account?: any;
    position?: any;
    intel?: { news: IntelItem[]; search: IntelItem[]; sourceConfigured?: boolean };
    memory?: ResearchMemoryEntry[];
    sources?: Record<string, string>;
  };
  analysts?: ResearchAnalystReport[];
  debate?: {
    rounds: number;
    bullResearcher: any;
    bearResearcher: any;
  };
  manager?: any;
  traderDraft?: any;
  riskReview?: any;
  portfolioManager?: any;
  boundaries?: string[];
  outcomes?: ResearchMemoryEntry[];
  linkedProposalId?: string;
  error?: string;
}

export interface ResearchMemoryEntry {
  id: string;
  runId?: string;
  symbol: string;
  createdAt?: string;
  evaluatedAt?: string;
  rating?: ResearchRating;
  action?: string;
  startPrice?: number;
  currentPrice?: number;
  rawReturnPct?: number | null;
  benchmark?: string | null;
  benchmarkReturnPct?: number | null;
  alphaPct?: number | null;
  verdict?: string;
  lessons?: string[];
}

export interface ResearchConfig {
  quickModel: string;
  deepModel: string;
  debateRounds: number;
  riskDiscussRounds: number;
  outputLanguage: 'zh' | 'en';
  defaultDepth: ResearchDepth;
  benchmarkMap: Record<Category | string, string>;
  dataVendors: string[];
}
