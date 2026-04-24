/**
 * Leomoney Agent 执行器 v2
 * 安全门控：置信度、风险等级、仓位上限
 * 改造点：
 *   1. 使用 cash/positions 新结构
 *   2. 所有交易调用加 await
 *   3. 执行前重新读取账户状态
 *   4. 接入审计链
 */

const { getAccount } = require('../../src/server/services/accountService');
const { buy, sell } = require('../../src/server/services/tradingService');
const { getStockQuote } = require('../quotes');
const { askLLM, isLLMReady } = require('./brain');
const { gatherIntelligence } = require('./eyes');
const { AGENT_PROMPT } = require('../../src/analytics/tradeEngine');
const { 分析交易 } = require('../../src/analytics/tradeEngine');
const { buildObservation } = require('./observationBuilder');
const { parseAgentAction } = require('./schema');
const { recordAudit } = require('./audit');
const { D, toMoney, calcBuyReserve } = require('../../src/server/domain/money');

const MAX_SINGLE_POSITION_RATIO = 0.3;
const MIN_CONFIDENCE = 0.6;

/**
 * 执行单条决策（带安全门控 + 审计）
 */
async function executeDecision(decision, quote) {
  const decisionId = `dec_exec_${Date.now()}`;
  let audit = {
    id: `audit_${decisionId}`,
    decisionId,
    symbol: quote.symbol,
    rawModelOutput: JSON.stringify(decision),
  };

  // 1. 观望直接返回
  if (!decision || (decision.action === '观望' || decision.action === 'HOLD')) {
    return { executed: false, reason: 'Agent 选择观望' };
  }

  // 2. 置信度门控
  const confidence = Number(decision.置信度 || decision.confidence || 0);
  if (confidence < MIN_CONFIDENCE) {
    return { executed: false, reason: `置信度不足: ${confidence.toFixed(2)} < ${MIN_CONFIDENCE}` };
  }

  // 3. 风险等级门控
  if ((decision.风险等级 || decision.riskLevel) === '高') {
    return { executed: false, reason: '风险等级过高，需人工确认' };
  }

  // 4. 重新读取账户实时状态
  const account = getAccount();
  if (!account) return { executed: false, reason: '账户不存在' };

  const cash = account.cash || { available: account.balance || 0, total: account.balance || 0 };
  const positions = account.positions || account.holdings || {};

  const price = quote.price;
  const ratio = Math.min(Number(decision.仓位比例 || decision.positionRatio || 0.1), MAX_SINGLE_POSITION_RATIO);
  const maxAmount = D(cash.available).times(ratio);
  const qty = calculateQty(maxAmount.toNumber(), price, quote.category);

  if (!qty || qty <= 0) {
    return { executed: false, reason: `计算仓位为0 (可用=${cash.available}, 比例=${ratio}, 价格=${price})` };
  }

  // 5. 买入前再次检查资金
  if (decision.action === '买入' || decision.action === 'BUY') {
    const reserve = calcBuyReserve(price, qty);
    if (D(cash.available).lt(reserve)) {
      return { executed: false, reason: `可用资金不足: ${cash.available} < ${reserve}` };
    }
  }
  // 6. 卖出前再次检查持仓
  if (decision.action === '卖出' || decision.action === 'SELL') {
    const pos = positions[quote.symbol];
    const sellable = pos?.sellableQty || pos?.qty || 0;
    if (D(sellable).lt(qty)) {
      return { executed: false, reason: `可卖数量不足: ${sellable} < ${qty}` };
    }
  }

  // 7. 执行交易（必须 await）
  try {
    let result;
    if (decision.action === '买入' || decision.action === 'BUY') {
      result = await buy(quote, qty);
    } else if (decision.action === '卖出' || decision.action === 'SELL') {
      result = await sell(quote, qty);
    } else {
      return { executed: false, reason: `未知动作: ${decision.action}` };
    }

    audit.executionResult = result;
    recordAudit(audit);

    return { executed: result.success, result, decision, qty, price };
  } catch (err) {
    audit.executionResult = { success: false, error: err.message };
    recordAudit(audit);
    return { executed: false, reason: err.message };
  }
}

