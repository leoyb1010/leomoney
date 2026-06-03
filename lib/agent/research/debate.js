const { clamp, ratingFromScore, ratingLabel } = require('./schemas');

function collectPositive(analysts) {
  return analysts.flatMap(report => {
    if (report.score < 0.2) return [];
    return (report.evidence || []).slice(0, 2).map(text => ({
      source: report.title,
      text,
      score: report.score,
    }));
  });
}

function collectNegative(analysts) {
  return analysts.flatMap(report => {
    const risks = (report.risks || []).map(text => ({ source: report.title, text, score: -Math.abs(report.score || 0.4) }));
    if (report.score < -0.2) {
      return [
        ...(report.evidence || []).slice(0, 2).map(text => ({ source: report.title, text, score: report.score })),
        ...risks,
      ];
    }
    return risks;
  });
}

function buildDebate(context, analysts, config = {}) {
  const positives = collectPositive(analysts).slice(0, 8);
  const negatives = collectNegative(analysts).slice(0, 8);
  const analystScore = analysts.reduce((sum, report) => sum + Number(report.score || 0), 0) / Math.max(analysts.length, 1);
  const debateTilt = clamp(positives.length * 0.18 - negatives.length * 0.18, -1, 1);
  const score = clamp(analystScore + debateTilt, -5, 5);
  const rating = ratingFromScore(score);
  const keyDisagreements = [];
  if (positives.length && negatives.length) {
    keyDisagreements.push('价格/情绪证据与风险约束需要同时评估，不能只看单边理由');
  }
  if (context.quote.category === 'crypto') {
    keyDisagreements.push('加密资产 24/7 高波动，机会与止损纪律之间存在天然冲突');
  }
  if (context.quote.dataQuality?.isSynthetic) {
    keyDisagreements.push('行情源降级时，研究结论只能用于观察，不能推动交易方案');
  }
  if (!keyDisagreements.length) {
    keyDisagreements.push('当前多空分歧较小，但仍需用仓位和止损控制判断错误');
  }

  return {
    rounds: Math.max(1, Number(config.debateRounds || 1)),
    bullResearcher: {
      role: 'bull_researcher',
      title: '多头研究员',
      thesis: positives.length
        ? `看多方认为 ${context.quote.symbol} 存在模拟盘验证价值。`
        : '看多方证据不足，暂不主张主动交易。',
      points: positives.length ? positives : [{ source: '系统', text: '暂无强看多证据', score: 0 }],
      challengeToBear: negatives.length
        ? '风险存在，但需要区分可通过仓位控制的波动风险与硬性拒绝风险。'
        : '当前缺少明确利空，需要继续跟踪价格和新闻变化。',
    },
    bearResearcher: {
      role: 'bear_researcher',
      title: '空头研究员',
      thesis: negatives.length
        ? '空头方认为交易前必须优先解决数据、波动和仓位约束。'
        : '空头方未发现硬性拒绝理由，但仍建议小仓位验证。',
      points: negatives.length ? negatives : [{ source: '系统', text: '暂无明确反方证据', score: 0 }],
      challengeToBull: positives.length
        ? '看多证据不能自动转化为买入，必须先定义失效条件和最大亏损。'
        : '缺少正向催化时，不应为了交易而交易。',
    },
    researchManager: {
      role: 'research_manager',
      title: '研究经理',
      score: Number(score.toFixed(2)),
      rating,
      ratingLabel: ratingLabel(rating),
      confidence: Number(clamp(0.48 + Math.abs(score) / 8, 0.35, 0.88).toFixed(2)),
      summary: `多空辩论后综合评级为 ${ratingLabel(rating)}。该结论只生成研究与模拟方案草稿，不绕过风控和用户确认。`,
      keyDisagreements,
      invalidation: buildInvalidation(context, rating),
    },
  };
}

function buildInvalidation(context, rating) {
  const q = context.quote;
  const base = Number(q.price || 0);
  if (!base) return ['行情价格缺失时，本次判断失效'];
  const stop = q.category === 'crypto' ? 0.055 : 0.035;
  const upsideInvalidation = rating === 'BUY' || rating === 'OVERWEIGHT'
    ? `若跌破 ${(base * (1 - stop)).toFixed(base > 100 ? 2 : 4)} 且新闻/情绪同步转弱，看多判断失效`
    : `若重新站回 ${(base * (1 + stop)).toFixed(base > 100 ? 2 : 4)} 且相对基准转强，谨慎判断需要复核`;
  return [
    upsideInvalidation,
    '若行情源标记为降级或延迟，应先暂停交易方案',
    '若已有持仓超过账户风险上限，不新增仓位',
  ];
}

module.exports = {
  buildDebate,
};
