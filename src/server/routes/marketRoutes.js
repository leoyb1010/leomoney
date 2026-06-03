/**
 * Leomoney 市场/行情路由
 */
const express = require('express');
const router = express.Router();
const { getMarketStatus } = require('../../../lib/market');
const { getQuotes, getStockQuote, searchSymbols, getApiHealth, getBinanceHealth } = require('../../../lib/quotes');
const cryptoMarket = require('../../../lib/binance');
const yahooUs = require('../../../lib/yahooUs');
const { buildQuoteStatus } = require('../../../lib/displayLabels');
const { parseSymbol } = require('../validation');

function buildFallbackKline(quote, count = 48) {
  const price = Number(quote.price || 0) || 1;
  const openBase = Number(quote.open || quote.prevClose || price) || price;
  const highBase = Number(quote.high || Math.max(openBase, price)) || price;
  const lowBase = Number(quote.low || Math.min(openBase, price)) || price;
  const prevClose = Number(quote.prevClose || openBase) || openBase;
  const points = [];
  const start = Date.now() - (count - 1) * 60 * 1000;
  let last = prevClose;
  for (let i = 0; i < count; i++) {
    const t = i / Math.max(1, count - 1);
    const wave = Math.sin(t * Math.PI * 3) * (highBase - lowBase) * 0.16;
    const target = prevClose + (price - prevClose) * t + wave;
    const close = i === count - 1 ? price : Math.max(lowBase, Math.min(highBase, target));
    const open = last;
    const high = Math.max(open, close) + Math.abs(highBase - lowBase) * 0.04;
    const low = Math.min(open, close) - Math.abs(highBase - lowBase) * 0.04;
    points.push({
      time: new Date(start + i * 60 * 1000).toISOString(),
      label: new Date(start + i * 60 * 1000).toTimeString().slice(0, 5),
      open,
      high,
      low,
      close,
      volume: Number(quote.volume || 0),
    });
    last = close;
  }
  return points;
}

async function fetchSinaMinuteKline(quote, scale = 5, datalen = 80) {
  if (!quote.sinaCode || !['astocks', 'indices'].includes(quote.category)) return null;
  const url = `https://quotes.sina.cn/cn/api/openapi.php/CN_MinlineService.getMinlineData?symbol=${encodeURIComponent(quote.sinaCode)}&scale=${encodeURIComponent(scale)}&ma=no&datalen=${encodeURIComponent(datalen)}`;
  const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 Leomoney' } });
  if (!response.ok) return null;
  const json = await response.json();
  const rows = json?.result?.data;
  if (!Array.isArray(rows) || rows.length === 0) return null;
  let last = Number(quote.prevClose || rows[0].p || quote.price || 0);
  return rows.map(row => {
    const close = Number(row.p);
    const open = Number.isFinite(last) && last > 0 ? last : close;
    const high = Math.max(open, close);
    const low = Math.min(open, close);
    last = close;
    return {
      time: row.m,
      label: String(row.m || '').slice(0, 5),
      open,
      high,
      low,
      close,
      volume: Number(row.v || 0),
      avgPrice: Number(row.avg_p || close),
    };
  }).filter(item => Number.isFinite(item.close) && item.close > 0);
}

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
    const quote = await findQuoteAny(parsed.symbol);
    if (!quote) return res.status(404).json({ success: false, error: '未找到该资产' });
    const scale = [1, 5, 15, 30, 60].includes(Number(req.query.scale)) ? Number(req.query.scale) : 5;
    const limit = Math.min(Math.max(Number(req.query.limit || 80), 20), 240);
    let points = null;
    let source = 'local_preview';
    if (quote.category === 'crypto' || cryptoMarket.isCryptoLike(quote.symbol)) {
      try {
        points = await cryptoMarket.getKlines(quote.symbol, scale, limit);
        if (points?.length) source = 'market_feed';
      } catch {
        points = null;
      }
    }
    if (!points?.length && quote.category === 'usstocks') {
      try {
        const intervalMap = { 1: '1m', 5: '5m', 15: '15m', 30: '30m', 60: '60m' };
        points = await yahooUs.getKlines(quote.symbol, intervalMap[scale] || '5m', '1d', limit);
        if (points?.length) source = 'yahoo_chart';
      } catch {
        points = null;
      }
    }
    if (!points?.length) {
      try {
        points = await fetchSinaMinuteKline(quote, scale, limit);
        if (points?.length) source = 'sina_minute';
      } catch {
        points = null;
      }
    }
    if (!points?.length) points = buildFallbackKline(quote, limit);
    res.json({
      success: true,
      symbol: quote.symbol || quote.code || quote.id || quote.sinaCode,
      name: quote.name,
      quote,
      source,
      points,
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
