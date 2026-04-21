/**
 * Leomoney - 多市场行情数据模块
 * A股/港股/美股(新浪实时) + 贵金属 + 加密(CoinGecko)
 * 支持任意代码查询 + 全市场搜索（东方财富）
 */

const https = require('https');
const http = require('http');
const iconv = require('iconv-lite');

// ===== HTTP GET 封装（GBK/GB18030 解码 + TLS 兼容） =====
function httpGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const options = {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', ...headers },
      timeout: 10000,
      rejectUnauthorized: false,
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
    { symbol: 'BTC', name: '比特币', sector: '加密', currency: 'CNY', unit: 'CNY' },
    { symbol: 'ETH', name: '以太坊', sector: '加密', currency: 'CNY', unit: 'CNY' },
  ],
};

let quotesCache = {};
let lastFetchTime = 0;
const CACHE_TTL = 8000;

// ===== 代码标准化 =====
function normalizeCode(symbol) {
  const s = symbol.trim().toUpperCase();
  // 港股 5 位数字
  if (/^\d{5}$/.test(s)) return { sina: `hk${s}`, pure: s };
  // 美股字母
  if (/^[A-Z]{1,5}$/.test(s)) return { sina: `gb_${s.toLowerCase()}`, pure: s };
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

  try {
    const url = `https://hq.sinajs.cn/list=${sinaCodes.join(',')}`;
    const text = await httpGet(url, {
      'Referer': 'https://finance.sina.com.cn',
    });
    const lines = text.trim().split('\n').filter(l => l.includes('"'));
    const quotes = {};
    lines.forEach(line => {
      const parsed = parseSinaLine(line);
      if (parsed) quotes[parsed.sinaCode] = parsed;
    });
    return quotes;
  } catch (err) {
    console.error('[Quotes] Sina fetch failed:', err.message);
    return {};
  }
}

// ===== 东方财富搜索 API =====
async function searchEastmoney(keyword) {
  if (!keyword || keyword.length < 1) return [];
  try {
    const url = `https://searchapi.eastmoney.com/api/suggest/get?input=${encodeURIComponent(keyword)}&type=14&count=20`;
    const text = await httpGet(url);
    const data = JSON.parse(text);
    const list = data?.QuotationCodeTable?.Data || [];

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
    console.error('[Quotes] Eastmoney search failed:', err.message);
    return [];
  }
}

// ===== 加密货币（国内 API 被墙，降级为新浪BTC/ETH + 模拟） =====
async function fetchCryptoQuotes() {
  const result = {};
  const now = Date.now();

  // 尝试新浪期货接口（hf_BTCUSD, hf_ETHUSD）
  try {
    const raw = await fetchSinaRaw(['hf_BTC', 'hf_ETH']);
    const mapping = { hf_BTC: 'BTC', hf_ETH: 'ETH' };
    const names = { BTC: '比特币', ETH: '以太坊' };
    const basePrices = { BTC: 558000, ETH: 27500 };

    for (const [sina, sym] of Object.entries(mapping)) {
      const q = raw[sina];
      if (q && q.price > 0) {
        const priceCny = q.price * 7.25; // USD → CNY
        const prevClose = quotesCache[sym]?.prevClose || priceCny * 0.99;
        result[sym] = {
          symbol: sym, name: names[sym], price: Math.round(priceCny), prevClose: Math.round(prevClose),
          change: Math.round(priceCny - prevClose), changePercent: prevClose ? ((priceCny - prevClose) / prevClose * 100) : 0,
          volume: q.volume || 0, market: 'CRYPTO', category: 'crypto', currency: 'CNY',
        };
      }
    }
    if (Object.keys(result).length >= 1) return result;
  } catch (err) {
    // 新浪期货也没有，静默降级
  }

  // 降级：基于基准价格微波动
  HOT_ASSETS.crypto.forEach(a => {
    const base = quotesCache[a.symbol]?.price || a.price || (a.symbol === 'BTC' ? 645000 : 31800);
    const seed = now + a.symbol.charCodeAt(0) * 999;
    const fluctuation = Math.sin(seed / 25000) * 0.001; // ±0.1%
    const price = Math.round(base * (1 + fluctuation));
    const prevClose = quotesCache[a.symbol]?.prevClose || base;
    result[a.symbol] = {
      symbol: a.symbol, name: a.name, price, prevClose: Math.round(prevClose),
      change: Math.round(price - prevClose), changePercent: prevClose ? ((price - prevClose) / prevClose * 100) : 0,
      volume: 0, market: 'CRYPTO', category: 'crypto', currency: 'CNY',
    };
  });
  return result;
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

  const [sinaRaw, cryptoRaw, metalRaw] = await Promise.all([
    fetchSinaRaw(sinaCodes),
    fetchCryptoQuotes(),
    fetchMetalQuotes(),
  ]);

  quotesCache = { ...sinaRaw, ...cryptoRaw, ...metalRaw };
  lastFetchTime = now;
  return quotesCache;
}

