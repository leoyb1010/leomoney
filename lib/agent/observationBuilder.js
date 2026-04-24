/**
 * Leomoney Agent Observation Builder
 * 统一构建 observation，包含行情/账户/持仓/订单/风控/时段完整快照
 */

const { getAccount } = require('../../src/server/services/accountService');
const { getStockQuote } = require('../quotes');
const { riskManager } = require('./riskManager');
const { getAgentConfig } = require('../scheduler');
const { D, toMoney } = require('../../src/server/domain/money');

/**
 * 构建完整 observation
 * @param {Object} opts
 * @param {string} opts.symbol - 标的代码
 * @param {Object} [opts.quote] - 行情（可选，不传则自动获取）
 * @param {number} [opts.recentDecisionCount=5] - 最近决策条数
 */
async function buildObservation({ symbol, quote: inputQuote, recentDecisionCount = 5 }) {
  const account = getAccount();
  if (!account) throw new Error('账户不存在');

  // 确保新结构
  const cash = account.cash || { available: account.balance || 0, frozen: 0, total: account.balance || 0 };
  const positions = account.positions || account.holdings || {};
  const pendingOrders = account.pendingOrders || [];

  // 行情
  let quote = inputQuote;
  if (!quote) {
    try { quote = await getStockQuote(symbol); } catch { /* ignore */ }
  }

  const position = positions[symbol];

  // 本标的相关挂单
  const symbolOrders = pendingOrders.filter(o => o.symbol === symbol);

  // 风控快照
  const riskSnapshot = riskManager.getStatus();

  // 交易时段
  const category = quote?.category || 'astocks';
  const timeCheck = riskManager._checkTradingWindow?.(category) || { allowed: true };

  // 最近决策（从内存中取，实际应从审计日志取）
  const recentDecisions = []; // TODO: 从 audit log 取

  return {
    schemaVersion: 'v1',
    timestamp: new Date().toISOString(),
    symbol,
    quote: quote ? {
      price: toMoney(quote.price),
      changePercent: quote.changePercent || 0,
      open: quote.open || quote.price,
      high: quote.high || quote.price,
      low: quote.low || quote.price,
      volume: quote.volume || 0,
      category,
      timestamp: quote.timestamp || new Date().toISOString(),
    } : null,
    account: {
      cashAvailable: toMoney(cash.available),
      cashFrozen: toMoney(cash.frozen),
      cashTotal: toMoney(cash.total),
    },
    position: position ? {
      symbol: position.symbol || symbol,
      totalQty: position.totalQty || position.qty || '0',
      sellableQty: position.sellableQty || position.qty || '0',
      frozenQty: position.frozenQty || '0',
      avgCost: toMoney(position.avgCost || 0),
      realizedPnl: toMoney(position.realizedPnl || 0),
      unrealizedPnl: quote ? toMoney(D(quote.price).minus(position.avgCost || 0).times(position.totalQty || 0)) : '0.00',
    } : null,
    pendingOrders: symbolOrders.map(o => ({
      id: o.id,
      side: o.side || o.type,
      status: o.status,
      qty: o.qty,
      price: o.price || o.triggerPrice,
      triggerPrice: o.triggerPrice,
    })),
    riskSnapshot: {
      todayTradeCount: riskSnapshot.todayTradeCount,
      maxTradesPerDay: riskSnapshot.maxTradesPerDay,
      inTradingSession: timeCheck.allowed,
      tradingWindowReason: timeCheck.reason,
    },
    recentDecisions: recentDecisions.slice(0, recentDecisionCount),
  };
}

module.exports = { buildObservation };
