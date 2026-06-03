/**
 * 美股实时行情 — Yahoo Finance 公开 Chart API
 */

const cache = new Map();
const CACHE_MS = 2500;

async function fetchWithTimeout(url, options = {}, timeoutMs = 4500) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchYahooChart(symbol, interval = '1m', range = '1d', timeoutMs = 4500) {
  const sym = String(symbol || '').trim().toUpperCase();
  if (!sym || sym.length > 12) return null;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=${encodeURIComponent(interval)}&range=${encodeURIComponent(range)}`;
  const res = await fetchWithTimeout(url, {
    headers: { 'User-Agent': 'LeoMoney/4.0 YahooUS' },
  }, timeoutMs);
  if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);
  const json = await res.json();
  return json?.chart?.result?.[0] || null;
}

async function fetchChart(symbol) {
  const result = await fetchYahooChart(symbol, '1m', '1d', 4500);
  if (!result) return null;

  const meta = result.meta || {};
  const quotes = result.indicators?.quote?.[0] || {};
  const closes = quotes.close || [];
  const lastIdx = closes.length - 1;
  const price = meta.regularMarketPrice
    ?? (lastIdx >= 0 ? closes[lastIdx] : null)
    ?? meta.previousClose;
  if (!price || !Number.isFinite(price)) return null;

  const prevClose = meta.chartPreviousClose || meta.previousClose || price;
  const change = price - prevClose;
  const changePercent = prevClose ? (change / prevClose * 100) : 0;

  return {
    symbol: sym,
    name: meta.shortName || meta.longName || sym,
    price,
    prevClose,
    open: meta.regularMarketOpen || quotes.open?.[0] || price,
    high: meta.regularMarketDayHigh || Math.max(...(quotes.high || []).filter(Number.isFinite)) || price,
    low: meta.regularMarketDayLow || Math.min(...(quotes.low || []).filter(Number.isFinite)) || price,
    volume: meta.regularMarketVolume || 0,
    change,
    changePercent,
    market: 'US',
    category: 'usstocks',
    currency: 'USD',
    source: 'yahoo',
    live: true,
    exchange: meta.exchangeName || meta.fullExchangeName || '',
  };
}

async function getKlines(symbol, interval = '5m', range = '1d', limit = 120) {
  const sym = String(symbol || '').trim().toUpperCase();
  if (!sym || sym.length > 16) return [];
  const safeInterval = ['1m', '2m', '5m', '15m', '30m', '60m', '1d', '1wk', '1mo'].includes(String(interval)) ? String(interval) : '5m';
  const safeRange = ['1d', '5d', '1mo', '3mo', '6mo', '1y', '2y', '5y', '10y'].includes(String(range)) ? String(range) : '1d';
  const result = await fetchYahooChart(sym, safeInterval, safeRange, 7000);
  const timestamps = result?.timestamp || [];
  const quote = result?.indicators?.quote?.[0] || {};
  const points = timestamps.map((ts, i) => ({
    time: new Date(ts * 1000).toISOString(),
    label: safeInterval.endsWith('m')
      ? new Date(ts * 1000).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
      : new Date(ts * 1000).toLocaleDateString('zh-CN'),
    open: Number(quote.open?.[i]),
    high: Number(quote.high?.[i]),
    low: Number(quote.low?.[i]),
    close: Number(quote.close?.[i]),
    volume: Number(quote.volume?.[i] || 0),
  })).filter(item =>
    Number.isFinite(item.open)
    && Number.isFinite(item.high)
    && Number.isFinite(item.low)
    && Number.isFinite(item.close)
    && item.close > 0
  );
  return points.slice(-Math.min(Math.max(Number(limit || 120), 20), 520));
}

async function getQuote(symbol) {
  const sym = String(symbol || '').trim().toUpperCase();
  const hit = cache.get(sym);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;

  try {
    const data = await fetchChart(sym);
    if (data) cache.set(sym, { at: Date.now(), data });
    return data;
  } catch (err) {
    console.error('[YahooUS]', sym, err.message);
    return null;
  }
}

async function getQuotes(symbols) {
  const list = [...new Set((symbols || []).map(s => String(s).trim().toUpperCase()).filter(Boolean))];
  const pairs = await Promise.all(list.map(async (sym) => [sym, await getQuote(sym)]));
  const out = {};
  for (const [sym, q] of pairs) {
    if (q?.price > 0) out[sym] = q;
  }
  return out;
}

function isUsTicker(symbol) {
  const s = String(symbol || '').trim().toUpperCase();
  if (!s) return false;
  if (/^\d{5,6}$/.test(s)) return false;
  if (/^(SH|SZ|HK|BJ)\d+/i.test(s)) return false;
  return /^[A-Z][A-Z0-9.-]{0,11}$/.test(s);
}

module.exports = { getQuote, getQuotes, isUsTicker, fetchChart, fetchYahooChart, getKlines };
