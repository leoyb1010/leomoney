/**
 * Binance 公开行情（现货 + USDT 永续 + 币本位永续）
 * 无 API Key；用于 LeoMoney 模拟仓实时报价与 K 线
 */

const SPOT_BASE = 'https://api.binance.com';
const FAPI_BASE = 'https://fapi.binance.com';
const DAPI_BASE = 'https://dapi.binance.com';

const CATALOG_TTL_MS = 60 * 60 * 1000;
const TICKER_CACHE_MS = 2000;

const CRYPTO_BASES = new Set([
  'BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'DOGE', 'ADA', 'AVAX', 'DOT', 'LINK',
  'MATIC', 'POL', 'LTC', 'BCH', 'UNI', 'ATOM', 'NEAR', 'APT', 'ARB', 'OP',
  'SUI', 'PEPE', 'WIF', 'SHIB', 'TRX', 'FIL', 'ETC', 'INJ', 'TIA', 'SEI',
]);

let catalog = { at: 0, spot: [], fapi: [], dapi: [] };
let tickerCache = { at: 0, spot: null, fapi: null, dapi: null };
let apiOk = true;
let lastError = null;

async function httpJson(url, timeoutMs = 12000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'LeoMoney/4.0 BinanceQuotes' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

function isCryptoLike(symbol) {
  const s = String(symbol || '').trim().toUpperCase();
  if (!s) return false;
  if (/\.P$|-PERP$|:PERP$/i.test(s)) return true;
  if (/USDT$|USDC$|BUSD$|USD_PERP$/i.test(s)) return true;
  if (CRYPTO_BASES.has(s)) return true;
  return false;
}

/**
 * 解析用户输入 -> { product, symbol, displaySymbol, nameHint }
 * product: spot | usdt_perp | coin_perp
 */
function parseBinanceSymbol(input) {
  let s = String(input || '').trim().toUpperCase();
  if (!s) return null;

  if (/\.P$|-PERP$|:PERP$/i.test(s)) {
    s = s.replace(/\.P$/i, '').replace(/-PERP$/i, '').replace(/:PERP$/i, '');
    const symbol = s.endsWith('USDT') ? s : `${s}USDT`;
    return {
      product: 'usdt_perp',
      symbol,
      displaySymbol: `${symbol}.P`,
      market: 'BINANCE_FUTURES',
    };
  }

  if (s.endsWith('_PERP') || s.includes('USD_PERP')) {
    const symbol = s.replace(/_PERP$/, '');
    return {
      product: 'coin_perp',
      symbol,
      displaySymbol: symbol,
      market: 'BINANCE_COIN_FUTURES',
    };
  }

  if (CRYPTO_BASES.has(s)) {
    const symbol = `${s}USDT`;
    return { product: 'spot', symbol, displaySymbol: symbol, market: 'BINANCE_SPOT' };
  }

  if (/^[A-Z0-9]{2,24}(USDT|USDC|BUSD|BTC|ETH|BNB)$/.test(s)) {
    return { product: 'spot', symbol: s, displaySymbol: s, market: 'BINANCE_SPOT' };
  }

  return null;
}

async function loadCatalog(force = false) {
  const now = Date.now();
  if (!force && catalog.at && now - catalog.at < CATALOG_TTL_MS && catalog.spot.length) {
    return catalog;
  }
  try {
    const [spotInfo, fapiInfo, dapiInfo] = await Promise.all([
      httpJson(`${SPOT_BASE}/api/v3/exchangeInfo`),
      httpJson(`${FAPI_BASE}/fapi/v1/exchangeInfo`),
      httpJson(`${DAPI_BASE}/dapi/v1/exchangeInfo`).catch(() => ({ symbols: [] })),
    ]);
    catalog = {
      at: now,
      spot: (spotInfo.symbols || []).filter(x => x.status === 'TRADING' && x.quoteAsset === 'USDT'),
      fapi: (fapiInfo.symbols || []).filter(x => x.status === 'TRADING' && x.contractType === 'PERPETUAL'),
      dapi: (dapiInfo.symbols || []).filter(x => x.status === 'TRADING'),
    };
    apiOk = true;
    lastError = null;
  } catch (err) {
    apiOk = false;
    lastError = err.message;
    console.error('[Binance] exchangeInfo failed:', err.message);
  }
  return catalog;
}

async function get24hrMaps() {
  const now = Date.now();
  if (tickerCache.at && now - tickerCache.at < TICKER_CACHE_MS && tickerCache.spot) {
    return tickerCache;
  }
  try {
    const [spot, fapi, dapi] = await Promise.all([
      httpJson(`${SPOT_BASE}/api/v3/ticker/24hr`),
      httpJson(`${FAPI_BASE}/fapi/v1/ticker/24hr`),
      httpJson(`${DAPI_BASE}/dapi/v1/ticker/24hr`).catch(() => []),
    ]);
    const spotMap = {};
    for (const t of spot) spotMap[t.symbol] = t;
    const fapiMap = {};
    for (const t of fapi) fapiMap[t.symbol] = t;
    const dapiMap = {};
    for (const t of dapi) dapiMap[t.symbol] = t;
    tickerCache = { at: now, spot: spotMap, fapi: fapiMap, dapi: dapiMap };
    apiOk = true;
    lastError = null;
  } catch (err) {
    apiOk = false;
    lastError = err.message;
    console.error('[Binance] 24hr ticker failed:', err.message);
  }
  return tickerCache;
}

function tickerToQuote(ticker, meta) {
  if (!ticker) return null;
  const price = parseFloat(ticker.lastPrice || ticker.last || 0);
  const prevClose = parseFloat(ticker.prevClosePrice || ticker.openPrice || price) || price;
  const change = parseFloat(ticker.priceChange || (price - prevClose)) || 0;
  const changePercent = parseFloat(ticker.priceChangePercent || 0)
    || (prevClose ? ((price - prevClose) / prevClose * 100) : 0);
  return {
    symbol: meta.displaySymbol,
    binanceSymbol: meta.symbol,
    name: meta.name || meta.displaySymbol,
    price,
    prevClose,
    open: parseFloat(ticker.openPrice || price) || price,
    high: parseFloat(ticker.highPrice || price) || price,
    low: parseFloat(ticker.lowPrice || price) || price,
    volume: parseFloat(ticker.volume || 0) || 0,
    quoteVolume: parseFloat(ticker.quoteVolume || 0) || 0,
    change,
    changePercent,
    market: meta.market,
    category: 'crypto',
    currency: 'USD',
    product: meta.product,
    source: 'binance',
    live: true,
    asOf: new Date().toISOString(),
    dataQuality: { isSynthetic: false, source: 'binance', note: 'Binance 公开行情 API' },
  };
}

async function getQuoteForParsed(parsed) {
  if (!parsed) return null;
  const maps = await get24hrMaps();
  if (!maps.spot) return null;

  if (parsed.product === 'usdt_perp') {
    const t = maps.fapi?.[parsed.symbol];
    const base = parsed.symbol.replace(/USDT$/, '');
    return tickerToQuote(t, {
      ...parsed,
      name: `${base} 永续`,
      displaySymbol: parsed.displaySymbol,
    });
  }
  if (parsed.product === 'coin_perp') {
    const t = maps.dapi?.[parsed.symbol];
    return tickerToQuote(t, { ...parsed, name: parsed.symbol });
  }

  const t = maps.spot[parsed.symbol];
  const base = parsed.symbol.replace(/USDT$/, '');
  return tickerToQuote(t, {
    ...parsed,
    name: base,
    displaySymbol: parsed.symbol,
  });
}

async function getQuote(symbol) {
  const parsed = parseBinanceSymbol(symbol);
  if (!parsed) return null;
  return getQuoteForParsed(parsed);
}

/** 热门 + 高成交量 USDT 现货（最多 limit 条） */
async function getHotSpotQuotes(symbols = [], limit = 48) {
  const maps = await get24hrMaps();
  if (!maps.spot) return {};

  const want = new Set(symbols.map(s => parseBinanceSymbol(s)?.symbol).filter(Boolean));
  const result = {};

  for (const sym of want) {
    const q = tickerToQuote(maps.spot[sym], {
      product: 'spot',
      symbol: sym,
      displaySymbol: sym,
      market: 'BINANCE_SPOT',
      name: sym.replace(/USDT$/, ''),
    });
    if (q?.price > 0) result[sym] = q;
  }

  const all = Object.values(maps.spot)
    .filter(t => t.symbol?.endsWith('USDT'))
    .sort((a, b) => parseFloat(b.quoteVolume || 0) - parseFloat(a.quoteVolume || 0));

  for (const t of all) {
    if (Object.keys(result).length >= limit) break;
    if (result[t.symbol]) continue;
    const q = tickerToQuote(t, {
      product: 'spot',
      symbol: t.symbol,
      displaySymbol: t.symbol,
      market: 'BINANCE_SPOT',
      name: t.symbol.replace(/USDT$/, ''),
    });
    if (q?.price > 0) result[t.symbol] = q;
  }

  return result;
}

/** 高成交量 USDT 永续（最多 limit 条） */
async function getHotFapiQuotes(limit = 80) {
  const maps = await get24hrMaps();
  if (!maps.fapi) return {};

  const result = {};
  const all = Object.values(maps.fapi)
    .filter(t => t.symbol?.endsWith('USDT'))
    .sort((a, b) => parseFloat(b.quoteVolume || 0) - parseFloat(a.quoteVolume || 0));

  for (const t of all) {
    if (Object.keys(result).length >= limit) break;
    const sym = t.symbol;
    const base = sym.replace(/USDT$/, '');
    const displaySymbol = `${sym}.P`;
    const q = tickerToQuote(t, {
      product: 'usdt_perp',
      symbol: sym,
      displaySymbol,
      market: 'BINANCE_FUTURES',
      name: `${base} 永续`,
    });
    if (q?.price > 0) result[displaySymbol] = q;
  }

  return result;
}

async function searchSymbols(keyword, limit = 30) {
  const kw = String(keyword || '').trim().toUpperCase();
  if (!kw) return [];
  await loadCatalog();
  const maps = await get24hrMaps();
  const out = [];
  const seen = new Set();

  function push(item) {
    const key = `${item.product}:${item.symbol}`;
    if (seen.has(key) || out.length >= limit) return;
    seen.add(key);
    out.push(item);
  }

  for (const row of catalog.spot) {
    const sym = row.symbol;
    const base = row.baseAsset;
    if (!sym.includes(kw) && !base.includes(kw)) continue;
    const price = parseFloat(maps.spot?.[sym]?.lastPrice || 0);
    push({
      symbol: sym,
      name: `${base} 现货`,
      category: 'crypto',
      currency: 'USD',
      market: 'BINANCE_SPOT',
      product: 'spot',
      price,
      source: 'binance',
    });
  }

  for (const row of catalog.fapi) {
    const sym = row.symbol;
    const base = row.baseAsset;
    if (!sym.includes(kw) && !base.includes(kw)) continue;
    const price = parseFloat(maps.fapi?.[sym]?.lastPrice || 0);
    push({
      symbol: `${sym}.P`,
      name: `${base} USDT永续`,
      category: 'crypto',
      currency: 'USD',
      market: 'BINANCE_FUTURES',
      product: 'usdt_perp',
      price,
      source: 'binance',
    });
  }

  return out;
}

const INTERVAL_MAP = {
  1: '1m', 5: '5m', 15: '15m', 30: '30m', 60: '1h',
  '1m': '1m', '5m': '5m', '15m': '15m', '30m': '30m', '1h': '1h',
  '1d': '1d', '1D': '1d', '1w': '1w', '1W': '1w', '1M': '1M',
};

async function getKlines(symbol, scale = 5, limit = 80) {
  const parsed = parseBinanceSymbol(symbol);
  if (!parsed) return null;
  const interval = INTERVAL_MAP[scale] || '5m';
  const capped = Math.min(Math.max(limit, 20), 500);

  let base;
  if (parsed.product === 'usdt_perp') {
    base = `${FAPI_BASE}/fapi/v1/klines?symbol=${parsed.symbol}&interval=${interval}&limit=${capped}`;
  } else if (parsed.product === 'coin_perp') {
    base = `${DAPI_BASE}/dapi/v1/klines?symbol=${parsed.symbol}&interval=${interval}&limit=${capped}`;
  } else {
    base = `${SPOT_BASE}/api/v3/klines?symbol=${parsed.symbol}&interval=${interval}&limit=${capped}`;
  }

  const rows = await httpJson(base);
  if (!Array.isArray(rows)) return null;

  return rows.map(row => ({
    time: new Date(row[0]).toISOString(),
    label: new Date(row[0]).toTimeString().slice(0, 5),
    open: parseFloat(row[1]),
    high: parseFloat(row[2]),
    low: parseFloat(row[3]),
    close: parseFloat(row[4]),
    volume: parseFloat(row[5]),
  })).filter(p => Number.isFinite(p.close) && p.close > 0);
}

function getHealth() {
  return {
    ok: apiOk,
    lastError,
    catalogSpot: catalog.spot?.length || 0,
    catalogFapi: catalog.fapi?.length || 0,
    catalogDapi: catalog.dapi?.length || 0,
    lastCatalogAt: catalog.at || null,
    lastTickerAt: tickerCache.at || null,
  };
}

module.exports = {
  CRYPTO_BASES,
  isCryptoLike,
  parseBinanceSymbol,
  loadCatalog,
  getQuote,
  getHotSpotQuotes,
  getHotFapiQuotes,
  searchSymbols,
  getKlines,
  getHealth,
};
