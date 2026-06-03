/**
 * Leomoney - 多市场行情数据模块
 * 美股：Yahoo Finance 实时 + 新浪备用
 * 加密：Binance 现货 / USDT永续 / 币本位（公开 API，实时）
 * A股/港股/指数：新浪；搜索：Binance 目录 + 东方财富
 */

const https = require('https');
const http = require('http');
const iconv = require('iconv-lite');
const binance = require('./binance');
const yahooUs = require('./yahooUs');

// ===== HTTP GET 封装（GBK/GB18030 解码 + TLS 兼容） =====
function httpGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const options = {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', ...headers },
      timeout: 10000,
    };
    mod.get(url, options, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        const contentType = (res.headers['content-type'] || '').toLowerCase();
        // 新浪行情返回 GB18030/GBK，需要转码
        if (url.includes('sinajs.cn') || contentType.includes('gb') || contentType.includes('18030')) {
          resolve(iconv.decode(buf, 'gb18030'));
        } else {
          resolve(buf.toString('utf-8'));
        }
      });
    }).on('error', reject)
      .on('timeout', function() { this.destroy(); reject(new Error('timeout')); });
  });
}

// ===== 热门推荐（首页展示用） =====
const HOT_ASSETS = {
  indices: [
    { id: 'sh', name: '上证指数', code: '000001', sinaCode: 'sh000001', market: 'A', color: '#3b82f6' },
    { id: 'sz', name: '深证成指', code: '399001', sinaCode: 'sz399001', market: 'A', color: '#8b5cf6' },
    { id: 'cyb', name: '创业板指', code: '399006', sinaCode: 'sz399006', market: 'A', color: '#f59e0b' },
    { id: 'kc50', name: '科创50', code: '000688', sinaCode: 'sh000688', market: 'A', color: '#10b981' },
    { id: 'hsi', name: '恒生指数', code: 'HSI', sinaCode: 'hkHSI', market: 'HK', color: '#ef4444' },
  ],
  astocks: [
    { symbol: '600519', name: '贵州茅台', sinaCode: 'sh600519', sector: '白酒' },
    { symbol: '000858', name: '五粮液', sinaCode: 'sz000858', sector: '白酒' },
    { symbol: '601318', name: '中国平安', sinaCode: 'sh601318', sector: '保险' },
    { symbol: '000001', name: '平安银行', sinaCode: 'sz000001', sector: '银行' },
    { symbol: '600036', name: '招商银行', sinaCode: 'sh600036', sector: '银行' },
    { symbol: '000333', name: '美的集团', sinaCode: 'sz000333', sector: '家电' },
    { symbol: '601012', name: '隆基绿能', sinaCode: 'sh601012', sector: '光伏' },
    { symbol: '300750', name: '宁德时代', sinaCode: 'sz300750', sector: '新能源' },
    { symbol: '688981', name: '中芯国际', sinaCode: 'sh688981', sector: '半导体' },
    { symbol: '002415', name: '海康威视', sinaCode: 'sz002415', sector: '安防' },
    { symbol: '600809', name: '山西汾酒', sinaCode: 'sh600809', sector: '白酒' },
    { symbol: '601888', name: '中国中免', sinaCode: 'sh601888', sector: '零售' },
    { symbol: '300059', name: '东方财富', sinaCode: 'sz300059', sector: '券商' },
    { symbol: '600276', name: '恒瑞医药', sinaCode: 'sh600276', sector: '医药' },
    { symbol: '002594', name: '比亚迪', sinaCode: 'sz002594', sector: '汽车' },
  ],
  hkstocks: [
    { symbol: '00700', name: '腾讯控股', sinaCode: 'hk00700', sector: '互联网' },
    { symbol: '09988', name: '阿里巴巴-SW', sinaCode: 'hk09988', sector: '互联网' },
    { symbol: '03690', name: '美团-W', sinaCode: 'hk03690', sector: '本地生活' },
    { symbol: '01898', name: '中芯国际', sinaCode: 'hk01898', sector: '半导体' },
    { symbol: '01299', name: '友邦保险', sinaCode: 'hk01299', sector: '保险' },
    { symbol: '00939', name: '建设银行', sinaCode: 'hk00939', sector: '银行' },
  ],
  usstocks: [
    { symbol: 'AAPL', name: 'Apple', sinaCode: 'gb_aapl', sector: '科技', currency: 'USD' },
    { symbol: 'TSLA', name: 'Tesla', sinaCode: 'gb_tsla', sector: '汽车', currency: 'USD' },
    { symbol: 'NVDA', name: 'NVIDIA', sinaCode: 'gb_nvda', sector: '半导体', currency: 'USD' },
    { symbol: 'MSFT', name: 'Microsoft', sinaCode: 'gb_msft', sector: '科技', currency: 'USD' },
    { symbol: 'GOOGL', name: 'Alphabet', sinaCode: 'gb_googl', sector: '互联网', currency: 'USD' },
    { symbol: 'AMZN', name: 'Amazon', sinaCode: 'gb_amzn', sector: '电商', currency: 'USD' },
    { symbol: 'META', name: 'Meta', sinaCode: 'gb_meta', sector: '互联网', currency: 'USD' },
    { symbol: 'AMD', name: 'AMD', sinaCode: 'gb_amd', sector: '半导体', currency: 'USD' },
  ],
  metals: [
    { symbol: 'XAU', name: '黄金', sector: '贵金属', price: 3320, currency: 'USD', unit: '美元/盎司' },
    { symbol: 'XAG', name: '白银', sector: '贵金属', price: 33.50, currency: 'USD', unit: '美元/盎司' },
    { symbol: 'XPT', name: '铂金', sector: '贵金属', price: 980, currency: 'USD', unit: '美元/盎司' },
  ],
  crypto: [
    { symbol: 'BTCUSDT', name: 'BTC 现货', sector: '加密', currency: 'USD', product: 'spot' },
    { symbol: 'ETHUSDT', name: 'ETH 现货', sector: '加密', currency: 'USD', product: 'spot' },
    { symbol: 'BNBUSDT', name: 'BNB 现货', sector: '加密', currency: 'USD', product: 'spot' },
    { symbol: 'SOLUSDT', name: 'SOL 现货', sector: '加密', currency: 'USD', product: 'spot' },
    { symbol: 'BTCUSDT.P', name: 'BTC USDT永续', sector: '加密', currency: 'USD', product: 'usdt_perp' },
    { symbol: 'ETHUSDT.P', name: 'ETH USDT永续', sector: '加密', currency: 'USD', product: 'usdt_perp' },
  ],
};