function calculateQty(maxAmount, price, category) {
  const rules = getCategoryRules(category || 'astocks');
  let qty;
  if (rules.multiple) {
    qty = Math.floor(maxAmount / price / rules.step) * rules.step;
  } else {
    qty = Math.floor(maxAmount / price / rules.step) * rules.step;
  }
  return Math.max(0, qty);
}

function getCategoryRules(category) {
  switch (category) {
    case 'crypto': return { unit: '枚', step: 0.01, minQty: 0.01, multiple: false };
    case 'metals': return { unit: '盎司', step: 1, minQty: 1, multiple: false };
    case 'hkstocks': return { unit: '股', step: 100, minQty: 100, multiple: true };
    case 'usstocks': return { unit: '股', step: 1, minQty: 1, multiple: false };
    default: return { unit: '股', step: 100, minQty: 100, multiple: true };
  }
}

/**
 * 策略扫描入口（被 scheduler 调用）
 */
async function runStrategyScan() {
  if (!isLLMReady()) throw new Error('LLM not configured');

  const account = getAccount();
  if (!account) return [];

  const trades = account.history || [];
  const 分析结果 = 分析交易(trades);

  const symbols = new Set([
    ...Object.keys(account.positions || account.holdings || {}),
  ]);

  const results = [];
  for (const symbol of symbols) {
    try {
      const quote = await getStockQuote(symbol);
      if (!quote?.price) continue;

      const observation = await buildObservation({ symbol, quote });
      const intel = await gatherIntelligence(symbol, quote.name);

      const userMsg = JSON.stringify({
        schemaVersion: 'v1',
        要求: '请严格返回 JSON 格式: { action: "BUY|SELL|HOLD", symbol, qty, confidence: 0-1, thesis, riskNotes: [] }',
        observation,
        近期新闻: intel.news.slice(0, 3),
        搜索结果: intel.search.slice(0, 2),
        交易表现: 分析结果.指标,
      });

      const rawDecision = await askLLM(AGENT_PROMPT, userMsg);
      const parsed = parseAgentAction(typeof rawDecision === 'string' ? rawDecision : JSON.stringify(rawDecision));

      const execResult = await executeDecision(parsed.action, quote);

      results.push({ symbol, name: quote.name, decision: parsed.action, execResult });
    } catch (err) {
      results.push({ symbol, error: err.message });
    }
  }
  return results;
}

/**
 * 对单只标的做 Agent 分析（API 调用入口）
 */
async function analyzeSingle(symbol) {
  if (!isLLMReady()) {
    return { success: false, error: 'LLM 未配置，请设置 LLM_API_KEY 环境变量' };
  }

  const quote = await getStockQuote(symbol);
  if (!quote?.price) {
    return { success: false, error: '未找到该标的' };
  }

  const observation = await buildObservation({ symbol, quote });
  const intel = await gatherIntelligence(symbol, quote.name);
  const account = getAccount();
  const trades = account?.history || [];
  const 分析结果 = 分析交易(trades);

  const userMsg = JSON.stringify({
    schemaVersion: 'v1',
    要求: '请严格返回 JSON 格式: { action: "BUY|SELL|HOLD", symbol, qty, confidence: 0-1, thesis, riskNotes: [] }',
    observation,
    近期新闻: intel.news.slice(0, 3),
    搜索结果: intel.search.slice(0, 2),
    交易表现: 分析结果.指标,
  });

  const rawDecision = await askLLM(AGENT_PROMPT, userMsg);
  const parsed = parseAgentAction(typeof rawDecision === 'string' ? rawDecision : JSON.stringify(rawDecision));
  const execResult = await executeDecision(parsed.action, quote);

  return {
    success: true,
    symbol,
    name: quote.name,
    price: quote.price,
    decision: parsed.action,
    executed: execResult.executed,
    execResult,
  };
}

module.exports = { executeDecision, runStrategyScan, analyzeSingle };
