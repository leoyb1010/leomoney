const { riskManager } = require('../../../lib/agent/riskManager');
const { breaker } = require('../../../lib/agent/circuitBreaker');
const { buy, sell } = require('../services/tradingService');

const LOT_SIZE = {
  astocks: 100,
  hkstocks: 100,
  usstocks: 1,
  metals: 1,
  crypto: 0.01,
};

function roundQty(qty, category) {
  const step = LOT_SIZE[category] || 1;
  if (step < 1) return Math.floor(qty / step) * step;
  return Math.floor(qty / step) * step;
}

function deriveQty(context, decision) {
  const price = Number(context.market?.price || 0);
  if (!price || price <= 0) return 0;

  const sizing = decision.positionSize || { mode: 'cash_percent', value: 0 };
  const category = context.market?.category || 'astocks';
  if (sizing.mode === 'shares') return roundQty(Number(sizing.value || 0), category);

  if (sizing.mode === 'position_percent') {
    const held = Number(context.position?.sellableQty || context.position?.totalQty || 0);
    return roundQty(held * Number(sizing.value || 0), category);
  }

  const availableCash = Number(context.account?.cash?.available || 0);
  const cashBudget = availableCash * Number(sizing.value || 0);
  return roundQty(cashBudget / price, category);
}

async function executionGate({ runId, mode, trigger, context, decision }) {
  if (!context.market) {
    return { allowed: false, executed: false, reason: '\u672a\u83b7\u53d6\u5230\u8be5\u6807\u7684\u884c\u60c5' };
  }
  if (context.market.dataQuality?.isSynthetic) {
    return { allowed: false, executed: false, reason: '\u884c\u60c5\u4e3a\u6a21\u62df\u6216\u5907\u7528\u6570\u636e\uff0c\u5df2\u963b\u6b62\u6267\u884c', dataQuality: context.market.dataQuality };
  }
  if (decision.action === 'HOLD' || decision.action === 'NO_OP') {
    return { allowed: false, executed: false, reason: '\u5f53\u524d\u51b3\u7b56\u4e3a\u89c2\u671b\uff0c\u65e0\u9700\u6267\u884c' };
  }
  if (decision.riskFlags.includes('HIGH_RISK')) {
    return { allowed: false, executed: false, reason: '\u51b3\u7b56\u5e26\u6709\u9ad8\u98ce\u9669\u6807\u8bb0\uff0c\u5df2\u963b\u6b62\u6267\u884c' };
  }

  const requiredLevel = mode === 'paper_execution' ? 3 : mode === 'simulation_only' ? 2 : 1;
  if (mode !== 'dry_run') {
    const allowance = breaker.checkAllowance(requiredLevel);
    if (!allowance.allowed) {
      return { allowed: false, executed: false, reason: allowance.reason, allowance };
    }
  }

  const qty = deriveQty(context, decision);
  if (!qty || qty <= 0) {
    return {
      allowed: false,
      executed: false,
      reason: '\u8ba1\u7b97\u6570\u91cf\u4f4e\u4e8e\u6700\u5c0f\u53ef\u4ea4\u6613\u5355\u4f4d',
      sizing: decision.positionSize,
      category: context.market.category,
    };
  }

  const proposal = {
    symbol: decision.symbol,
    action: decision.action,
    qty,
    price: context.market.price,
    category: context.market.category,
    confidence: decision.confidence,
    riskLevel: decision.riskFlags.includes('HIGH_RISK') ? '高' : '中',
    name: context.market.name,
    runId,
    evidenceRefs: decision.evidenceRefs,
  };

  const riskCheck = riskManager.check(proposal, mode === 'dry_run' ? 2 : requiredLevel);
  if (!riskCheck.allowed) {
    return { allowed: false, executed: false, riskCheck, proposal };
  }

  if (mode !== 'paper_execution') {
    return { allowed: true, executed: false, dryRun: true, riskCheck, proposal };
  }

  const quote = {
    symbol: proposal.symbol,
    name: proposal.name,
    price: proposal.price,
    category: proposal.category,
    source: 'automation',
    mode,
    runId,
    decisionId: trigger.id,
    evidenceRefs: decision.evidenceRefs,
    riskApproved: true,
  };

  const result = decision.action === 'BUY'
    ? await buy(quote, proposal.qty)
    : await sell(quote, proposal.qty);

  return { allowed: true, executed: result.success, result, riskCheck, proposal };
}

module.exports = { executionGate, deriveQty };
