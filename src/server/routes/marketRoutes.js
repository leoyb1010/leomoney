/**
 * Leomoney 市场/行情路由
 */
const express = require('express');
const router = express.Router();
const { getMarketStatus } = require('../../../lib/market');
const { getQuotes, getStockQuote, searchSymbols, getApiHealth, getBinanceHealth, getAllSymbols } = require('../../../lib/quotes');
const yahooUs = require('../../../lib/yahooUs');
const { buildQuoteStatus } = require('../../../lib/displayLabels');
const { normalizeKlinePeriod } = require('../../../lib/marketData/periods');
const { getKline, getKlineProviderStatus } = require('../../../lib/marketData/klineProviders');
const { parseSymbol } = require('../validation');

async function findQuoteAny(symbol) {
  const key = String(symbol || '').trim();
  if (!key) return null;
  const direct = await getStockQuote(key);
  if (direct) return direct;
  const quotes = await getQuotes();
  const all = [
    ...(quotes.indices || []),
    ...(quotes.astocks || []),
    ...(quotes.hkstocks || []),
    ...(quotes.usstocks || []),
    ...(quotes.metals || []),
    ...(quotes.crypto || []),
  ];
  const quote = all.find(item => [item.symbol, item.code, item.id, item.sinaCode].filter(Boolean).map(String).includes(key));
  if (!quote) return null;
  return {
    symbol: quote.symbol || quote.code || quote.id || quote.sinaCode,
    ...quote,
    category: quote.category || 'indices',
  };
}

function findKnownAsset(symbol) {
  const key = String(symbol || '').trim();
  if (!key) return null;
  const normalized = key.toUpperCase();
  const assets = getAllSymbols();
  for (const [category, rows] of Object.entries(assets)) {
    const found = (rows || []).find(item => (
      [item.symbol, item.code, item.id, item.sinaCode]
        .filter(Boolean)
        .map(value => String(value).toUpperCase())
        .includes(normalized)
    ));
    if (found) {
      return {
        symbol: found.symbol || found.code || found.id || found.sinaCode,
        ...found,
        category,
      };
    }
  }
  return null;
}

async function findQuoteForKline(symbol) {
  return findKnownAsset(symbol) || await findQuoteAny(symbol);
}

async function buildMarketOverview() {
  const quotes = await getQuotes();
  const now = new Date().toISOString();
  const yahooIndexSymbols = [
    { symbol: '^GSPC', displaySymbol: 'SPX', name: 'S&P 500' },
    { symbol: '^IXIC', displaySymbol: 'NASDAQ', name: 'Nasdaq Composite' },
    { symbol: '^DJI', displaySymbol: 'DOW', name: 'Dow Jones' },
    { symbol: '^VIX', displaySymbol: 'VIX', name: 'VIX' },
  ];
  const indexQuotes = await Promise.all(yahooIndexSymbols.map(async item => {
    try {
      const q = await yahooUs.fetchChart(item.symbol);
      if (!q?.price) return null;
      return {
        ...q,
        symbol: item.displaySymbol,
        yahooSymbol: item.symbol,
        name: item.name,
        category: 'indices',
        currency: 'USD',
        asOf: now,
        dataQuality: { isSynthetic: false, source: 'yahoo_chart', note: 'Yahoo Finance 公开 Chart API' },
      };
    } catch {
      return null;
    }
  }));
  const crypto = ['BTCUSDT', 'ETHUSDT'].map(sym => (quotes.crypto || []).find(q => q.symbol === sym)).filter(Boolean)
    .map(q => ({ ...q, asOf: now }));
  const fallbackIndices = (quotes.indices || []).slice(0, 3).map(q => ({ ...q, asOf: now }));
  return {
    success: true,
    asOf: now,
    indices: indexQuotes.filter(Boolean).length ? indexQuotes.filter(Boolean) : fallbackIndices,
    crypto,
    freshness: {
      quoteTs: quotes.ts || Date.now(),
      ageMs: quotes.ts ? Date.now() - quotes.ts : 0,
    },
  };
}

router.get('/market', (req, res) => {
  const health = getApiHealth();
  res.json({ success: true, ...getMarketStatus(), apiHealth: health });
});

router.get('/market/providers', (req, res) => {
  res.json({ success: true, ...getKlineProviderStatus() });
});

router.get('/quotes', async (req, res) => {
  try {
    const quotes = await getQuotes();
    const market = getMarketStatus();
    const quoteStatus = buildQuoteStatus(market, { crypto: getBinanceHealth() });
    res.json({ success: true, ...quotes, market, quoteStatus });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/market/overview', async (req, res) => {
  try {
    const overview = await buildMarketOverview();
    res.json(overview);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/quotes/:symbol', async (req, res) => {
  try {
    const parsed = parseSymbol(req.params.symbol);
    if (!parsed.ok) return res.status(400).json({ success: false, error: parsed.error });
    const quote = await findQuoteAny(parsed.symbol);
    if (!quote) return res.status(404).json({ success: false, error: '未找到该资产' });
    res.json({ success: true, quote });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/kline/:symbol', async (req, res) => {
  try {
    const parsed = parseSymbol(req.params.symbol);
    if (!parsed.ok) return res.status(400).json({ success: false, error: parsed.error });
    const quote = await findQuoteForKline(parsed.symbol);
    if (!quote) return res.status(404).json({ success: false, error: '未找到该资产' });
    const period = normalizeKlinePeriod(req.query);
    const limit = Math.min(Math.max(Number(req.query.limit || 120), 20), 520);
    const kline = await getKline({ quote, period, limit });
    res.json({
      success: true,
      symbol: quote.symbol || quote.code || quote.id || quote.sinaCode,
      name: quote.name,
      quote,
      source: kline.source,
      provider: kline.provider,
      providerTier: kline.providerTier,
      period,
      points: kline.points,
      diagnostics: kline.diagnostics,
      fallback: kline.fallback,
      cached: kline.cached,
      cacheAgeMs: kline.cacheAgeMs || 0,
      cacheTtlMs: kline.cacheTtlMs,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.status(400).json({ success: false, error: '缺少参数: q' });
    const results = await searchSymbols(q);
    res.json({ success: true, keyword: q, count: results.length, results });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
