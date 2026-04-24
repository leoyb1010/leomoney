/**
 * Leomoney 领域模型定义 v2
 * 新增 cash / positions 结构，旧版结构兼容
 */

// 账户实体（v2）
const Account = {
  accountId: '',
  accountName: '',
  avatar: null,
  color: '#3b82f6',
  cash: { available: '0.00', frozen: '0.00', total: '0.00' },
  positions: {},      // { symbol: Position }
  history: [],        // TradeRecord[]
  pendingOrders: [],  // PendingOrder[]
  watchlist: [],      // WatchlistItem[]
  ledgerLog: [],      // LedgerEntry[]
  createdAt: '',
  updatedAt: '',
  status: 'active',   // active | archived
};

// 持仓实体（v2 — 精确管理可卖/冻结数量）
const Position = {
  symbol: '',
  name: '',
  totalQty: '0',       // 总数量
  sellableQty: '0',    // 可卖数量 = totalQty - frozenQty
  frozenQty: '0',      // 冻结数量（被条件卖单占用）
  avgCost: '0.00',     // 平均成本
  realizedPnl: '0.00', // 已实现盈亏
  category: 'astocks',
};

// 交易记录实体（v2 — 含费用和结算信息）
const TradeRecord = {
  type: 'buy',        // buy | sell
  symbol: '',
  name: '',
  price: '0.00',
  qty: '0',
  total: '0.00',
  fee: '0.00',
  realizedPnl: '0.00', // 卖出时记录
  costBasis: '0.00',    // 卖出时记录
  time: '',
  category: 'astocks',
  unit: '股',
  orderId: null,
  settlementType: 'LEDGER_SETTLED',
  strategy: undefined,
};

// 条件单实体（v2 — 含状态机和冻结资源）
const PendingOrder = {
  id: '',
  symbol: '',
  name: '',
  side: 'buy',          // buy | sell
  type: 'buy',          // 兼容旧字段
  triggerType: 'gte',   // gte | lte
  triggerPrice: '0.00',
  qty: '0',
  reservedCash: null,   // 买单冻结金额
  status: 'PENDING_TRIGGER',
  createdAt: '',
  updatedAt: '',
  acceptedAt: null, filledAt: null, canceledAt: null, settledAt: null,
  expiredAt: null, rejectedAt: null, failedAt: null,
  executedPrice: null, failureReason: null, rejectionReason: null,
};

// 账本审计条目
const LedgerEntry = {
  type: '',
  data: {},
  timestamp: '',
};

// 自选项实体
const WatchlistItem = {
  symbol: '',
  name: '',
  category: 'astocks',
  currency: 'CNY',
  addedAt: '',
};

// 账户汇总
const AccountSummary = {
  accountId: '', baseCurrency: 'CNY',
  cash: { available: '0.00', frozen: '0.00', total: '0.00' },
  holdingValue: '0.00', totalAssets: '0.00',
  totalUnrealizedPnL: '0.00', todayRealizedPnL: '0.00',
  holdingCount: 0, holdings: [], pendingOrders: [], rates: {},
};

// 持仓明细
const HoldingDetail = {
  symbol: '', name: '',
  totalQty: '0', sellableQty: '0', frozenQty: '0',
  avgCost: '0.00', latestPrice: '0.00', priceCurrency: 'CNY',
  marketValueOrig: '0.00', marketValueCNY: '0.00', costBasisCNY: '0.00',
  unrealizedPnL: '0.00', unrealizedPnLRatio: '0.00', realizedPnl: '0.00',
  isUp: true, category: 'astocks', currency: 'CNY', conversionHint: '',
};

// 市场分类配置
const MARKET_CONFIG = {
  astocks:   { label: 'A股',   unit: '股',   step: 100, minQty: 100, multiple: true,  currency: 'CNY' },
  hkstocks:  { label: '港股',  unit: '股',   step: 100, minQty: 100, multiple: true,  currency: 'HKD' },
  usstocks:  { label: '美股',  unit: '股',   step: 1,   minQty: 1,   multiple: false, currency: 'USD' },
  metals:    { label: '贵金属', unit: '盎司', step: 1,   minQty: 1,   multiple: false, currency: 'USD' },
  crypto:    { label: '加密',  unit: '枚',   step: 0.01, minQty: 0.01, multiple: false, currency: 'USD' },
};

const FX_RATES = { CNY: 1, USD: 7.25, HKD: 0.93 };

function getMarketConfig(category) { return MARKET_CONFIG[category] || MARKET_CONFIG.astocks; }
function isStockLike(category) { return category === 'astocks' || category === 'hkstocks' || category === 'usstocks'; }
function getUnit(category) { return getMarketConfig(category).unit; }
function toCNY(amount, currency) { return (currency === 'CNY' || !currency) ? amount : amount * (FX_RATES[currency] || 1); }
function conversionHint(amount, currency) {
  if (currency === 'CNY' || !currency) return `¥${Number(amount).toFixed(2)}`;
  const cny = toCNY(amount, currency);
  const sym = currency === 'USD' ? '$' : currency === 'HKD' ? 'HK$' : currency;
  return `${sym}${Number(amount).toFixed(2)} ≈ ¥${cny.toFixed(2)}`;
}

module.exports = {
  Account, Position, TradeRecord, PendingOrder, WatchlistItem, LedgerEntry,
  AccountSummary, HoldingDetail,
  MARKET_CONFIG, FX_RATES,
  getMarketConfig, isStockLike, getUnit, toCNY, conversionHint,
};
