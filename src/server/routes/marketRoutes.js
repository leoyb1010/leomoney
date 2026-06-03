/**
 * Leomoney 市场/行情路由
 */
const express = require('express');
const router = express.Router();
const { getMarketStatus } = require('../../../lib/market');
const { getQuotes, getStockQuote, searchSymbols, getApiHealth, getBinanceHealth, getAllSymbols } = require('../../../lib/quotes');
const cryptoMarket = require('../../../lib/binance');
const yahooUs = require('../../../lib/yahooUs');
const { buildQuoteStatus } = require('../../../lib/displayLabels');
const { parseSymbol } = require('../validation');

const KLINE_PERIODS = {
  '1m': { scale: 1, yahooInterval: '1m', yahooRange: '1d', binance: '1m', stepMs: 60 * 1000 },
  '5m': { scale: 5, yahooInterval: '5m', yahooRange: '5d', binance: '5m', stepMs: 5 * 60 * 1000 },
  '15m': { scale: 15, yahooInterval: '15m', yahooRange: '5d', binance: '15m', stepMs: 15 * 60 * 1000 },
  '30m': { scale: 30, yahooInterval: '30m', yahooRange: '1mo', binance: '30m', stepMs: 30 * 60 * 1000 },
  '1h': { scale: 60, yahooInterval: '60m', yahooRange: '3mo', binance: '1h', stepMs: 60 * 60 * 1000 },
  '1D': { yahooInterval: '1d', yahooRange: '1y', binance: '1d', stepMs: 24 * 60 * 60 * 1000 },
  '1W': { yahooInterval: '1wk', yahooRange: '5y', binance: '1w', stepMs: 7 * 24 * 60 * 60 * 1000 },
  '1M': { yahooInterval: '1mo', yahooRange: '10y', binance: '1M', stepMs: 30 * 24 * 60 * 60 * 1000 },
};

function normalizeKlinePeriod(query) {
  const raw = String(query.period || '').trim();
  if (KLINE_PERIODS[raw]) return raw;
  const scale = Number(query.scale);
  if ([1, 5, 15, 30].includes(scale)) return `${scale}m`;
  if (scale === 60) return '1h';
  return '5m';
}

function buildFallbackKline(quote, count = 48, stepMs = 60 * 1000) {
  const price = Number(quote.price || 0) || 1;
  const openBase = Number(quote.open || quote.prevClose || price) || price;
  const highBase = Number(quote.high || Math.max(openBase, price)) || price;
  const lowBase = Number(quote.low || Math.min(openBase, price)) || price;
  const prevClose = Number(quote.prevClose || openBase) || openBase;
  const points = [];
  const start = Date.now() - (count - 1) * stepMs;
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
      time: new Date(start + i * stepMs).toISOString(),
      label: stepMs < 24 * 60 * 60 * 1000
        ? new Date(start + i * stepMs).toTimeString().slice(0, 5)
        : new Date(start + i * stepMs).toISOString().slice(0, 10),
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

function toYahooSymbol(quote) {
  if (quote.yahooSymbol) return quote.yahooSymbol;
  const symbol = String(quote.symbol || quote.code || '').trim().toUpperCase();
  const sinaCode = String(quote.sinaCode || '').trim();
  if (!symbol && !sinaCode) return null;
  if (quote.category === 'usstocks') return symbol;
  if (quote.category === 'hkstocks') {
    const hk = symbol.replace(/^0+/, '').padStart(4, '0');
    return `${hk}.HK`;
  }
  if (quote.category === 'astocks') {
    const code = symbol || sinaCode.replace(/^(sh|sz|bj)/, '');
    if (sinaCode.startsWith('sh') || code.startsWith('6')) return `${code}.SS`;
    if (sinaCode.startsWith('sz') || code.startsWith('0') || code.startsWith('3')) return `${code}.SZ`;
  }
  if (quote.category === 'indices') {
    if (sinaCode === 'hkHSI' || symbol === 'HSI') return '^HSI';
    const code = quote.code || symbol || sinaCode.replace(/^(sh|sz)/, '');
    if (sinaCode.startsWith('sh') || code.startsWith('0')) return `${code}.SS`;
    if (sinaCode.startsWith('sz') || code.startsWith('3')) return `${code}.SZ`;
  }
  return null;
}

function toTencentSymbol(quote) {
  const symbol = String(quote.symbol || quote.code || '').trim().toUpperCase();
  const sinaCode = String(quote.sinaCode || '').trim();
  if (sinaCode && /^(sh|sz|hk)\w+/i.test(sinaCode)) return sinaCode;
  if (quote.category === 'hkstocks') return `hk${symbol}`;
  if (quote.category === 'astocks' || quote.category === 'indices') {
    if (symbol.startsWith('6') || symbol.startsWith('0')) return `sh${symbol}`;
    if (symbol.startsWith('3')) return `sz${symbol}`;
  }
  return null;
}

function parseKlineRow(row) {
  if (!Array.isArray(row) || row.length < 6) return null;
  const [date, open, close, high, low, volume] = row;
  const point = {
    time: new Date(`${date}T00:00:00+08:00`).toISOString(),
    label: String(date),
    open: Number(open),
    high: Number(high),
    low: Number(low),
    close: Number(close),
    volume: Number(volume || 0),
  };
  return [point.open, point.high, point.low, point.close].every(Number.isFinite) && point.close > 0 ? point : null;
}

async function fetchTencentKline(quote, period, limit) {
  if (!['1D', '1W', '1M'].includes(period)) return null;
  const symbol = toTencentSymbol(quote);
  if (!symbol) return null;
  const type = period === '1W' ? 'week' : period === '1M' ? 'month' : 'day';
  const url = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${encodeURIComponent(symbol)},${type},,,${encodeURIComponent(limit)},qfq`;
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 Leomoney',
      'Referer': 'https://gu.qq.com/',
    },
  });
  if (!response.ok) return null;
  const json = await response.json();
  const payload = json?.data?.[symbol];
  const rows = payload?.[`qfq${type}`] || payload?.[type];
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return rows.map(parseKlineRow).filter(Boolean).slice(-limit);
}

function cleanNasdaqNumber(value) {
  const n = Number(String(value || '').replace(/[$,]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function aggregateDaily(points, period, limit) {
  if (period === '1D') return points.slice(-limit);
  const groups = new Map();
  for (const point of points) {
    const date = new Date(point.time);
    const key = period === '1M'
      ? `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
      : (() => {
        const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
        const day = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - day);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
        return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
      })();
    const current = groups.get(key);
    if (!current) {
      groups.set(key, { ...point, label: key });
    } else {
      current.high = Math.max(current.high, point.high);
      current.low = Math.min(current.low, point.low);
      current.close = point.close;
      current.volume = Number(current.volume || 0) + Number(point.volume || 0);
      current.time = point.time;
    }
  }
  return Array.from(groups.values()).slice(-limit);
}

