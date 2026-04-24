/**
 * Leomoney 信号引擎 v2
 * 核心流程：Observation → Prompt → LLM → Schema校验 → Risk校验 → Audit记录 → 执行
 * 改造点：
 *   1. 使用 cash/positions 新结构
 *   2. 接入 observationBuilder 完整快照
 *   3. LLM 输出走 schema 解析，失败降级 HOLD
 *   4. 完整审计链（observation/prompt/raw/parsed/risk/execution）
 *   5. executeProposal 异步链路修复 + 风控闭环
 */

const { askLLM, isLLMReady } = require('./brain');
const { gatherIntelligence } = require('./eyes');
const { riskManager } = require('./riskManager');
const { breaker } = require('./circuitBreaker');
const { getStrategyPrompt, getStrategy } = require('./promptTemplates');
const { AGENT_PROMPT } = require('../../src/analytics/tradeEngine');
const { getAccount } = require('../../src/server/services/accountService');
const { getStockQuote } = require('../quotes');
const { buildObservation } = require('./observationBuilder');
const { parseAgentAction } = require('./schema');
const { recordAudit } = require('./audit');
const { D, toMoney, calcBuyReserve } = require('../../src/server/domain/money');
const { ORDER_STATUS } = require('../../src/server/domain/orderStateMachine');

const SIGNAL_MAX = 500;
const signals = [];
const proposals = [];

/**
 * 生成信号（完整链路）
 */
async function generateSignal(symbol, strategyId = 'balanced') {
  if (!isLLMReady()) return { success: false, error: 'LLM 未配置' };

  const decisionId = `dec_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  let auditEntry = {
    id: `audit_${decisionId}`,
    decisionId,
    symbol,
    rawModelOutput: '',
    parseError: null,
    submittedOrderIds: [],
  };

  try {
    // 1. 行情
    const quote = await getStockQuote(symbol);
    if (!quote?.price) return { success: false, error: '未找到该标的行情' };

    // 2. 构建 observation
    const observation = await buildObservation({ symbol, quote });
    auditEntry.observationSnapshot = observation;

    // 3. 情报采集
    const intel = await gatherIntelligence(symbol, quote.name);

    // 4. 组装 Prompt
    const systemPrompt = getStrategyPrompt(strategyId, AGENT_PROMPT);
    const strategy = getStrategy(strategyId);
    const userMsg = JSON.stringify({
      schemaVersion: 'v1',
      要求: '请严格返回 JSON 格式: { action: "BUY|SELL|HOLD", symbol, qty, confidence: 0-1, thesis, riskNotes: [], basedOn: {market,position,account,risk,news} }',
      observation,
      近期新闻: intel.news.slice(0, 5),
      搜索洞察: intel.search.slice(0, 3),
    }, null, 2);
    auditEntry.promptText = `System: ${systemPrompt.slice(0, 500)}...\nUser: ${userMsg.slice(0, 1000)}...`;

    // 5. 调 LLM
    const rawDecision = await askLLM(systemPrompt, userMsg);
    auditEntry.rawModelOutput = JSON.stringify(rawDecision);

    // 6. Schema 解析（失败降级 HOLD）
    const parsed = parseAgentAction(typeof rawDecision === 'string' ? rawDecision : JSON.stringify(rawDecision));
    auditEntry.parsedAction = parsed.action;
    if (!parsed.success) {
      auditEntry.parseError = parsed.error;
    }

    const action = parsed.action.action;
    const confidence = parsed.action.confidence;

    // 7. 构建信号
    const signal = {
      id: `sig_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      decisionId,
      symbol, name: quote.name,
      price: toMoney(quote.price),
      category: quote.category || 'astocks',
      strategy: strategyId,
      strategyName: strategy?.name || '默认',
      action: action === 'BUY' ? '买入' : action === 'SELL' ? '卖出' : '观望',
      confidence,
      riskLevel: confidence > 0.8 ? '低' : confidence > 0.5 ? '中' : '高',
      reason: parsed.action.thesis,
      parsedAction: parsed.action,
      intel: { newsCount: intel.news.length, searchCount: intel.search.length },
      ts: new Date().toISOString(),
    };

    signals.unshift(signal);
    if (signals.length > SIGNAL_MAX) signals.length = SIGNAL_MAX;

    // 8. 记录审计
    recordAudit(auditEntry);

    return { success: true, signal };
  } catch (err) {
    auditEntry.parseError = err.message;
    recordAudit(auditEntry);
    return { success: false, error: err.message };
  }
}

