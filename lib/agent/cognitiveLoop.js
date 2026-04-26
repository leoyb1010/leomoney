/**
 * Leomoney Agent 认知闭环 v3
 * Observation → Analysis → Decision → Execution
 * 完整的四阶段循环，每阶段有独立的输入/输出/校验
 *
 * 核心架构：
 *   1. OBSERVE: 采集行情/持仓/新闻/市场状态
 *   2. ANALYZE: LLM 分析 + Schema 校验
 *   3. DECIDE:  风控检查 + 熔断检查 + 方案生成
 *   4. EXECUTE: 交易执行 + 止损止盈 + 审计记录
 */

const { askLLM, isLLMReady } = require('./brain');
const { gatherIntelligence } = require('./eyes');
const { riskManager } = require('./riskManager');
const { breaker } = require('./circuitBreaker');
const { getStrategyPrompt, getStrategy } = require('./promptTemplates');
const { buildObservation } = require('./observationBuilder');
const { parseAgentAction } = require('./schema');
const { recordAudit, getAuditsByDecisionId } = require('./audit');
const { AGENT_PROMPT } = require('../../src/analytics/tradeEngine');
const { getAccount } = require('../../src/server/services/accountService');
const { getStockQuote } = require('../quotes');
const { D, toMoney, calcBuyReserve } = require('../../src/server/domain/money');
const { sseService } = require('../sse');

const SIGNAL_MAX = 500;

// ── 多账户隔离 ──
const _stores = new Map();
function _getAccountId() {
  try { return getAccount()?.accountId || 'default'; } catch { return 'default'; }
}
function _getStore(accountId) {
  const id = accountId || _getAccountId();
  if (!_stores.has(id)) _stores.set(id, { signals: [], proposals: [] });
  return _stores.get(id);
}
function removeStoreForAccount(accountId) { _stores.delete(accountId); }

// ── 阶段 1: OBSERVE ──

async function observe(symbol, quote) {
  const observation = await buildObservation({ symbol, quote });
  const intel = await gatherIntelligence(symbol, quote.name);
  
  // 广播 SSE 通知
  sseService.broadcast('agent', 'observation', { symbol, observation: { quote: observation.quote, position: observation.position } });

  return { observation, intel };
}

// ── 阶段 2: ANALYZE ──

async function analyze(symbol, strategyId, observation, intel) {
  if (!isLLMReady()) return { success: false, error: 'LLM 未配置' };

  const systemPrompt = getStrategyPrompt(strategyId, AGENT_PROMPT);
  const strategy = getStrategy(strategyId);
  const userMsg = JSON.stringify({
    schemaVersion: 'v2',
    要求: '请严格返回 JSON 格式: { action: "BUY|SELL|HOLD", symbol, qty, confidence: 0-1, thesis, riskNotes: [], basedOn: {market,position,account,risk,news} }',
    observation,
    近期新闻: intel.news.slice(0, 5),
    搜索洞察: intel.search.slice(0, 3),
  }, null, 2);

  // 调用 LLM（带 Schema 校验 + 重试）
  const rawDecision = await askLLM(systemPrompt, userMsg, { validateSchema: true, maxRetries: 2 });

  // 解析
  const parsed = parseAgentAction(typeof rawDecision === 'string' ? rawDecision : JSON.stringify(rawDecision));
  
  // 广播 SSE
  sseService.broadcast('agent', 'analysis', { symbol, action: parsed.action, confidence: parsed.action.confidence });

  return { rawDecision, parsed, strategy };
}

// ── 阶段 3: DECIDE ──

