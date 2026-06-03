const RATING_META = {
  BUY: { labelZh: '买入', labelEn: 'Buy', weight: 2 },
  OVERWEIGHT: { labelZh: '偏多', labelEn: 'Overweight', weight: 1 },
  HOLD: { labelZh: '观望', labelEn: 'Hold', weight: 0 },
  UNDERWEIGHT: { labelZh: '偏谨慎', labelEn: 'Underweight', weight: -1 },
  SELL: { labelZh: '卖出', labelEn: 'Sell', weight: -2 },
};

const RESEARCH_STEPS = [
  ['quote', '读取行情与账户快照'],
  ['intel', '读取情报与历史记忆'],
  ['market', '技术/市场分析完成'],
  ['news', '新闻分析完成'],
  ['sentiment', '情绪分析完成'],
  ['fundamental', '基本面/资产质量分析完成'],
  ['bull', '多头研究员观点完成'],
  ['bear', '空头研究员观点完成'],
  ['manager', '研究经理裁决完成'],
  ['trader', '交易员模拟方案草稿完成'],
  ['risk', '风险团队审查完成'],
  ['portfolio', '组合经理结论完成'],
];

function clamp(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function ratingFromScore(score) {
  const normalized = clamp(score, -5, 5);
  if (normalized >= 2.6) return 'BUY';
  if (normalized >= 0.8) return 'OVERWEIGHT';
  if (normalized <= -2.6) return 'SELL';
  if (normalized <= -0.8) return 'UNDERWEIGHT';
  return 'HOLD';
}

function ratingLabel(rating, lang = 'zh') {
  const meta = RATING_META[rating] || RATING_META.HOLD;
  return lang === 'en' ? meta.labelEn : meta.labelZh;
}

function actionFromRating(rating, hasPosition = false) {
  if (rating === 'BUY' || rating === 'OVERWEIGHT') return 'BUY';
  if ((rating === 'SELL' || rating === 'UNDERWEIGHT') && hasPosition) return 'SELL';
  return 'HOLD';
}

function riskLevelFromScore(score, dataQualityRisk = false) {
  const abs = Math.abs(Number(score) || 0);
  if (dataQualityRisk) return '高';
  if (abs >= 3.2) return '中';
  if (abs >= 1.2) return '中';
  return '低';
}

function normalizeSymbol(symbol) {
  return String(symbol || '').trim().toUpperCase();
}

function createProgress() {
  return RESEARCH_STEPS.map(([id, label]) => ({ id, label, status: 'pending', at: null }));
}

function markProgress(progress, stepId, status = 'completed') {
  const now = new Date().toISOString();
  return progress.map(step => {
    if (step.id === stepId) return { ...step, status, at: now };
    return step;
  });
}

function makeRunId(symbol) {
  const safe = normalizeSymbol(symbol).replace(/[^A-Z0-9._:-]/g, '').slice(0, 24) || 'SYMBOL';
  return `research_${safe}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

module.exports = {
  RATING_META,
  RESEARCH_STEPS,
  actionFromRating,
  clamp,
  createProgress,
  makeRunId,
  markProgress,
  normalizeSymbol,
  ratingFromScore,
  ratingLabel,
  riskLevelFromScore,
};
