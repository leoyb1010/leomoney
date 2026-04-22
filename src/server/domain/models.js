/**
 * Leomoney 领域模型定义
 * 统一数据结构，消灭中英混用和多处重复定义
 */

// 账户实体
const Account = {
  accountId: '',
  accountName: '',
  avatar: null,
  color: '#3b82f6',
  balance: 0,
  holdings: {},      // { symbol: Holding }
  history: [],       // TradeRecord[]
  pendingOrders: [], // PendingOrder[]
  watchlist: [],     // WatchlistItem[]
  createdAt: '',
  updatedAt: '',
  status: 'active',  // active | archived
};

// 持仓实体
const Holding = {
  symbol: '',
  name: '',
  qty: 0,
  avgCost: 0,
  category: 'astocks',
};

// 交易记录实体
const TradeRecord = {
  type: 'buy',       // buy | sell
  symbol: '',
  name: '',
  price: 0,
  qty: 0,
  total: 0,
  time: '',
  category: 'astocks',
  unit: '股',
  strategy: undefined,
};

// 条件单实体
const PendingOrder = {
  id: '',
  symbol: '',
  name: '',
  type: 'buy',       // buy | sell
  triggerType: 'gte', // gte | lte
  triggerPrice: 0,
  qty: 0,
  status: 'pending', // pending | executed | cancelled | failed
  createdAt: '',
  executedAt: null,
  executedPrice: null,
  failedReason: null,
};

// 自选项实体
const WatchlistItem = {
  symbol: '',
  name: '',
  category: 'astocks',
  currency: 'CNY',
  addedAt: '',
};

// 账户汇总（前端展示用）
const AccountSummary = {
  accountId: '',
  baseCurrency: 'CNY',
  cash: 0,
  holdingValue: 0,
  totalAssets: 0,
  totalUnrealizedPnL: 0,
  todayRealizedPnL: 0,
  holdingCount: 0,
  holdings: [],      // HoldingDetail[]
  pendingOrders: [],
  rates: {},
};

// 持仓明细（汇总计算后）
const HoldingDetail = {
  symbol: '',
  name: '',
  qty: 0,
  avgCost: 0,
  latestPrice: 0,
  priceCurrency: 'CNY',
  marketValueOrig: 0,
  marketValueCNY: 0,
  costBasisCNY: 0,
  unrealizedPnL: 0,
  unrealizedPnLRatio: 0,
  isUp: true,
  category: 'astocks',
  currency: 'CNY',
  conversionHint: '',
};

// 市场分类配置（集中化，消灭到处写 switch）
const MARKET_CONFIG = {
  astocks:   { label: 'A股',   unit: '股',   step: 100, minQty: 100, multiple: true,  currency: 'CNY' },
  hkstocks:  { label: '港股',  unit: '股',   step: 100, minQty: 100, multiple: true,  currency: 'HKD' },
  usstocks:  { label: '美股',  unit: '股',   step: 1,   minQty: 1,   multiple: false, currency: 'USD' },
  metals:    { label: '贵金属', unit: '盎司', step: 1,   minQty: 1,   multiple: false, currency: 'USD' },
  crypto:    { label: '加密',  unit: '枚',   step: 0.01, minQty: 0.01, multiple: false, currency: 'USD' },
};

// 汇率配置
const FX_RATES = {
  CNY: 1,
  USD: 7.25,
  HKD: 0.93,
};

function getMarketConfig(category) {
  return MARKET_CONFIG[category] || MARKET_CONFIG.astocks;
}

function isStockLike(category) {
  return category === 'astocks' || category === 'hkstocks' || category === 'usstocks';
}

function getUnit(category) {
  return getMarketConfig(category).unit;
}

function toCNY(amount, currency) {
  if (currency === 'CNY' || !currency) return amount;
  const rate = FX_RATES[currency] || 1;
  return amount * rate;
}

function conversionHint(amount, currency) {
  if (currency === 'CNY' || !currency) return `¥${amount.toFixed(2)}`;
  const cny = toCNY(amount, currency);
  const sym = currency === 'USD' ? '$' : currency === 'HKD' ? 'HK$' : currency;
  return `${sym}${amount.toFixed(2)} ≈ ¥${cny.toFixed(2)}`;
}

module.exports = {
  Account, Holding, TradeRecord, PendingOrder, WatchlistItem,
  AccountSummary, HoldingDetail,
  MARKET_CONFIG, FX_RATES,
  getMarketConfig, isStockLike, getUnit, toCNY, conversionHint,
};
