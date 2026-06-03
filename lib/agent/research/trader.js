const { actionFromRating } = require('./schemas');

function categoryRisk(category) {
  if (category === 'crypto') return { positionPct: 0.06, stopPct: 0.055, takePct: 0.11, note: '加密资产只适合小仓位模拟验证' };
  if (category === 'metals') return { positionPct: 0.08, stopPct: 0.035, takePct: 0.075, note: '贵金属用于宏观观察，避免追价' };
  return { positionPct: 0.1, stopPct: 0.035, takePct: 0.08, note: '美股/权益类默认小仓位模拟验证' };
}

function roundQty(value, category) {
  const n = Math.max(0, Number(value) || 0);
  if (category === 'crypto') return Number(n.toFixed(4));
  if (category === 'hkstocks') return Math.floor(n / 100) * 100;
  return Math.floor(n);
}

function buildTraderDraft(context, manager) {
  const q = context.quote;
  const hasPosition = !!context.position?.totalQty;
  const action = actionFromRating(manager.rating, hasPosition);
  const risk = categoryRisk(q.category);
  const cash = Number(context.account.cashAvailable || 0);
  const targetNotional = action === 'BUY' ? cash * risk.positionPct * manager.confidence : 0;
  const qty = action === 'BUY'
    ? roundQty(targetNotional / q.price, q.category)
    : action === 'SELL'
      ? roundQty((context.position?.sellableQty || context.position?.totalQty || 0) * Math.min(0.5, manager.confidence), q.category)
      : 0;

  const stopLoss = q.price * (action === 'SELL' ? (1 + risk.stopPct) : (1 - risk.stopPct));
  const takeProfit = q.price * (action === 'SELL' ? (1 - risk.takePct) : (1 + risk.takePct));

  return {
    role: 'trader',
    title: '交易员模拟方案草稿',
    action,
    actionLabel: action === 'BUY' ? '买入' : action === 'SELL' ? '卖出' : '观望',
    canCreateProposal: action !== 'HOLD' && qty > 0,
    qty,
    entry: {
      type: 'market_or_limit',
      referencePrice: q.price,
      currency: q.currency,
    },
    riskPlan: {
      stopLoss: Number(stopLoss.toFixed(q.price > 100 ? 2 : 4)),
      takeProfit: Number(takeProfit.toFixed(q.price > 100 ? 2 : 4)),
      maxPositionPct: risk.positionPct,
      invalidation: manager.invalidation || [],
    },
    plan: action === 'BUY'
      ? `仅生成模拟买入草稿，目标不超过现金 ${(risk.positionPct * manager.confidence * 100).toFixed(1)}%。`
      : action === 'SELL'
        ? '仅生成模拟减仓草稿，用于已有持仓风险控制。'
        : '当前不生成交易方案，继续观察。',
    constraints: [
      risk.note,
      '必须进入 proposal -> risk gate -> user approve -> paper execution',
      '不得绕过现有风控和用户确认直接写入持仓',
    ],
  };
}

module.exports = {
  buildTraderDraft,
};
