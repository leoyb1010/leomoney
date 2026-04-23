/**
 * Leomoney Agent 执行器 — 决策 → 执行
 * 安全门控：置信度、风险等级、仓位上限
 */

const { getAccount } = require('../../src/server/services/accountService');
const { buy, sell } = require('../../src/server/services/tradingService');
const { getStockQuote } = require('../quotes');
const { askLLM, isLLMReady } = require('./brain');
const { gatherIntelligence } = require('./eyes');
const { AGENT_PROMPT } = require('../../src/analytics/tradeEngine');
const { 分析交易 } = require('../../src/analytics/tradeEngine');

const MAX_SINGLE_POSITION_RATIO = 0.3; // 单只最多 30% 仓位
const MIN_CONFIDENCE = 0.6; // 最低置信度

/**
 * 执行单条决策（带安全门控）
 */
async function executeDecision(decision, quote) {
  if (!decision || decision.action === '观望') {
    return { executed: false, reason: 'Agent 选择观望' };
  }

  // 置信度门控
  const confidence = Number(decision.置信度) || 0;
  if (confidence < MIN_CONFIDENCE) {
    return { executed: false, reason: `置信度不足: ${confidence.toFixed(2)} < ${MIN_CONFIDENCE}` };
  }

  // 风险等级门控
  if (decision.风险等级 === '高') {
    return { executed: false, reason: '风险等级过高，需人工确认' };
  }

  // 计算仓位
  const account = getAccount();
  if (!account) return { executed: false, reason: '账户不存在' };

  const price = quote.price;
  const ratio = Math.min(Number(decision.仓位比例) || 0.1, MAX_SINGLE_POSITION_RATIO);
  const maxAmount = account.balance * ratio;
  const qty = calculateQty(maxAmount, price, quote.category);

  if (!qty || qty <= 0) {
    return { executed: false, reason: `计算仓位为0 (余额=${account.balance}, 比例=${ratio}, 价格=${price})` };
  }

  try {
    let result;
    if (decision.action === '买入') {
      result = buy(quote, qty);
    } else if (decision.action === '卖出') {
      result = sell(quote, qty);
    } else {
      return { executed: false, reason: `未知动作: ${decision.action}` };
    }
    return { executed: result.success, result, decision, qty, price };
  } catch (err) {
    return { executed: false, reason: err.message };
  }
}

/**
 * 根据市场规则计算合规数量
 */
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
 * 对当前账户的每个自选股/持仓股进行 Agent 分析
 */
async function runStrategyScan() {
  if (!isLLMReady()) {
    throw new Error('LLM not configured');
  }

  const account = getAccount();
  if (!account) return [];

  const trades = account.history || [];
  const 分析结果 = 分析交易(trades);

  // 收集需要扫描的标的：持仓 + 自选
  const symbols = new Set([
    ...Object.keys(account.holdings || {}),
    // 自选可以从 watchlist 获取，这里先用持仓
  ]);

  const results = [];

  for (const symbol of symbols) {
    try {
      const quoteData = await getStockQuote(symbol);
      if (!quoteData || !quoteData.quote) continue;
      const quote = quoteData.quote;

      // 采集情报
      const intel = await gatherIntelligence(symbol, quote.name);

      // 组装 Prompt 数据
      const holding = account.holdings[symbol];
      const userMsg = JSON.stringify({
        标的: symbol,
        名称: quote.name,
        当前价格: quote.price,
        涨跌幅: quote.changePercent,
        持仓: holding ? { qty: holding.qty, avgCost: holding.avgCost } : null,
        近期新闻: intel.news.slice(0, 3),
        搜索结果: intel.search.slice(0, 2),
        账户余额: account.balance,
        交易表现: 分析结果.指标,
      });

      // 调 LLM
      const decision = await askLLM(AGENT_PROMPT, userMsg);

      // 尝试执行（有安全门控）
      const execResult = await executeDecision(decision, quote);

      results.push({
        symbol,
        name: quote.name,
        decision,
        execResult,
      });
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

  const quoteData = await getStockQuote(symbol);
  if (!quoteData || !quoteData.quote) {
    return { success: false, error: '未找到该标的' };
  }
  const quote = quoteData.quote;

  const account = getAccount();
  const trades = account?.history || [];
  const 分析结果 = 分析交易(trades);

  const intel = await gatherIntelligence(symbol, quote.name);
  const holding = account?.holdings?.[symbol];

  const userMsg = JSON.stringify({
    标的: symbol,
    名称: quote.name,
    当前价格: quote.price,
    涨跌幅: quote.changePercent,
    持仓: holding ? { qty: holding.qty, avgCost: holding.avgCost } : null,
    近期新闻: intel.news.slice(0, 3),
    搜索结果: intel.search.slice(0, 2),
    账户余额: account?.balance || 0,
    交易表现: 分析结果.指标,
  });

  const decision = await askLLM(AGENT_PROMPT, userMsg);
  const execResult = await executeDecision(decision, quote);

  return {
    success: true,
    symbol,
    name: quote.name,
    price: quote.price,
    decision,
    executed: execResult.executed,
    execResult,
  };
}

module.exports = { executeDecision, runStrategyScan, analyzeSingle };
