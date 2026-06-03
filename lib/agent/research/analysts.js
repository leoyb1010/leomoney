const { clamp, ratingFromScore, ratingLabel } = require('./schemas');

function pct(value) {
  const n = Number(value || 0);
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}

function price(value, currency = 'USD') {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return '--';
  return `${currency} ${n.toLocaleString(undefined, { maximumFractionDigits: n >= 100 ? 2 : 4 })}`;
}

function compactTitle(item) {
  return String(item?.title || item?.snippet || '').replace(/\s+/g, ' ').trim();
}

function keywordScore(items) {
  const positive = ['增长', '上调', '盈利', '合作', '扩张', '流入', '突破', '强劲', 'approval', 'beat', 'upgrade', 'inflow', 'ai', 'record'];
  const negative = ['下调', '亏损', '监管', '诉讼', '裁员', '召回', '流出', '黑客', 'hack', 'downgrade', 'miss', 'lawsuit', 'sec', 'outflow', 'tariff'];
  let score = 0;
  for (const item of items) {
    const text = `${item.title || ''} ${item.snippet || ''}`.toLowerCase();
    positive.forEach(word => { if (text.includes(word.toLowerCase())) score += 0.35; });
    negative.forEach(word => { if (text.includes(word.toLowerCase())) score -= 0.45; });
  }
  return clamp(score, -2, 2);
}

function buildMarketAnalyst(context) {
  const q = context.quote;
  const chg = Number(q.changePercent || 0);
  const intraday = q.open ? ((q.price - q.open) / q.open) * 100 : 0;
  const range = q.high && q.low ? ((q.high - q.low) / q.price) * 100 : 0;
  let score = 0;
  if (chg > 2) score += 1.5;
  else if (chg > 0.5) score += 0.7;
  else if (chg < -2) score -= 1.5;
  else if (chg < -0.5) score -= 0.7;
  if (intraday > 0.5) score += 0.4;
  if (intraday < -0.5) score -= 0.4;
  if (range > 6) score -= 0.4;

  const evidence = [
    `${q.symbol} 最新价 ${price(q.price, q.currency)}，日内/24h 涨跌 ${pct(chg)}`,
    `开盘 ${price(q.open, q.currency)}，最高 ${price(q.high, q.currency)}，最低 ${price(q.low, q.currency)}`,
  ];
  if (q.volume) evidence.push(`成交量/成交额快照 ${Number(q.volume).toLocaleString()}`);

  const risks = [];
  if (range > 6) risks.push(`波动区间约 ${range.toFixed(2)}%，不适合大仓位追价`);
  if (q.dataQuality?.isSynthetic) risks.push(`行情源标记为模拟/降级：${q.dataQuality.note || q.dataQuality.source}`);
  if (context.benchmark?.changePercent !== undefined) {
    const rel = chg - Number(context.benchmark.changePercent || 0);
    evidence.push(`相对基准 ${context.benchmark.symbol} 为 ${pct(rel)}`);
    if (rel < -1.5) risks.push('相对基准明显走弱');
  }

  const rating = ratingFromScore(score);
  return {
    role: 'market_analyst',
    title: '市场/技术分析师',
    score: Number(score.toFixed(2)),
    rating,
    ratingLabel: ratingLabel(rating),
    summary: chg >= 0
      ? `价格动能偏强，当前证据为 ${ratingLabel(rating)}。`
      : `价格动能偏弱，当前证据为 ${ratingLabel(rating)}。`,
    evidence,
    risks,
    dataGrounding: ['quote.price', 'quote.changePercent', 'quote.open/high/low', 'benchmark.changePercent'],
  };
}

function buildNewsAnalyst(context) {
  const news = context.intel.news || [];
  const search = context.intel.search || [];
  const items = [...news, ...search];
  const score = keywordScore(items);
  const rating = ratingFromScore(score);
  const headlines = items.map(compactTitle).filter(Boolean).slice(0, 5);
  const risks = [];
  if (!items.length) risks.push('未获得可用新闻/检索结果，不能用新闻面支持交易');
  if (!context.intel.sourceConfigured && search.length === 0) risks.push('外部搜索未配置，新闻覆盖面有限');

  return {
    role: 'news_analyst',
    title: '新闻分析师',
    score: Number(score.toFixed(2)),
    rating,
    ratingLabel: ratingLabel(rating),
    summary: items.length
      ? `读取 ${items.length} 条新闻/搜索线索，新闻面暂为 ${ratingLabel(rating)}。`
      : '新闻数据不足，结论降级为观望。',
    evidence: headlines.length ? headlines : ['暂无可引用新闻标题'],
    risks,
    dataGrounding: ['intel.news', 'intel.search'],
  };
}