/**
 * 创建交易方案
 */
function createProposal(signal) {
  if (signal.action === '观望') return null;

  const account = getAccount();
  if (!account) return null;

  // 使用新结构
  const cash = account.cash || { available: account.balance || 0, total: account.balance || 0 };
  const positions = account.positions || account.holdings || {};
  const position = positions[signal.symbol];

  const strategy = getStrategy(signal.strategy);
  const ratio = Math.min(signal.confidence * (strategy?.positionRatio || 0.2), 0.3);
  const maxAmount = D(cash.available).times(ratio);
  const qty = _calculateQty(maxAmount.toNumber(), signal.price, signal.category);

  if (qty <= 0) return null;

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

  // 风控检查（使用实时账户状态）
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

  proposals.unshift(proposal);
  if (proposals.length > 200) proposals.length = 200;
  return proposal;
}

/**
 * 执行方案（异步链路修复）
 */
async function executeProposal(proposalId, forceLevel3 = false) {
  const proposal = proposals.find(p => p.id === proposalId);
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
  } catch { /* use proposal price */ }
  proposal.executedPrice = toMoney(currentPrice);

  // 重新读取账户实时状态 + 风控闭环
  const account = getAccount();
  const cash = account?.cash || { available: account?.balance || 0 };
  const positions = account?.positions || account?.holdings || {};

  // 买入前再次检查资金
  if (proposal.action === '买入') {
    const reserve = calcBuyReserve(currentPrice, proposal.qty);
    if (D(cash.available).lt(reserve)) {
      proposal.status = 'rejected';
      proposal.rejectionReason = `可用资金不足: ${cash.available} < ${reserve}`;
      return { success: false, error: proposal.rejectionReason };
    }
  }
  // 卖出前再次检查持仓
  if (proposal.action === '卖出') {
    const pos = positions[proposal.symbol];
    const sellable = pos?.sellableQty || pos?.qty || 0;
    if (D(sellable).lt(proposal.qty)) {
      proposal.status = 'rejected';
      proposal.rejectionReason = `可卖数量不足: ${sellable} < ${proposal.qty}`;
      return { success: false, error: proposal.rejectionReason };
    }
  }

  // 执行交易（await！）
  const { buy, sell } = require('../../src/server/services/tradingService');
  const quote = {
    symbol: proposal.symbol,
    name: proposal.name,
    price: currentPrice,
    category: proposal.category,
    strategy: `agent_${proposal.strategy}`,
    source: 'agent',
    decisionId: proposal.decisionId,
  };

  let result;
  try {
    if (proposal.action === '买入') {
      result = await buy(quote, proposal.qty);
    } else if (proposal.action === '卖出') {
      result = await sell(quote, proposal.qty);
    } else {
      return { success: false, error: `未知动作: ${proposal.action}` };
    }
  } catch (err) {
    result = { success: false, error: err.message };
  }

  // 确保 executionResult 不是 Promise
  proposal.executionResult = result;
  proposal.status = result.success ? 'executed' : 'failed';
  proposal.executedAt = new Date().toISOString();

  // 记录交易到熔断器
  breaker.recordTrade({ success: result.success, symbol: proposal.symbol });

  // 执行成功 + Level3 时生成止损止盈单
  if (result.success) {
    riskManager.recordTrade();
    if (forceLevel3 || breaker.currentLevel === 3) {
      const stopOrders = riskManager.generateStopOrders(proposal, { price: currentPrice, qty: proposal.qty });
      const { createOrder } = require('../../src/server/services/orderService');
      for (const order of stopOrders) {
        try { await createOrder(order); } catch (e) { console.error('[SignalEngine] 止损止盈单失败:', e.message); }
      }
    }
  }

  // 更新审计记录
  const { getAuditsByDecisionId } = require('./audit');
  const audits = getAuditsByDecisionId(proposal.decisionId);
  if (audits.length > 0) {
    audits[0].executionResult = result;
    audits[0].submittedOrderIds = result.orderId ? [result.orderId] : [];
  }

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
