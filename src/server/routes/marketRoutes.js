/**
 * Leomoney 市场/行情路由
 */
const express = require('express');
const router = express.Router();
const { getMarketStatus } = require('../../../lib/market');
const { getQuotes, getStockQuote, searchSymbols, getApiHealth } = require('../../../lib/quotes');

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

router.get('/market', (req, res) => {
  const health = getApiHealth();
  res.json({ success: true, ...getMarketStatus(), apiHealth: health });
});

router.get('/quotes', async (req, res) => {
  try {
    const quotes = await getQuotes();
    const market = getMarketStatus();
    const quoteStatus = {
      lastUpdate: new Date().toISOString(),
      astocks: { source: '新浪实时', status: market.a.isOpen ? '实时刷新' : '休市冻结' },
      hkstocks: { source: '新浪实时', status: market.hk.isOpen ? '实时刷新' : '休市冻结' },
      usstocks: { source: '新浪实时', status: market.us.isOpen ? '实时刷新' : '休市冻结' },
      metals: { source: '新浪期货/模拟', status: '周期刷新' },
      crypto: { source: '新浪期货/模拟波动', status: market.crypto.isOpen ? '模拟刷新' : '模拟刷新' },
    };
    res.json({ success: true, ...quotes, market, quoteStatus });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/quotes/:symbol', async (req, res) => {
  try {
    const quote = await findQuoteAny(req.params.symbol);
    if (!quote) return res.status(404).json({ success: false, error: '未找到该资产' });
    res.json({ success: true, quote });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/kline/:symbol', async (req, res) => {
  try {
    const quote = await findQuoteAny(req.params.symbol);
    if (!quote) return res.status(404).json({ success: false, error: '未找到该资产' });
    const scale = Number(req.query.scale || 5);
    let points = null;
    let source = 'local_preview';
    try {
      points = await fetchSinaMinuteKline(quote, scale, Number(req.query.limit || 80));
      if (points?.length) source = 'sina_minute';
    } catch {
      points = null;
    }
    if (!points?.length) points = buildFallbackKline(quote, Number(req.query.limit || 60));
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