function buildSentimentAnalyst(context) {
  const q = context.quote;
  const newsScore = keywordScore([...(context.intel.news || []), ...(context.intel.search || [])]);
  const momentumScore = clamp(Number(q.changePercent || 0) / 3, -1.2, 1.2);
  const memoryPenalty = (context.memory || []).filter(item => item.verdict === 'missed' || item.alphaPct < 0).length * -0.15;
  const score = clamp(newsScore * 0.6 + momentumScore + memoryPenalty, -4, 4);
  const rating = ratingFromScore(score);
  const risks = [];
  if ((q.category === 'crypto' || q.category === 'metals') && Math.abs(q.changePercent || 0) > 4) {
    risks.push('高波动资产出现快速波动，情绪可能过热或恐慌');
  }
  if ((context.memory || []).length) {
    risks.push(`同标的已有 ${(context.memory || []).length} 条历史复盘，需警惕重复偏差`);
  }

  return {
    role: 'sentiment_analyst',
    title: '情绪分析师',
    score: Number(score.toFixed(2)),
    rating,
    ratingLabel: ratingLabel(rating),
    summary: `综合价格动能、新闻关键词和历史复盘，情绪为 ${ratingLabel(rating)}。`,
    evidence: [
      `价格动能贡献 ${momentumScore.toFixed(2)}`,
      `新闻关键词贡献 ${newsScore.toFixed(2)}`,
      `历史复盘修正 ${memoryPenalty.toFixed(2)}`,
    ],
    risks,
    dataGrounding: ['quote.changePercent', 'intel keywords', 'research memory'],
  };
}

function buildFundamentalAnalyst(context) {
  const q = context.quote;
  let score = 0;
  const evidence = [];
  const risks = [];

  if (q.category === 'crypto') {
    score += q.volume > 0 ? 0.7 : -0.3;
    evidence.push(`${q.symbol} 是 24/7 交易资产，行情来自 ${q.source}`);
    if (q.volume > 0) evidence.push(`流动性快照 ${Number(q.volume).toLocaleString()}`);
    risks.push('加密资产缺少传统财报和估值锚，仓位必须低于美股单标的');
  } else if (q.category === 'usstocks') {
    evidence.push(`${q.name || q.symbol} 的公司名和行情身份已由 LeoMoney 行情层确认`);
    risks.push('当前未接入财报/估值数据源，不能基于市盈率、营收或现金流给出确定判断');
    if (/NVDA|MSFT|AAPL|GOOGL|AMZN|META|AMD|TSLA/i.test(q.symbol)) {
      score += 0.35;
      evidence.push('属于高流动性美股核心观察池，适合模拟盘研究跟踪');
    }
  } else if (q.category === 'metals') {
    evidence.push('贵金属适合作为宏观/避险观察，不按公司基本面评估');
    risks.push('贵金属行情若为降级源，不能据此做大仓位交易');
  } else {
    evidence.push('资产身份已识别，但基本面数据源覆盖有限');
    risks.push('基本面结论只作为数据完整性提示，不作为买卖依据');
  }

  if (q.dataQuality?.isSynthetic) score -= 1;
  const rating = ratingFromScore(score);
  return {
    role: 'fundamental_analyst',
    title: q.category === 'crypto' ? '资产质量分析师' : '基本面分析师',
    score: Number(score.toFixed(2)),
    rating,
    ratingLabel: ratingLabel(rating),
    summary: `基本面/资产质量证据为 ${ratingLabel(rating)}；缺失数据已明确降级。`,
    evidence,
    risks,
    dataGrounding: ['quote.identity', 'quote.dataQuality', 'asset category'],
  };
}

function buildAnalystReports(context) {
  return [
    buildMarketAnalyst(context),
    buildNewsAnalyst(context),
    buildSentimentAnalyst(context),
    buildFundamentalAnalyst(context),
  ];
}

module.exports = {
  buildAnalystReports,
  buildFundamentalAnalyst,
  buildMarketAnalyst,
  buildNewsAnalyst,
  buildSentimentAnalyst,
};