let quotesCache = {};
let lastFetchTime = 0;
const CACHE_TTL = 2000;

// ── API 健康状态追踪 v3 ──
const apiHealth = {
  sina: { ok: true, failCount: 0, lastFail: null, lastSuccess: null, totalRequests: 0, totalFailures: 0, avgLatency: 0 },
  eastmoney: { ok: true, failCount: 0, lastFail: null, lastSuccess: null, totalRequests: 0, totalFailures: 0, avgLatency: 0 },
  yahoo: { ok: true, failCount: 0, lastFail: null, lastSuccess: null, totalRequests: 0, totalFailures: 0, avgLatency: 0 },
  coingecko: { ok: true, failCount: 0, lastFail: null, lastSuccess: null, totalRequests: 0, totalFailures: 0, avgLatency: 0 },
};

const API_CONFIG = {
  failThreshold: 3,           // 连续失败 N 次标记不可用
  recoveryMinutes: 5,         // N 分钟后自动恢复尝试
  latencyThreshold: 8000,     // 超过 N ms 视为慢请求
  healthCheckInterval: 60000, // 健康检查间隔
};

function recordApiFail(source, latency = 0) {
  if (!apiHealth[source]) return;
  apiHealth[source].failCount++;
  apiHealth[source].totalFailures++;
  apiHealth[source].totalRequests++;
  apiHealth[source].lastFail = Date.now();
  if (latency > 0) _updateLatency(source, latency);
  if (apiHealth[source].failCount >= API_CONFIG.failThreshold) {
    apiHealth[source].ok = false;
    console.warn(`[Quotes] ${source} API 已标记为不可用（连续失败 ${apiHealth[source].failCount} 次）`);
  }
}

function recordApiSuccess(source, latency = 0) {
  if (!apiHealth[source]) return;
  apiHealth[source].failCount = 0;
  apiHealth[source].ok = true;
  apiHealth[source].totalRequests++;
  apiHealth[source].lastSuccess = Date.now();
  if (latency > 0) _updateLatency(source, latency);
}