async function fetchNasdaqDailyKline(symbol, period, limit) {
  if (!['1D', '1W', '1M'].includes(period)) return null;
  const lookbackDays = period === '1M' ? 3650 : period === '1W' ? 1800 : 430;
  const to = new Date();
  const from = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
  const url = `https://api.nasdaq.com/api/quote/${encodeURIComponent(symbol)}/historical?assetclass=stocks&fromdate=${from.toISOString().slice(0, 10)}&todate=${to.toISOString().slice(0, 10)}&limit=1000`;
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 Leomoney',
      'Accept': 'application/json',
      'Origin': 'https://www.nasdaq.com',
      'Referer': 'https://www.nasdaq.com/',
    },
  });
  if (!response.ok) return null;
  const json = await response.json();
  const rows = json?.data?.tradesTable?.rows;
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const points = rows.map(row => {
    const [month, day, year] = String(row.date || '').split('/');
    if (!month || !day || !year) return null;
    const point = {
      time: new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00-04:00`).toISOString(),
      label: `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`,
      open: cleanNasdaqNumber(row.open),
      high: cleanNasdaqNumber(row.high),
      low: cleanNasdaqNumber(row.low),
      close: cleanNasdaqNumber(row.close),
      volume: cleanNasdaqNumber(row.volume),
    };
    return [point.open, point.high, point.low, point.close].every(Number.isFinite) && point.close > 0 ? point : null;
  }).filter(Boolean).reverse();
  return aggregateDaily(points, period, limit);
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
    const config = KLINE_PERIODS[period];
    const limit = Math.min(Math.max(Number(req.query.limit || 120), 20), 520);
    let points = null;
    let source = 'local_preview';
    if (quote.category === 'crypto' || cryptoMarket.isCryptoLike(quote.symbol)) {
      try {
        points = await cryptoMarket.getKlines(quote.symbol, config.binance, limit);
        if (points?.length) source = 'market_feed';
      } catch {
        points = null;
      }
    }
    if (!points?.length && ['usstocks', 'astocks', 'hkstocks', 'indices'].includes(quote.category)) {
      try {
        if (quote.category === 'usstocks') {
          points = await fetchNasdaqDailyKline(quote.symbol, period, limit);
          if (points?.length) source = 'nasdaq_historical';
        } else {
          points = await fetchTencentKline(quote, period, limit);
          if (points?.length) source = 'tencent_kline';
        }
      } catch {
        points = null;
      }
    }
    if (!points?.length && ['usstocks', 'astocks', 'hkstocks', 'indices'].includes(quote.category)) {
      try {
        const yahooSymbol = toYahooSymbol(quote);
        if (yahooSymbol) {
          points = await yahooUs.getKlines(yahooSymbol, config.yahooInterval, config.yahooRange, limit);
          if (points?.length) source = 'yahoo_chart';
        }
      } catch {
        points = null;
      }
    }
    if (!points?.length && config.scale) {
      try {
        points = await fetchSinaMinuteKline(quote, config.scale, limit);
        if (points?.length) source = 'sina_minute';
      } catch {
        points = null;
      }
    }
    if (!points?.length) points = buildFallbackKline(quote, limit, config.stepMs);
    res.json({
      success: true,
      symbol: quote.symbol || quote.code || quote.id || quote.sinaCode,
      name: quote.name,
      quote,
      source,
      period,
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
