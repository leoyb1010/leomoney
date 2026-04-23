/**
 * Leomoney 信号引擎 — 信息采集 → LLM分析 → 信号/方案生成
 * 核心流程：Eyes(采集) → Brain(决策) → Executor(风控+执行)
 */

const { askLLM, isLLMReady } = require('./brain');
const { gatherIntelligence } = require('./eyes');
const { riskManager } = require('./riskManager');
const { breaker } = require('./circuitBreaker');
const { getStrategyPrompt, getStrategy } = require('./promptTemplates');
const { AGENT_PROMPT } = require('../../src/analytics/tradeEngine');
const { getAccount } = require('../../src/server/services/accountService');
const { getStockQuote } = require('../quotes');

const SIGNAL_MAX = 500;
const signals = [];
const proposals = [];

async function generateSignal(symbol, strategyId = 'balanced') {
  if (!isLLMReady()) return { success: false, error: 'LLM 未配置' };
  try {
    const quote = await getStockQuote(symbol);
    if (!quote?.price) return { success: false, error: '未找到该标的行情' };
    const intel = await gatherIntelligence(symbol, quote.name);
    const account = getAccount();
    const holding = account?.holdings?.[symbol];
    const systemPrompt = getStrategyPrompt(strategyId, AGENT_PROMPT);
    const strategy = getStrategy(strategyId);
    const userMsg = JSON.stringify({
      标的: symbol, 名称: quote.name, 当前价格: quote.price, 涨跌幅: quote.changePercent,
      今日开: quote.open, 最高: quote.high, 最低: quote.low,
      持仓: holding ? { qty: holding.qty, avgCost: holding.avgCost, pnlPct: ((quote.price - holding.avgCost) / holding.avgCost * 100).toFixed(1) + '%' } : null,
      近期新闻: intel.news.slice(0, 5), 搜索洞察: intel.search.slice(0, 3),
      账户余额: account?.balance || 0,
    });
    const decision = await askLLM(systemPrompt, userMsg);
    const signal = {
      id: 'sig_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      symbol, name: quote.name, price: quote.price, category: quote.category || 'astocks',
      strategy: strategyId, strategyName: strategy?.name || '默认', decision,
      intel: { newsCount: intel.news.length, searchCount: intel.search.length },
      confidence: decision.置信度 || 0, riskLevel: decision.风险等级 || '中',
      action: decision.action || '观望', reason: decision.原因 || '',
      ts: new Date().toISOString(),
    };
    signals.unshift(signal);
    if (signals.length > SIGNAL_MAX) signals.length = SIGNAL_MAX;
    return { success: true, signal };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function createProposal(signal) {
  if (signal.action === '观望') return null;
  const account = getAccount();
  if (!account) return null;
  const strategy = getStrategy(signal.strategy);
  const ratio = Math.min(signal.decision.仓位比例 || 0.1, 0.3);
  const maxAmount = account.balance * ratio;
  const qty = _calculateQty(maxAmount, signal.price, signal.category);
  if (qty <= 0) return null;
  const proposal = {
    id: 'prop_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    signalId: signal.id, symbol: signal.symbol, name: signal.name,
    action: signal.action, price: signal.price, qty, category: signal.category,
    strategy: signal.strategy, strategyName: signal.strategyName,
    confidence: signal.confidence, riskLevel: signal.riskLevel, reason: signal.reason,
    totalAmount: qty * signal.price, status: 'pending',
    createdAt: new Date().toISOString(), executedAt: null, executedPrice: null, executionResult: null,
  };
  const riskCheck = riskManager.check({
    symbol: proposal.symbol, action: proposal.action, qty: proposal.qty,
    price: proposal.price, category: proposal.category,
    confidence: proposal.confidence, riskLevel: proposal.riskLevel, name: proposal.name,
  }, breaker.currentLevel);
  proposal.riskCheck = riskCheck;
  if (!riskCheck.allowed) {
    proposal.status = 'rejected';
    proposal.rejectionReason = riskCheck.reason;
  } else {
    if (riskCheck.adjustedQty && riskCheck.adjustedQty !== proposal.qty) {
      proposal.qty = riskCheck.adjustedQty;
      proposal.totalAmount = proposal.qty * proposal.price;
    }
    proposal.warnings = riskCheck.warnings || [];
  }
  proposals.unshift(proposal);
  if (proposals.length > 200) proposals.length = 200;
  return proposal;
}

async function executeProposal(proposalId, forceLevel3 = false) {
  const proposal = proposals.find(p => p.id === proposalId);
  if (!proposal) return { success: false, error: '方案不存在' };
  if (proposal.status !== 'pending' && proposal.status !== 'approved') return { success: false, error: `方案状态 ${proposal.status} 不可执行` };
  const allowance = breaker.checkAllowance(forceLevel3 ? 3 : 2);
  if (!allowance.allowed) {
    proposal.status = 'rejected';
    proposal.rejectionReason = allowance.reason;
    return { success: false, error: allowance.reason };
  }
  try {
    const quoteData = await getStockQuote(proposal.symbol);
    if (quoteData?.price) proposal.executedPrice = quoteData.price;
  } catch {}
  if (!proposal.executedPrice) proposal.executedPrice = proposal.price;
  const { buy, sell } = require('../../src/server/services/tradingService');
  const quote = { symbol: proposal.symbol, name: proposal.name, price: proposal.executedPrice, category: proposal.category, strategy: `agent_${proposal.strategy}` };
  let result;
  if (proposal.action === '买入') result = buy(quote, proposal.qty);
  else if (proposal.action === '卖出') result = sell(quote, proposal.qty);
  else return { success: false, error: `未知动作: ${proposal.action}` };
  proposal.status = result.success ? 'executed' : 'failed';
  proposal.executedAt = new Date().toISOString();
  proposal.executionResult = result;
  if (result.success) {
    riskManager.recordTrade();
    if (forceLevel3 || breaker.currentLevel === 3) {
      const stopOrders = riskManager.generateStopOrders(proposal, { price: proposal.executedPrice, qty: proposal.qty });
      const { createOrder } = require('../../src/server/services/orderService');
      for (const order of stopOrders) {
        try { await createOrder(order); } catch (e) { console.error('[SignalEngine] 止损止盈单失败:', e.message); }
      }
    }
  }
  breaker.recordTrade({ success: result.success, pnl: undefined, symbol: proposal.symbol });
  return { success: result.success, proposal, result };
}

async function scanSymbols(symbols, strategyId = 'balanced') {
  const results = [];
  for (const symbol of symbols) {
    const signalResult = await generateSignal(symbol, strategyId);
    if (signalResult.success) {
      const signal = signalResult.signal;
      if (breaker.currentLevel >= 2 && signal.action !== '观望') {
        const proposal = createProposal(signal);
        if (breaker.currentLevel === 3 && proposal && proposal.status !== 'rejected') {
          const threshold = getStrategy(strategyId)?.confidenceThreshold || 0.7;
          if (signal.confidence >= threshold) await executeProposal(proposal.id, true);
        }
      }
      results.push(signal);
    } else {
      results.push({ symbol, error: signalResult.error });
    }
  }
  return results;
}

function getSignals(limit = 50) { return signals.slice(0, limit); }
function getProposals(status = null) {
  if (status) return proposals.filter(p => p.status === status);
  return proposals.slice(0, 50);
}
function approveProposal(proposalId) {
  const proposal = proposals.find(p => p.id === proposalId);
  if (!proposal) return { success: false, error: '方案不存在' };
  if (proposal.status !== 'pending') return { success: false, error: '方案不可批准' };
  proposal.status = 'approved';
  return { success: true };
}
function rejectProposal(proposalId) {
  const proposal = proposals.find(p => p.id === proposalId);
  if (!proposal) return { success: false, error: '方案不存在' };
  proposal.status = 'rejected';
  return { success: true };
}

function _calculateQty(maxAmount, price, category) {
  const rules = _getCategoryRules(category);
  return Math.max(0, Math.floor(maxAmount / price / rules.step) * rules.step);
}
function _getCategoryRules(category) {
  switch (category) {
    case 'crypto': return { step: 0.01 };
    case 'metals': return { step: 1 };
    case 'hkstocks': return { step: 100 };
    case 'usstocks': return { step: 1 };
    default: return { step: 100 };
  }
}

module.exports = {
  generateSignal, createProposal, executeProposal, scanSymbols,
  getSignals, getProposals, approveProposal, rejectProposal,
};
