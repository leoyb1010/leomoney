const cryptoMarket = require('../binance');
const yahooUs = require('../yahooUs');
const { KLINE_PERIODS } = require('./periods');
const { getMarketDataPlan } = require('./catalog');

const klineCache = new Map();

function cacheTtlMs(period) {
  const configured = Number(process.env.MARKET_DATA_KLINE_CACHE_TTL_MS || 0);
  if (configured > 0) return configured;
  if (['1D', '1W', '1M'].includes(period)) return 60 * 1000;
  return 15 * 1000;
}

function cleanQuoteSymbol(quote) {
  return String(quote?.symbol || quote?.code || quote?.id || quote?.sinaCode || '').trim();
}

function buildCacheKey(quote, period, limit) {
  return `${cleanQuoteSymbol(quote).toUpperCase()}:${quote?.category || ''}:${period}:${limit}`;
}

function readCache(key, period) {
  const hit = klineCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > cacheTtlMs(period)) return null;
  return { ...hit.data, cached: true, cacheAgeMs: Date.now() - hit.at };
}

function writeCache(key, data) {
  klineCache.set(key, { at: Date.now(), data });
  if (klineCache.size > 250) {
    const oldest = klineCache.keys().next().value;
    if (oldest) klineCache.delete(oldest);
  }
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

function isEquityLike(quote) {
  return ['usstocks', 'astocks', 'hkstocks', 'indices'].includes(quote?.category);
}

const providers = [
  {
    id: 'binance_public',
    source: 'market_feed',
    tier: 'free',
    supports: quote => quote.category === 'crypto' || cryptoMarket.isCryptoLike(quote.symbol),
    fetch: async (quote, period, config, limit) => cryptoMarket.getKlines(quote.symbol, config.binance, limit),
  },
  {
    id: 'nasdaq_historical',
    source: 'nasdaq_historical',
    tier: 'free',
    supports: (quote, period) => quote.category === 'usstocks' && ['1D', '1W', '1M'].includes(period),
    fetch: async (quote, period, config, limit) => fetchNasdaqDailyKline(quote.symbol, period, limit),
  },
  {
    id: 'tencent_kline',
    source: 'tencent_kline',
    tier: 'free',
    supports: (quote, period) => ['astocks', 'hkstocks', 'indices'].includes(quote.category) && ['1D', '1W', '1M'].includes(period),
    fetch: async (quote, period, config, limit) => fetchTencentKline(quote, period, limit),
  },
  {
    id: 'yahoo_chart',
    source: 'yahoo_chart',
    tier: 'free',
    supports: quote => isEquityLike(quote),
    fetch: async (quote, period, config, limit) => {
      const yahooSymbol = toYahooSymbol(quote);
      if (!yahooSymbol) return null;
      return yahooUs.getKlines(yahooSymbol, config.yahooInterval, config.yahooRange, limit);
    },
  },
  {
    id: 'sina_minute',
    source: 'sina_minute',
    tier: 'free',
    supports: (quote, period, config) => Boolean(config.scale),
    fetch: async (quote, period, config, limit) => fetchSinaMinuteKline(quote, config.scale, limit),
  },
];

async function runProvider(provider, quote, period, config, limit) {
  const startedAt = Date.now();
  const result = { id: provider.id, source: provider.source, tier: provider.tier, ok: false, latencyMs: 0 };
  try {
    if (!provider.supports(quote, period, config)) {
      return { ...result, skipped: true, reason: 'unsupported' };
    }
    const points = await provider.fetch(quote, period, config, limit);
    result.latencyMs = Date.now() - startedAt;
    if (Array.isArray(points) && points.length > 0) {
      return { ...result, ok: true, points };
    }
    return { ...result, reason: 'no_points' };
  } catch (err) {
    return { ...result, latencyMs: Date.now() - startedAt, reason: err.message };
  }
}

async function getKline({ quote, period, limit }) {
  const config = KLINE_PERIODS[period] || KLINE_PERIODS['5m'];
  const cappedLimit = Math.min(Math.max(Number(limit || 120), 20), 520);
  const key = buildCacheKey(quote, period, cappedLimit);
  const cached = readCache(key, period);
  if (cached) return cached;

  const diagnostics = [];
  for (const provider of providers) {
    const outcome = await runProvider(provider, quote, period, config, cappedLimit);
    diagnostics.push({
      id: outcome.id,
      source: outcome.source,
      tier: outcome.tier,
      ok: outcome.ok,
      skipped: Boolean(outcome.skipped),
      reason: outcome.reason || null,
      latencyMs: outcome.latencyMs,
    });
    if (outcome.ok) {
      const data = {
        source: outcome.source,
        provider: outcome.id,
        providerTier: outcome.tier,
        period,
        points: outcome.points.slice(-cappedLimit),
        diagnostics,
        fallback: false,
        cached: false,
        cacheTtlMs: cacheTtlMs(period),
      };
      writeCache(key, data);
      return data;
    }
  }

  const fallbackPoints = buildFallbackKline(quote, cappedLimit, config.stepMs);
  const data = {
    source: 'local_preview',
    provider: 'local_preview_fallback',
    providerTier: 'fallback',
    period,
    points: fallbackPoints,
    diagnostics,
    fallback: true,
    cached: false,
    cacheTtlMs: cacheTtlMs(period),
  };
  writeCache(key, data);
  return data;
}

function getKlineProviderStatus() {
  return {
    ...getMarketDataPlan(),
    runtime: {
      cacheSize: klineCache.size,
      providers: providers.map(provider => ({
        id: provider.id,
        source: provider.source,
        tier: provider.tier,
        active: true,
      })),
    },
  };
}

module.exports = {
  getKline,
  getKlineProviderStatus,
  buildFallbackKline,
  toYahooSymbol,
  toTencentSymbol,
  aggregateDaily,
};
