/**
 * 美股实时行情 — Yahoo Finance 公开 Chart API
 */

const cache = new Map();
const CACHE_MS = 2500;

async function fetchChart(symbol) {
  const sym = String(symbol || '').trim().toUpperCase();
  if (!sym || sym.length > 12) return null;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1m&range=1d`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'LeoMoney/3.2 YahooUS' },
  });
  if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);
  const json = await res.json();
  const result = json?.chart?.result?.[0];
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

module.exports = { getQuote, getQuotes, isUsTicker, fetchChart };