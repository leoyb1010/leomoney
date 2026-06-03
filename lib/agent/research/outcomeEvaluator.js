const { getStockQuote } = require('../../quotes');
const { appendMemory } = require('./memory');

function calcReturn(nowPrice, startPrice) {
  const start = Number(startPrice || 0);
  const now = Number(nowPrice || 0);
  if (!start || !now) return null;
  return (now - start) / start;
}

async function evaluateOutcome(run) {
  if (!run?.symbol) throw new Error('研究记录不存在');
  const quote = await getStockQuote(run.symbol);
  if (!quote?.price) throw new Error(`无法获取 ${run.symbol} 当前行情，暂不能复盘`);
  const startPrice = Number(run.context?.quote?.price || run.quote?.price || 0);
  const rawReturn = calcReturn(quote.price, startPrice);

  let benchmarkReturn = null;
  const benchmarkSymbol = run.context?.benchmark?.symbol || run.benchmark?.symbol;
  if (benchmarkSymbol && !run.context?.benchmark?.unavailable) {
    try {
      const benchmarkNow = await getStockQuote(benchmarkSymbol);
      benchmarkReturn = calcReturn(benchmarkNow?.price, run.context?.benchmark?.price);
    } catch {
      benchmarkReturn = null;
    }
  }

  const alpha = rawReturn === null ? null : rawReturn - (benchmarkReturn || 0);
  const verdict = alpha === null
    ? 'unknown'
    : alpha >= 0.01
      ? 'outperformed'
      : alpha <= -0.01
        ? 'missed'
        : 'inline';
  const lessons = buildLessons(run, rawReturn, benchmarkReturn, alpha, verdict);
  const outcome = {
    id: `outcome_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    runId: run.id,
    symbol: run.symbol,
    evaluatedAt: new Date().toISOString(),
    rating: run.manager?.rating,
    action: run.traderDraft?.action,
    startPrice,
    currentPrice: Number(quote.price),
    rawReturnPct: rawReturn === null ? null : Number((rawReturn * 100).toFixed(2)),
    benchmark: benchmarkSymbol || null,
    benchmarkReturnPct: benchmarkReturn === null ? null : Number((benchmarkReturn * 100).toFixed(2)),
    alphaPct: alpha === null ? null : Number((alpha * 100).toFixed(2)),
    verdict,
    lessons,
  };
  appendMemory(run.symbol, outcome);
  return outcome;
}

function buildLessons(run, rawReturn, benchmarkReturn, alpha, verdict) {
  const lessons = [];
  if (rawReturn !== null) {
    lessons.push(`绝对表现 ${(rawReturn * 100).toFixed(2)}%。`);
  }
  if (benchmarkReturn !== null) {
    lessons.push(`相对基准 ${(alpha * 100).toFixed(2)}%。`);
  }
  if (verdict === 'outperformed') {
    lessons.push('本次判断暂时跑赢基准，下次仍需确认是逻辑有效还是短期波动。');
  } else if (verdict === 'missed') {
    lessons.push('本次判断落后基准，下次需要降低同类证据权重或等待更清晰确认。');
  } else {
    lessons.push('表现接近基准，说明结论没有形成明显优势，应继续复盘证据质量。');
  }
  if (run.manager?.keyDisagreements?.length) {
    lessons.push(`重点复查分歧：${run.manager.keyDisagreements[0]}`);
  }
  return lessons;
}

module.exports = {
  evaluateOutcome,
};