function _updateLatency(source, latency) {
  const h = apiHealth[source];
  if (!h) return;
  h.avgLatency = h.avgLatency === 0 ? latency : (h.avgLatency * 0.8 + latency * 0.2);
}

// 定时自动恢复尝试
const healthRecoveryTimer = setInterval(() => {
  for (const source of Object.keys(apiHealth)) {
    if (!apiHealth[source].ok && apiHealth[source].lastFail && Date.now() - apiHealth[source].lastFail > API_CONFIG.recoveryMinutes * 60 * 1000) {
      apiHealth[source].ok = true;
      apiHealth[source].failCount = 0;
      console.log(`[Quotes] ${source} API 自动恢复尝试`);
    }
  }
}, API_CONFIG.healthCheckInterval);
healthRecoveryTimer.unref?.();

function getApiHealth() {
  const result = {};
  for (const [source, health] of Object.entries(apiHealth)) {
    result[source] = { ...health };
    // 计算可用率
    if (health.totalRequests > 0) {
      result[source].successRate = ((health.totalRequests - health.totalFailures) / health.totalRequests * 100).toFixed(1) + '%';
    } else {
      result[source].successRate = 'N/A';
    }
    // 状态描述
    result[source].status = health.ok ? 'healthy' : 'degraded';
    if (health.avgLatency > API_CONFIG.latencyThreshold) {
      result[source].status = 'slow';
    }
  }
  return result;
}

// ===== 代码标准化 =====
function normalizeCode(symbol) {
  const s = symbol.trim().toUpperCase();
  if (binance.isCryptoLike(s)) {
    const parsed = binance.parseBinanceSymbol(s);
    return { sina: null, pure: parsed?.displaySymbol || s, crypto: parsed };
  }
  // 港股 5 位数字
  if (/^\d{5}$/.test(s)) return { sina: `hk${s}`, pure: s };
  // 美股字母（含 BRK.B 等）
  if (yahooUs.isUsTicker(s)) return { sina: `gb_${s.toLowerCase()}`, pure: s };
  // 北交所
  if (/^[84]\d{5}$/.test(s)) return { sina: `bj${s}`, pure: s };
  // 沪市 6 开头
  if (s.startsWith('6')) return { sina: `sh${s}`, pure: s };
  // 深市 0/3 开头
  if (s.startsWith('0') || s.startsWith('3')) return { sina: `sz${s}`, pure: s };
  return { sina: s, pure: s };
}

function detectMarket(sinaCode) {
  if (sinaCode.startsWith('hk')) return 'HK';
  if (sinaCode.startsWith('gb_')) return 'US';
  if (sinaCode.startsWith('sh')) return 'A';
  if (sinaCode.startsWith('sz')) return 'A';
  if (sinaCode.startsWith('bj')) return 'A';
  return 'A';
}

// ===== SINA PARSER =====
function parseSinaLine(text) {
  const parts = text.split('="');
  if (parts.length < 2) return null;
  // 提取新浪代码: var hq_str_sh600519 -> sh600519, var hq_str_gb_aapl -> gb_aapl
  const match = parts[0].match(/hq_str_(\w+)$/);
  const sinaCode = match ? match[1] : parts[0].split('_').pop();
  const isUS = sinaCode.startsWith('gb_');
  const data = parts[1].replace('";', '').split(',');
  if (data.length < 6) return null;

  const market = detectMarket(sinaCode);

  // 美股格式: name,price,change,time,changePercent,prevClose,open,high,low,yearHigh,yearLow,volume,...
  if (isUS) {
    const name = data[0];
    const price = parseFloat(data[1]) || 0;
    const change = parseFloat(data[2]) || 0;
    const changePercent = parseFloat(data[4]) || 0;
    const prevClose = parseFloat(data[5]) || price;
    const open = parseFloat(data[6]) || price;
    const high = parseFloat(data[7]) || price;
    const low = parseFloat(data[8]) || price;
    const yearHigh = parseFloat(data[9]) || 0;
    const yearLow = parseFloat(data[10]) || 0;
    const volume = parseInt(data[11]) || 0;

    return {
      sinaCode,
      symbol: sinaCode.replace(/^gb_/, '').toUpperCase(),
      name, price,
      prevClose, open, high, low, volume,
      change, changePercent,
      market: 'US',
      category: 'usstocks',
      currency: 'USD',
      yearHigh, yearLow,
    };
  }

  // A股/港股格式: name,open,prevClose,current,high,low,...
  if (data.length < 10) return null;
  const name = data[0];
  const open = parseFloat(data[1]);
  const prevClose = parseFloat(data[2]);
  const current = parseFloat(data[3]);
  const high = parseFloat(data[4]);
  const low = parseFloat(data[5]);
  const volume = parseInt(data[8]) || 0;
  const price = current || open || prevClose || 0;

  return {
    sinaCode,
    symbol: sinaCode.replace(/^(sh|sz|hk|bj)/, ''),
    name, price,
    prevClose: prevClose || open || price,
    open: open || price,
    high: high || price,
    low: low || price,
    volume,
    change: price - (prevClose || price),
    changePercent: prevClose ? ((price - prevClose) / prevClose * 100) : 0,
    market,
    category: market === 'A' ? 'astocks' : market === 'HK' ? 'hkstocks' : 'usstocks',
    currency: market === 'US' ? 'USD' : market === 'HK' ? 'HKD' : 'CNY',
  };
}