// ===== 任意个股查询（支持任意代码） =====
async function fetchAnyQuote(symbol) {
  const s = symbol.trim().toUpperCase();

  // 加密
  if (s === 'BTC' || s === 'ETH') {
    const crypto = await fetchCryptoQuotes();
    return crypto[s] || null;
  }
  // 贵金属
  if (s === 'XAU' || s === 'XAG' || s === 'XPT') {
    const metals = await fetchMetalQuotes();
    return metals[s] || null;
  }

  // A股/港股/美股：直接查新浪
  const { sina: sinaCode } = normalizeCode(s);
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
      const q = raw[key] || raw[a.symbol];
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
      };
    });
  }

  return {
    indices: enrich(HOT_ASSETS.indices, 'indices'),
    astocks: enrich(HOT_ASSETS.astocks, 'astocks'),
    hkstocks: enrich(HOT_ASSETS.hkstocks, 'hkstocks'),
    usstocks: enrich(HOT_ASSETS.usstocks, 'usstocks'),
    metals: enrich(HOT_ASSETS.metals, 'metals'),
    crypto: enrich(HOT_ASSETS.crypto, 'crypto'),
    ts: Date.now(),
  };
}

// ===== 搜索（支持任意关键词） =====
async function searchSymbols(keyword) {
  if (!keyword || keyword.length < 1) return [];
  const results = await searchEastmoney(keyword);

  // 补充贵金属和加密
  const kw = keyword.toLowerCase();
  if (kw.includes('比特币') || kw.includes('btc')) {
    results.push({ symbol: 'BTC', name: '比特币', category: 'crypto', currency: 'CNY', market: 'CRYPTO' });
  }
  if (kw.includes('以太坊') || kw.includes('eth')) {
    results.push({ symbol: 'ETH', name: '以太坊', category: 'crypto', currency: 'CNY', market: 'CRYPTO' });
  }
  if (kw.includes('黄金') || kw.includes('gold') || kw.includes('xau')) {
    results.push({ symbol: 'XAU', name: '黄金', category: 'metals', currency: 'USD', market: 'METAL' });
  }

  return results;
}

// ===== 个股查询（支持任意代码） =====
async function getStockQuote(symbol) {
  // 先从缓存里找
  const all = await getQuotes();
  for (const cat of ['astocks', 'hkstocks', 'usstocks', 'metals', 'crypto']) {
    const found = all[cat].find(s => s.symbol === symbol);
    if (found) return { ...found, category: cat };
  }
  // 缓存没有，直接查新浪
  return await fetchAnyQuote(symbol);
}

function getAllSymbols() {
  return HOT_ASSETS;
}

module.exports = {
  HOT_ASSETS, getQuotes, getStockQuote, getAllSymbols, fetchAllQuotes,
  searchSymbols, fetchAnyQuote, normalizeCode,
};