function decide(signal, quote) {
  const account = getAccount();
  if (!account) return { proposal: null, riskCheck: null };

  const cash = account.cash || { available: account.balance || 0, total: account.balance || 0 };
  const positions = account.positions || account.holdings || {};
  const position = positions[signal.symbol];
  const strategy = getStrategy(signal.strategy);
  const ratio = Math.min(signal.confidence * (strategy?.positionRatio || 0.2), 0.3);

  let qty;
  if (signal.action === '卖出') {
    const sellableQty = Number(position?.sellableQty || position?.qty || 0);
    qty = _calculateQty(D(sellableQty).times(ratio).toNumber(), signal.price, signal.category);
    qty = Math.min(qty, Math.floor(sellableQty));
  } else {
    const maxAmount = D(cash.available).times(ratio);
    qty = _calculateQty(maxAmount.toNumber(), signal.price, signal.category);
  }

  if (qty <= 0) return { proposal: null, riskCheck: null };

  const proposal = {
    id: `prop_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    signalId: signal.id,
    decisionId: signal.decisionId,
    symbol: signal.symbol, name: signal.name,
    action: signal.action,
    price: signal.price,
    qty,
    category: signal.category,
    strategy: signal.strategy,
    strategyName: signal.strategyName,
    confidence: signal.confidence,
    riskLevel: signal.riskLevel,
    reason: signal.reason,
    totalAmount: toMoney(D(qty).times(signal.price)),
    status: 'pending',
    createdAt: new Date().toISOString(),
    executedAt: null,
    executedPrice: null,
    executionResult: null,
  };

  // 风控检查
  const riskCheck = riskManager.check({
    symbol: proposal.symbol,
    action: proposal.action,
    qty: proposal.qty,
    price: proposal.price,
    category: proposal.category,
    confidence: proposal.confidence,
    riskLevel: proposal.riskLevel,
    name: proposal.name,
  }, breaker.currentLevel);

  proposal.riskCheck = riskCheck;

  if (!riskCheck.allowed) {
    proposal.status = 'rejected';
    proposal.rejectionReason = riskCheck.reason;
  } else {
    if (riskCheck.adjustedQty && riskCheck.adjustedQty !== proposal.qty) {
      proposal.qty = riskCheck.adjustedQty;
      proposal.totalAmount = toMoney(D(proposal.qty).times(proposal.price));
    }
    proposal.warnings = riskCheck.warnings || [];
  }

  // 熔断检查
  const allowance = breaker.checkAllowance(signal.action === '买入' ? 2 : 2);
  if (!allowance.allowed) {
    proposal.status = 'rejected';
    proposal.rejectionReason = allowance.reason;
  }

  // 广播 SSE
  sseService.broadcast('agent', 'decision', { proposal, riskCheck });

  const store = _getStore();
  store.proposals.unshift(proposal);
  if (store.proposals.length > 200) store.proposals.length = 200;

  return { proposal, riskCheck };
}

// ── 阶段 4: EXECUTE ──

async function execute(proposalId, forceLevel3 = false) {
  const store = _getStore();
  const proposal = store.proposals.find(p => p.id === proposalId);
  if (!proposal) return { success: false, error: '方案不存在' };
  if (proposal.status !== 'pending' && proposal.status !== 'approved') {
    return { success: false, error: `方案状态 ${proposal.status} 不可执行` };
  }

  // 熔断检查
  const allowance = breaker.checkAllowance(forceLevel3 ? 3 : 2);
  if (!allowance.allowed) {
    proposal.status = 'rejected';
    proposal.rejectionReason = allowance.reason;
    return { success: false, error: allowance.reason };
  }

  // 重新获取实时行情
  let currentPrice = proposal.price;
  try {
    const quoteData = await getStockQuote(proposal.symbol);
    if (quoteData?.price) currentPrice = quoteData.price;
  } catch {}
  proposal.executedPrice = toMoney(currentPrice);

  // 买入前资金检查
  const account = getAccount();
  const cash = account?.cash || { available: account?.balance || 0 };
  const positions = account?.positions || account?.holdings || {};

  if (proposal.action === '买入') {
    const reserve = calcBuyReserve(currentPrice, proposal.qty);
    if (D(cash.available).lt(reserve)) {
      proposal.status = 'rejected';
      proposal.rejectionReason = `可用资金不足: ${cash.available} < ${reserve}`;
      return { success: false, error: proposal.rejectionReason };
    }
  }
  if (proposal.action === '卖出') {
    const pos = positions[proposal.symbol];
    const sellable = pos?.sellableQty || pos?.qty || 0;
    if (D(sellable).lt(proposal.qty)) {
      proposal.status = 'rejected';
      proposal.rejectionReason = `可卖数量不足: ${sellable} < ${proposal.qty}`;
      return { success: false, error: proposal.rejectionReason };
    }
  }

  // 执行交易
  const { buy, sell } = require('../../src/server/services/tradingService');
  const quote = {
    symbol: proposal.symbol, name: proposal.name, price: currentPrice,
    category: proposal.category, strategy: `agent_${proposal.strategy}`,
    source: 'agent', decisionId: proposal.decisionId,
  };

  let result;
  try {
    result = proposal.action === '买入' ? await buy(quote, proposal.qty) : await sell(quote, proposal.qty);
  } catch (err) {
    result = { success: false, error: err.message };
  }

  proposal.executionResult = result;
  proposal.status = result.success ? 'executed' : 'failed';
  proposal.executedAt = new Date().toISOString();

  // 记录到熔断器
  let pnl = 0, pnlPct = 0;
  if (result.success && result.realizedPnl !== undefined) {
    pnl = Number(result.realizedPnl) || 0;
    const tradeAmount = D(proposal.qty).times(currentPrice);
    if (tradeAmount.gt(0)) pnlPct = D(pnl).div(tradeAmount).toNumber();
  }
  breaker.recordTrade({ success: result.success, symbol: proposal.symbol, pnl, pnlPct });

  // 风控记录
  riskManager.recordTrade(result.success);

  // 止损止盈
  if (result.success && (forceLevel3 || breaker.currentLevel === 3)) {
    const stopOrders = riskManager.generateStopOrders(proposal, { price: currentPrice, qty: proposal.qty });
    const { createOrder } = require('../../src/server/services/orderService');
    for (const order of stopOrders) {
      try { await createOrder(order); } catch (e) { console.error('[CognitiveLoop] 止损止盈单失败:', e.message); }
    }
  }

  // 审计
  const audits = getAuditsByDecisionId(proposal.decisionId);
  if (audits.length > 0) {
    audits[0].executionResult = result;
    audits[0].submittedOrderIds = result.orderId ? [result.orderId] : [];
  }

  // SSE 广播
  sseService.broadcast('trade', 'execution', { proposal, result });

  return { success: result.success, proposal, result };
}

// ── 完整循环：一键执行四阶段 ──

async function runCycle(symbol, strategyId = 'balanced') {
  if (!isLLMReady()) return { success: false, error: 'LLM 未配置' };

  const decisionId = `dec_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  let auditEntry = {
    id: `audit_${decisionId}`, decisionId, symbol,
    rawModelOutput: '', parseError: null, submittedOrderIds: [],
  };

  try {
    // 1. OBSERVE
    const quote = await getStockQuote(symbol);
    if (!quote?.price) return { success: false, error: '未找到该标的行情' };
    
    const { observation, intel } = await observe(symbol, quote);
    auditEntry.observationSnapshot = observation;

    // 2. ANALYZE
    const { rawDecision, parsed, strategy } = await analyze(symbol, strategyId, observation, intel);
    auditEntry.rawModelOutput = JSON.stringify(rawDecision);
    auditEntry.parsedAction = parsed.action;
    if (!parsed.success) auditEntry.parseError = parsed.error;

    const action = parsed.action.action;
    const confidence = parsed.action.confidence;

    // 3. 生成信号
    const signal = {
      id: `sig_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      decisionId, symbol, name: quote.name,
      price: toMoney(quote.price), category: quote.category || 'astocks',
      strategy: strategyId, strategyName: strategy?.name || '默认',
      action: action === 'BUY' ? '买入' : action === 'SELL' ? '卖出' : '观望',
      confidence,
      riskLevel: confidence > 0.8 ? '低' : confidence > 0.5 ? '中' : '高',
      reason: parsed.action.thesis,
      parsedAction: parsed.action,
      intel: { newsCount: intel.news.length, searchCount: intel.search.length },
      ts: new Date().toISOString(),
    };

    const store = _getStore();
    store.signals.unshift(signal);
    if (store.signals.length > SIGNAL_MAX) store.signals.length = SIGNAL_MAX;

    // 4. DECIDE（观望不需要）
    let proposal = null;
    if (signal.action !== '观望' && breaker.currentLevel >= 2) {
      const decideResult = decide(signal, quote);
      proposal = decideResult.proposal;
    }

    // 5. EXECUTE（Level 3 且方案通过）
    if (proposal && proposal.status !== 'rejected' && breaker.currentLevel === 3) {
      const threshold = strategy?.confidenceThreshold || 0.7;
      if (confidence >= threshold) {
        await execute(proposal.id, true);
      }
    }

    recordAudit(auditEntry);
    return { success: true, signal, proposal };
  } catch (err) {
    auditEntry.parseError = err.message;
    recordAudit(auditEntry);
    return { success: false, error: err.message };
  }
}

// ── 批量扫描 ──

async function scanSymbols(symbols, strategyId = 'balanced') {
  const results = [];
  for (const symbol of symbols) {
    const cycleResult = await runCycle(symbol, strategyId);
    results.push(cycleResult.success ? cycleResult.signal : { symbol, error: cycleResult.error });
  }
  return results;
}

// ── 兼容旧接口 ──

async function generateSignal(symbol, strategyId = 'balanced') {
  const result = await runCycle(symbol, strategyId);
  return result;
}

function createProposal(signal) {
  const quote = { price: signal.price };
  const result = decide(signal, quote);
  return result.proposal;
}

async function executeProposal(proposalId, forceLevel3 = false) {
  return await execute(proposalId, forceLevel3);
}

function getSignals(limit = 50) { return _getStore().signals.slice(0, limit); }
function getProposals(status = null) {
  const store = _getStore();
  if (status) return store.proposals.filter(p => p.status === status);
  return store.proposals.slice(0, 50);
}
function approveProposal(proposalId) {
  const store = _getStore();
  const proposal = store.proposals.find(p => p.id === proposalId);
  if (!proposal) return { success: false, error: '方案不存在' };
  if (proposal.status !== 'pending') return { success: false, error: '方案不可批准' };
  proposal.status = 'approved';
  return { success: true };
}
function rejectProposal(proposalId) {
  const store = _getStore();
  const proposal = store.proposals.find(p => p.id === proposalId);
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
  runCycle, observe, analyze, decide, execute,
  generateSignal, createProposal, executeProposal, scanSymbols,
  getSignals, getProposals, approveProposal, rejectProposal,
  removeStoreForAccount,
};