// ===== FETCH SINA (任意代码，用 https 模块) =====
async function fetchSinaRaw(sinaCodes) {
  if (!Array.isArray(sinaCodes)) sinaCodes = [sinaCodes];
  sinaCodes = sinaCodes.filter(Boolean);
  if (sinaCodes.length === 0) return {};

  // 如果新浪 API 标记不可用，直接跳过（走降级）
  if (!apiHealth.sina.ok) {
    console.warn('[Quotes] Sina API 已降级，跳过请求');
    return {};
  }

  const startTime = Date.now();
  try {
    const url = `https://hq.sinajs.cn/list=${sinaCodes.join(',')}`;
    const text = await httpGet(url, {
      'Referer': 'https://finance.sina.com.cn',
    });
    const latency = Date.now() - startTime;
    const lines = text.trim().split('\n').filter(l => l.includes('"'));
    const quotes = {};
    recordApiSuccess('sina', latency);
    lines.forEach(line => {
      const parsed = parseSinaLine(line);
      if (parsed) quotes[parsed.sinaCode] = parsed;
    });
    return quotes;
  } catch (err) {
    const latency = Date.now() - startTime;
    console.error('[Quotes] Sina fetch failed:', err.message);
    recordApiFail('sina', latency);
    return {};
  }
}

// ===== 东方财富搜索 API =====
async function searchEastmoney(keyword) {
  if (!keyword || keyword.length < 1) return [];

  // 如果东方财富 API 标记不可用，跳过
  if (!apiHealth.eastmoney.ok) {
    console.warn('[Quotes] Eastmoney API 已降级，跳过搜索');
    return [];
  }

  const startTime = Date.now();
  try {
    const url = `https://searchapi.eastmoney.com/api/suggest/get?input=${encodeURIComponent(keyword)}&type=14&count=20`;
    const text = await httpGet(url);
    const latency = Date.now() - startTime;
    const data = JSON.parse(text);
    const list = data?.QuotationCodeTable?.Data || [];
    recordApiSuccess('eastmoney', latency);

    return list.map(item => {
      const code = item.Code;
      const mkt = item.Market || '';
      let sinaCode, category, currency;

      if (mkt === 'US') {
        sinaCode = `gb_${code.toLowerCase()}`;
        category = 'usstocks'; currency = 'USD';
      } else if (mkt === 'HK') {
        sinaCode = `hk${code}`;
        category = 'hkstocks'; currency = 'HKD';
      } else {
        if (code.startsWith('6')) sinaCode = `sh${code}`;
        else if (code.startsWith('0') || code.startsWith('3')) sinaCode = `sz${code}`;
        else if (code.startsWith('8') || code.startsWith('4')) sinaCode = `bj${code}`;
        else sinaCode = `sh${code}`;
        category = 'astocks'; currency = 'CNY';
      }

      return {
        symbol: code,
        name: item.Name,
        sinaCode,
        category,
        market: mkt,
        currency,
        sector: item.SecurityTypeName || '',
      };
    });
  } catch (err) {
    const latency = Date.now() - startTime;
    console.error('[Quotes] Eastmoney search failed:', err.message);
    recordApiFail('eastmoney', latency);
    return [];
  }
}

