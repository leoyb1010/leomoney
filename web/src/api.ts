import type {
  Account,
  AccountDetail,
  AccountSummary,
  AgentStatus,
  IntelEntry,
  KlineResponse,
  MarketOverview,
  Order,
  Quote,
  QuotesPayload,
  ResearchConfig,
  ResearchMemoryEntry,
  ResearchRun,
  Strategy,
  WatchItem,
} from './types';

type Json = Record<string, unknown> | Array<unknown>;

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.success === false) {
    throw new Error(data?.error || `HTTP ${res.status}`);
  }
  return data as T;
}

function post<T>(path: string, body: Json): Promise<T> {
  return request<T>(path, { method: 'POST', body: JSON.stringify(body) });
}

export const api = {
  health: () => request<any>('/api/health'),
  readiness: () => request<any>('/api/readiness'),
  market: () => request<any>('/api/market'),
  marketOverview: () => request<MarketOverview>('/api/market/overview'),
  quotes: () => request<QuotesPayload>('/api/quotes'),
  quote: (symbol: string) => request<{ success: boolean; quote: Quote }>(`/api/quotes/${encodeURIComponent(symbol)}`),
  kline: (symbol: string, period = '5m', limit = 160) =>
    request<KlineResponse>(
      `/api/kline/${encodeURIComponent(symbol)}?period=${encodeURIComponent(period)}&limit=${limit}`
    ),
  search: (q: string) =>
    request<{ success: boolean; results: Quote[] }>(`/api/search?q=${encodeURIComponent(q)}`),
  accountSummary: () => request<AccountSummary>('/api/account/summary'),
  account: () => request<AccountDetail>('/api/account'),
  accounts: () => request<{ success: boolean; accounts: Account[]; currentAccountId: string }>('/api/accounts'),
  createAccount: (body: { accountName: string; balance: number; color?: string }) => post<any>('/api/accounts', body),
  switchAccount: (id: string) => post<any>(`/api/accounts/${encodeURIComponent(id)}/switch`, {}),
  resetAccount: () => post<any>('/api/account/reset', {}),
  importPositions: (body: any) => post<any>('/api/account/positions/import', body),
  buy: (body: any) => post<any>('/api/trade/buy', body),
  sell: (body: any) => post<any>('/api/trade/sell', body),
  orders: () => request<{ success: boolean; orders: Order[] }>('/api/orders'),
  createOrder: (body: any) => post<{ success: boolean; order: Order }>('/api/orders', body),
  cancelOrder: (id: string) => request<any>(`/api/orders/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  checkOrders: () => post<any>('/api/orders/check', {}),
  watchlist: () => request<{ success: boolean; watchlist: WatchItem[] }>('/api/watchlist'),
  addWatch: (body: any) => post<any>('/api/watchlist', body),
  removeWatch: (symbol: string) => request<any>(`/api/watchlist/${encodeURIComponent(symbol)}`, { method: 'DELETE' }),
  intelFeed: (limit = 30) => request<{ success: boolean; items: IntelEntry[]; llmReady: boolean }>(`/api/intel/feed?limit=${limit}`),
  intelWatch: () => request<any>('/api/intel/watch'),
  addIntelWatch: (body: any) => post<any>('/api/intel/watch', body),
  removeIntelWatch: (id: string) => request<any>(`/api/intel/watch/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  scanIntel: (body: any) => post<{ success: boolean; entry: IntelEntry }>('/api/intel/scan', body),
  analyzeIntel: (body: any) => post<{ success: boolean; entry: IntelEntry; llmReady: boolean }>('/api/intel/analyze', body),
  intelSignal: (body: any) => post<any>('/api/intel/agent-signal', body),
  researchRun: (body: { symbol: string; depth?: 'quick' | 'deep'; horizon?: 'intraday' | 'swing' | 'position'; focus?: string[] }) =>
    post<{ success: boolean; run: ResearchRun }>('/api/research/run', body),
  researchRuns: (symbol?: string, limit = 30) =>
    request<{ success: boolean; runs: ResearchRun[] }>(`/api/research/runs?limit=${limit}${symbol ? `&symbol=${encodeURIComponent(symbol)}` : ''}`),
  researchRunById: (id: string) => request<{ success: boolean; run: ResearchRun }>(`/api/research/runs/${encodeURIComponent(id)}`),
  researchCreateProposal: (id: string) => post<any>(`/api/research/runs/${encodeURIComponent(id)}/create-proposal`, {}),
  researchEvaluate: (id: string) => post<{ success: boolean; outcome: ResearchMemoryEntry; run: ResearchRun }>(`/api/research/runs/${encodeURIComponent(id)}/evaluate-outcome`, {}),
  researchMemory: (symbol: string, limit = 20) =>
    request<{ success: boolean; symbol: string; memory: ResearchMemoryEntry[] }>(`/api/research/memory?symbol=${encodeURIComponent(symbol)}&limit=${limit}`),
  researchConfig: () => request<{ success: boolean; config: ResearchConfig }>('/api/research/config'),
  updateResearchConfig: (body: Partial<ResearchConfig>) =>
    request<{ success: boolean; config: ResearchConfig }>('/api/research/config', { method: 'PATCH', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }),
  agentStatus: () => request<AgentStatus>('/api/agent/status'),
  agentConfig: () => request<any>('/api/agent/config'),
  updateAgentConfig: (body: any) => request<any>('/api/agent/config', { method: 'PATCH', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }),
  strategies: () => request<{ success: boolean; strategies: Strategy[] }>('/api/agent/strategies'),
  signals: () => request<any>('/api/agent/signals?limit=30'),
  proposals: () => request<any>('/api/agent/proposals'),
  approveProposal: (id: string) => post<any>(`/api/agent/proposals/${encodeURIComponent(id)}/approve`, {}),
  rejectProposal: (id: string) => post<any>(`/api/agent/proposals/${encodeURIComponent(id)}/reject`, {}),
  executeProposal: (id: string) => post<any>(`/api/agent/proposals/${encodeURIComponent(id)}/execute`, {}),
  generateSignal: (body: any) => post<any>('/api/agent/signal', body),
  backtest: (strategyId?: string) => request<any>(`/api/agent/backtest${strategyId ? `?strategyId=${encodeURIComponent(strategyId)}` : ''}`),
  dailyReport: () => request<any>('/api/agent/daily-report'),
  agentHealth: () => request<any>('/api/agent/health'),
  automationRun: (body: any) => post<any>('/api/automation/run', body),
};

export function connectSse(onEvent: (event: MessageEvent) => void, channels = 'quotes,intel,agent,trade,system') {
  const source = new EventSource(`/api/sse?channels=${encodeURIComponent(channels)}`);
  ['update', 'intel_update', 'status', 'breaker_state', 'breaker_trip', 'breaker_recover', 'connected'].forEach(eventName => {
    source.addEventListener(eventName, onEvent);
  });
  return source;
}
