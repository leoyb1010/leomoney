/**
 * 免费实时情报源（无需 API Key）
 * - Google News RSS（美股/宏观/加密）
 * - 东方财富搜索（A 股名称，尽力而为）
 */
const https = require('https');
const http = require('http');
const { searchWeb } = require('./agent/eyes');

function httpGet(url, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const transport = parsed.protocol === 'https:' ? https : http;
    const req = transport.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 LeoMoney/3.2',
        Accept: 'application/rss+xml, application/xml, text/xml, */*',
      },
      timeout: timeoutMs,
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        httpGet(res.headers.location, timeoutMs).then(resolve).catch(reject);
        return;
      }
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        if (res.statusCode >= 400) reject(new Error(`HTTP ${res.statusCode}`));
        else resolve(data);
      });
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
  });
}

function decodeXml(text) {
  return String(text || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function parseRss(xml, limit = 10) {
  if (!xml || typeof xml !== 'string') return [];
  const items = [];
  const re = /<item>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = re.exec(xml)) && items.length < limit) {
    const block = m[1];
    const title = decodeXml((block.match(/<title>([\s\S]*?)<\/title>/i) || [])[1]);
    const link = decodeXml((block.match(/<link>([\s\S]*?)<\/link>/i) || [])[1]);
    const pubDate = decodeXml((block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i) || [])[1]);
    if (!title || title === 'Google News') continue;
    items.push({
      title,
      url: link || '',
      time: pubDate || '',
      source: 'Google News',
    });
  }
  return items;
}

function buildNewsQuery({ query, symbol, category }) {
  const q = String(query || '').trim();
  const sym = String(symbol || '').trim().toUpperCase();

  if (sym.includes('USDT') || sym.endsWith('.P')) {
    const base = sym.replace(/\.P$/i, '').replace(/USDT$/i, '') || 'BTC';
    return { searchQ: `${base} bitcoin cryptocurrency`, zhQ: `${base === 'BTC' ? '比特币' : base} 加密货币` };
  }
  if (/^[A-Z]{1,5}$/.test(sym) && !['BTC', 'ETH', 'SOL', 'BNB'].includes(sym)) {
    return { searchQ: `${sym} stock`, zhQ: `${sym} 美股` };
  }
  if (/^\d{5,6}$/.test(sym)) {
    return { searchQ: q || sym, zhQ: q || sym };
  }
  return { searchQ: q || sym || 'markets', zhQ: q || sym || '金融市场' };
}

async function fetchGoogleNews(query, { lang = 'en', limit = 8 } = {}) {
  const q = encodeURIComponent(query);
  const hl = lang === 'zh' ? 'zh-CN' : 'en-US';
  const gl = lang === 'zh' ? 'CN' : 'US';
  const ceid = lang === 'zh' ? 'CN:zh-Hans' : 'US:en';
  const url = `https://news.google.com/rss/search?q=${q}&hl=${hl}&gl=${gl}&ceid=${ceid}`;
  try {
    const xml = await httpGet(url);
    return parseRss(xml, limit);
  } catch (err) {
    console.warn('[IntelSources] Google News failed:', err.message);
    return [];
  }
}

async function fetchEastmoneyNews(keyword) {
  try {
    const param = JSON.stringify({ uid: '', keyword: String(keyword || '').slice(0, 40) });
    const url = `https://search-api-web.eastmoney.com/search/jsonp?cb=cb&param=${encodeURIComponent(param)}`;
    const data = await httpGet(url);
    const match = data.match(/cb\((.*)\)\s*;?\s*$/s) || data.match(/cb\(([\s\S]*)\)/);
    if (!match) return [];
    const json = JSON.parse(match[1]);
    const list = json?.result?.cmsArticleWebOld || json?.result?.news || json?.Data || [];
    const arr = Array.isArray(list) ? list : [];
    return arr.slice(0, 6).map(n => ({
      title: n.title || n.Title || '',
      time: n.showTime || n.date || n.Date || '',
      source: n.mediaName || n.source || '东方财富',
      url: n.url || n.Url || '',
    })).filter(n => n.title);
  } catch (err) {
    console.warn('[IntelSources] Eastmoney failed:', err.message);
    return [];
  }
}

function dedupeHeadlines(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = (item.title || '').slice(0, 80);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/**
 * 聚合真实头条
 */
async function fetchHeadlines({ query, symbol, category }) {
  const { searchQ, zhQ } = buildNewsQuery({ query, symbol, category });
  const [enNews, zhNews, emNews, tavily] = await Promise.all([
    fetchGoogleNews(searchQ, { lang: 'en', limit: 8 }),
    fetchGoogleNews(zhQ, { lang: 'zh', limit: 6 }),
    fetchEastmoneyNews(zhQ),
    searchWeb(`${searchQ} latest news`).catch(() => []),
  ]);

  const search = (tavily || []).map(r => ({
    title: r.title || '',
    snippet: r.snippet || '',
    url: r.url || '',
    source: 'Search API',
    time: '',
  }));

  const news = dedupeHeadlines([...enNews, ...zhNews, ...emNews]);
  const meta = {
    googleEn: enNews.length,
    googleZh: zhNews.length,
    eastmoney: emNews.length,
    searchApi: search.length,
    queryUsed: searchQ,
  };

  return { news, search, meta };
}

function ruleBasedSummary({ query, quote, news, search }) {
  const headlines = [...(news || []), ...(search || [])].slice(0, 8);
  const pct = Number(quote?.changePercent || 0);
  const dir = pct > 0.3 ? '偏多' : pct < -0.3 ? '偏空' : '震荡';
  const top = headlines.slice(0, 3).map(h => `• ${h.title}`).join('\n');
  const summary = [
    `【${query || quote?.symbol || '市场'}】实时检索到 ${headlines.length} 条相关报道。`,
    quote ? `现价 ${quote.symbol} = ${Number(quote.price).toFixed(2)} (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%)，短线${dir}。` : '',
    top ? `近期标题：\n${top}` : '暂无可用标题，请换关键词或检查网络。',
    '（规则摘要；配置 LLM_API_KEY 后可启用 Agent 深度解读）',
  ].filter(Boolean).join('\n');

  let action = 'HOLD';
  if (pct > 2 && headlines.length >= 2) action = 'BUY';
  if (pct < -2 && headlines.length >= 2) action = 'SELL';

  return {
    summary,
    action,
    confidence: Math.min(0.55, 0.25 + headlines.length * 0.04),
    sentiment: pct > 0 ? 'bullish' : pct < 0 ? 'bearish' : 'neutral',
    llmReady: false,
    mode: 'rules',
  };
}

module.exports = {
  fetchHeadlines,
  fetchGoogleNews,
  ruleBasedSummary,
  buildNewsQuery,
};