// ===== 加密货币（Binance 实时，禁止模拟报价） =====
async function fetchCryptoQuotes() {
  const hotSymbols = HOT_ASSETS.crypto.map(a => a.symbol);
  const [spotMap, perpMap] = await Promise.all([
    binance.getHotSpotQuotes(hotSymbols, 180),
    binance.getHotFapiQuotes(120),
  ]);
  const result = { ...spotMap, ...perpMap };
  for (const a of HOT_ASSETS.crypto) {
    if (result[a.symbol]?.price > 0) continue;
    const live = await binance.getQuote(a.symbol);
    if (live?.price > 0) result[a.symbol] = { ...live, symbol: a.symbol, name: a.name || live.name };
  }
  if (Object.values(result).filter(q => q?.price > 0 && q.product === 'spot').length < 2) {
    const fallback = await fetchCoinGeckoQuotes();
    Object.assign(result, fallback);
  }
  return result;
}

async function fetchCoinGeckoQuotes() {
  const startTime = Date.now();
  const ids = [
    ['BTCUSDT', 'bitcoin', 'BTC'],
    ['ETHUSDT', 'ethereum', 'ETH'],
    ['BNBUSDT', 'binancecoin', 'BNB'],
    ['SOLUSDT', 'solana', 'SOL'],
  ];
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    timer.unref?.();
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids.map(([, id]) => id).join(',')}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true`;
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'LeoMoney/4.0 CoinGeckoFallback' },
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);
    const json = await res.json();
    const result = {};
    for (const [symbol, id, name] of ids) {
      const row = json[id];
      if (!row?.usd) continue;
      const price = Number(row.usd);
      const changePercent = Number(row.usd_24h_change || 0);
      const prevClose = changePercent ? price / (1 + changePercent / 100) : price;
      result[symbol] = {
        symbol,
        binanceSymbol: symbol,
        name,
        price,
        prevClose,
        open: prevClose,
        high: Math.max(price, prevClose),
        low: Math.min(price, prevClose),
        volume: Number(row.usd_24h_vol || 0),
        quoteVolume: Number(row.usd_24h_vol || 0),
        change: price - prevClose,
        changePercent,
        market: 'COINGECKO',
        category: 'crypto',
        currency: 'USD',
        product: 'spot',
        source: 'coingecko',
        live: true,
        asOf: new Date().toISOString(),
        dataQuality: { isSynthetic: false, source: 'coingecko', note: 'CoinGecko 免费公开行情兜底' },
      };
    }
    recordApiSuccess('coingecko', Date.now() - startTime);
    return result;
  } catch (err) {
    recordApiFail('coingecko', Date.now() - startTime);
    console.error('[Quotes] CoinGecko fallback failed:', err.message);
    return {};
  }
}

// ===== 贵金属（新浪有期货行情，优先用；失败则模拟） =====
async function fetchMetalQuotes() {
  try {
    // 新浪期货接口：黄金AU0、白银AG0
    const sinaCodes = ['hf_AU', 'hf_AG', 'hf_PT'];
    const raw = await fetchSinaRaw(sinaCodes);
    const result = {};
    const mapping = { hf_AU: 'XAU', hf_AG: 'XAG', hf_PT: 'XPT' };
    const names = { XAU: '黄金', XAG: '白银', XPT: '铂金' };

    for (const [sina, sym] of Object.entries(mapping)) {
      const q = raw[sina];
      if (q) {
        result[sym] = {
          symbol: sym, name: names[sym], price: q.price, prevClose: q.prevClose,
          open: q.open, high: q.high, low: q.low, volume: q.volume,
          change: q.change, changePercent: q.changePercent,
          market: 'METAL', category: 'metals', currency: 'USD', unit: '美元/盎司',
          dataQuality: { isSynthetic: false, source: 'sina_futures', note: '贵金属行情来自新浪期货实时数据' },
        };
      }
    }
    // 如果新浪有数据就返回
    if (Object.keys(result).length >= 2) return result;
  } catch (err) {
    console.error('[Quotes] Metal fetch failed:', err.message);
  }

  // 降级：微小波动模拟
  const now = Date.now();
  const fallback = {};
  HOT_ASSETS.metals.forEach(a => {
    const seed = now + a.symbol.charCodeAt(0) * 1000;
    const fluctuation = Math.sin(seed / 30000) * 0.002;
    const price = a.price * (1 + fluctuation);
    fallback[a.symbol] = {
      symbol: a.symbol, name: a.name, price: parseFloat(price.toFixed(2)),
      prevClose: a.price, open: a.price, high: a.price * 1.005, low: a.price * 0.995,
      volume: 0, change: parseFloat((price - a.price).toFixed(2)), changePercent: parseFloat((fluctuation * 100).toFixed(3)),
      market: 'METAL', category: 'metals', currency: 'USD', unit: a.unit,
      dataQuality: { isSynthetic: true, source: 'local_fallback_simulated', note: '贵金属行情为本地模拟数据，仅供演示研究' },
    };
  });
  return fallback;
}

// ===== FETCH ALL（热门列表） =====
async function fetchAllQuotes() {
  const now = Date.now();
  if (now - lastFetchTime < CACHE_TTL && Object.keys(quotesCache).length > 0) {
    return quotesCache;
  }

  const sinaCodes = [
    ...HOT_ASSETS.indices.map(i => i.sinaCode),
    ...HOT_ASSETS.astocks.map(s => s.sinaCode),
    ...HOT_ASSETS.hkstocks.map(s => s.sinaCode),
    ...HOT_ASSETS.usstocks.map(s => s.sinaCode),
  ].filter(Boolean);

  const yahooStart = Date.now();
  const [sinaRaw, cryptoRaw, metalRaw, yahooUsMap] = await Promise.all([
    fetchSinaRaw(sinaCodes),
    fetchCryptoQuotes(),
    fetchMetalQuotes(),
    yahooUs.getQuotes(HOT_ASSETS.usstocks.map(u => u.symbol)),
  ]);
  if (Object.keys(yahooUsMap || {}).length > 0) recordApiSuccess('yahoo', Date.now() - yahooStart);
  else recordApiFail('yahoo', Date.now() - yahooStart);

  for (const u of HOT_ASSETS.usstocks) {
    const yq = yahooUsMap[u.symbol];
    if (yq?.price > 0) {
      sinaRaw[u.sinaCode] = {
        ...yq,
        sinaCode: u.sinaCode,
        symbol: u.symbol,
        asOf: new Date().toISOString(),
        dataQuality: { isSynthetic: false, source: 'yahoo_chart', note: 'Yahoo Finance 公开 Chart API' },
      };
    }
  }

  quotesCache = { ...sinaRaw, ...cryptoRaw, ...metalRaw };
  lastFetchTime = now;
  return quotesCache;
}

// ===== 任意个股查询（支持任意代码） =====
async function fetchAnyQuote(symbol) {
  const s = symbol.trim().toUpperCase();

  if (binance.isCryptoLike(s)) {
    const q = await binance.getQuote(s);
    if (q?.price > 0) return q;
    return null;
  }

  if (yahooUs.isUsTicker(s)) {
    const yq = await yahooUs.getQuote(s);
    if (yq?.price > 0) return yq;
  }
  // 贵金属
  if (s === 'XAU' || s === 'XAG' || s === 'XPT') {
    const metals = await fetchMetalQuotes();
    return metals[s] || null;
  }

  const { sina: sinaCode } = normalizeCode(s);
  if (!sinaCode) return null;
  const raw = await fetchSinaRaw([sinaCode]);
  const q = raw[sinaCode];
  if (!q || !q.price || q.price === 0) return null;

  return { ...q };
}

// ===== FORMATTED OUTPUT（热门列表） =====
async function getQuotes() {
  const raw = await fetchAllQuotes();

  function enrich(assets, catKey) {
    return assets.map(a => {
      const key = a.sinaCode || a.symbol;
      const q = raw[key] || raw[a.symbol] || (catKey === 'crypto' ? Object.values(raw).find(x => x?.symbol === a.symbol) : null);
      return {
        ...a,
        symbol: a.symbol, name: a.name,
        price: q?.price ?? a.price ?? 0,
        prevClose: q?.prevClose ?? a.prevClose ?? 0,
        open: q?.open ?? a.prevClose ?? 0,
        high: q?.high ?? a.price ?? 0,
        low: q?.low ?? a.price ?? 0,
        change: q?.change ?? 0,
        changePercent: q?.changePercent ?? 0,
        volume: q?.volume ?? 0,
        market: q?.market ?? (catKey === 'astocks' ? 'A' : catKey === 'hkstocks' ? 'HK' : catKey === 'usstocks' ? 'US' : ''),
        category: catKey,
        currency: q?.currency ?? a.currency ?? 'CNY',
        asOf: q?.asOf || new Date().toISOString(),
        dataQuality: q?.dataQuality || { isSynthetic: false, source: q?.source || (catKey === 'crypto' ? 'binance' : 'sina'), note: '公开行情源' },
      };
    });
  }

  return {
    indices: enrich(HOT_ASSETS.indices, 'indices'),
    astocks: enrich(HOT_ASSETS.astocks, 'astocks'),
    hkstocks: enrich(HOT_ASSETS.hkstocks, 'hkstocks'),
    usstocks: enrich(HOT_ASSETS.usstocks, 'usstocks'),
    metals: enrich(HOT_ASSETS.metals, 'metals'),
    crypto: enrichCryptoList(raw),
    ts: Date.now(),
  };
}

function enrichCryptoList(raw) {
  const seen = new Set();
  const list = [];
  for (const q of Object.values(raw)) {
    if (!q || !(q.category === 'crypto' || q.source === 'binance' || binance.isCryptoLike(q.symbol))) continue;
    const sym = q.symbol || q.binanceSymbol;
    if (!sym || seen.has(sym) || !(Number(q.price) > 0)) continue;
    seen.add(sym);
    list.push({
      symbol: sym,
      name: q.name || sym,
      price: q.price,
      prevClose: q.prevClose ?? 0,
      open: q.open ?? q.prevClose ?? 0,
      high: q.high ?? q.price,
      low: q.low ?? q.price,
      change: q.change ?? 0,
      changePercent: q.changePercent ?? 0,
      volume: q.volume ?? 0,
      quoteVolume: q.quoteVolume ?? 0,
      market: q.market || 'BINANCE',
      category: 'crypto',
      currency: q.currency || 'USD',
      product: q.product || 'spot',
      source: q.source || 'binance',
      asOf: q.asOf || new Date().toISOString(),
      dataQuality: q.dataQuality || { isSynthetic: false, source: q.source || 'binance', note: 'Binance 公开行情 API' },
    });
  }
  return list.sort((a, b) => (b.quoteVolume || b.volume || 0) - (a.quoteVolume || a.volume || 0));
}

// ===== 搜索（支持任意关键词） =====
async function searchSymbols(keyword) {
  if (!keyword || keyword.length < 1) return [];
  const kw = keyword.toLowerCase();
  const [eastResults, binanceResults] = await Promise.all([
    searchEastmoney(keyword),
    binance.searchSymbols(keyword, 25).catch(() => []),
  ]);
  const results = [...binanceResults, ...eastResults];

  if (kw.includes('比特币') || kw === 'btc') {
    results.unshift({ symbol: 'BTCUSDT', name: 'BTC 现货', category: 'crypto', currency: 'USD', market: 'BINANCE_SPOT', product: 'spot' });
    results.unshift({ symbol: 'BTCUSDT.P', name: 'BTC USDT永续', category: 'crypto', currency: 'USD', market: 'BINANCE_FUTURES', product: 'usdt_perp' });
  }
  if (kw.includes('以太坊') || kw === 'eth') {
    results.unshift({ symbol: 'ETHUSDT', name: 'ETH 现货', category: 'crypto', currency: 'USD', market: 'BINANCE_SPOT', product: 'spot' });
  }
  if (kw.includes('黄金') || kw.includes('gold') || kw.includes('xau')) {
    results.push({ symbol: 'XAU', name: '黄金', category: 'metals', currency: 'USD', market: 'METAL' });
  }

  return results;
}

// ===== 个股查询（支持任意代码） =====
async function getStockQuote(symbol) {
  // 归一化: 去掉 .SS/.HK/.US 等后缀，便于缓存精确匹配
  const normalized = symbol.replace(/\.(SS|HK|US)$/, '');
  const all = await getQuotes();
  for (const cat of ['astocks', 'hkstocks', 'usstocks', 'metals', 'crypto']) {
    const found = all[cat].find(s => s.symbol === normalized || s.symbol === symbol);
    if (found) return { ...found, category: cat };
  }
  const live = await fetchAnyQuote(symbol);
  if (live) return { ...live, category: live.category || 'usstocks' };
  return null;
}

function getBinanceHealth() {
  return binance.getHealth();
}

function getAllSymbols() {
  return HOT_ASSETS;
}

module.exports = {
  HOT_ASSETS, getQuotes, getStockQuote, getAllSymbols, fetchAllQuotes,
  searchSymbols, fetchAnyQuote, normalizeCode, getApiHealth, getBinanceHealth,
};
