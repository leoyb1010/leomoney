function dataRisk(context) {
  const risks = [];
  if (context.quote.dataQuality?.isSynthetic) risks.push('行情源为模拟/降级数据');
  if (!context.quote.price) risks.push('行情价格缺失');
  if ((context.intel.news || []).length === 0 && (context.intel.search || []).length === 0) risks.push('新闻/搜索证据不足');
  return risks;
}

function buildRiskReview(context, traderDraft, manager, config = {}) {
  const hardRisks = dataRisk(context);
  const q = context.quote;
  const highVol = Math.abs(Number(q.changePercent || 0)) > (q.category === 'crypto' ? 8 : 5);
  const noTrade = traderDraft.action === 'HOLD' || !traderDraft.canCreateProposal;
  const positionSize = traderDraft.riskPlan?.maxPositionPct || 0;
  const rounds = Math.max(1, Number(config.riskDiscussRounds || 1));

  const conservative = {
    role: 'conservative_risk_reviewer',
    title: '保守风控',
    stance: hardRisks.length || highVol ? 'reject_or_wait' : 'allow_small_paper',
    summary: hardRisks.length
      ? `存在硬风险：${hardRisks.join('；')}。`
      : highVol
        ? '波动过高，建议等待回落或仅观察。'
        : '允许极小仓位模拟验证，但必须设置失效条件。',
    concerns: [
      ...hardRisks,
      ...(highVol ? ['短期波动过高'] : []),
      ...(positionSize > 0.12 ? ['草稿仓位偏大'] : []),
    ],
  };
  const aggressive = {
    role: 'aggressive_risk_reviewer',
    title: '激进风控',
    stance: manager.rating === 'BUY' || manager.rating === 'OVERWEIGHT' ? 'test_opportunity' : 'no_edge',
    summary: manager.rating === 'BUY' || manager.rating === 'OVERWEIGHT'
      ? '若用户愿意接受模拟盘波动，可用小仓位验证多头假设。'
      : '当前收益/风险不够清晰，不建议为了交易而交易。',
    concerns: highVol ? ['即使激进视角也需要降低仓位'] : [],
  };
  const neutral = {
    role: 'neutral_risk_reviewer',
    title: '中立风控',
    stance: noTrade ? 'hold' : 'paper_only',
    summary: noTrade ? '保持观察，等待新证据。' : '方案可进入模拟方案草稿，但仍需现有 risk gate 二次检查。',
    concerns: [
      '研究结论不是确定性投资建议',
      '真实交易前需要独立判断，本系统只服务模拟盘',
    ],
  };

  const approved = !hardRisks.length && !highVol && traderDraft.canCreateProposal && manager.confidence >= 0.52;
  const portfolioManager = {
    role: 'portfolio_manager',
    title: '组合经理',
    approved,
    decision: approved ? 'APPROVE_PROPOSAL_DRAFT' : 'REJECT_OR_OBSERVE',
    riskLevel: hardRisks.length || highVol ? '高' : manager.confidence >= 0.72 ? '中' : '中',
    summary: approved
      ? '批准生成模拟交易方案草稿，下一步仍必须走 LeoMoney proposal 风控和用户确认。'
      : '不批准生成交易草稿，研究报告保留为观察和复盘材料。',
    reasons: [
      ...(approved ? ['多空裁决与风控未出现硬拒绝'] : ['收益/风险或数据质量不足以生成方案']),
      ...hardRisks,
      ...(highVol ? ['波动超过研究室阈值'] : []),
    ],
    boundary: 'Research Desk 只能生成研究报告和模拟方案草稿，不能直接执行交易。',
  };

  return {
    rounds,
    reviewers: [conservative, aggressive, neutral],
    portfolioManager,
  };
}

module.exports = {
  buildRiskReview,
};
