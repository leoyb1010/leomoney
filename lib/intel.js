/**
 * 消息情报 — 实时检索 + Agent 解读 + 关注词轮询
 */

const fs = require('fs');
const path = require('path');
const { fetchHeadlines, ruleBasedSummary } = require('./intelSources');
const { localizeIntelItems, localizeTitleSync } = require('./intelTranslate');
const { askLLM, isLLMReady, getLLMInfo } = require('./agent/brain');
const { getStockQuote } = require('./quotes');
const { getDataDir } = require('../src/server/config');
const { sseService } = require('./sse');

const FEED_MAX = 80;
const feed = [];
let watchTopics = [];
let pollTimer = null;

function watchFile() {
  return path.join(getDataDir(), 'intel-watch.json');
}

function loadWatch() {
  try {
    const raw = fs.readFileSync(watchFile(), 'utf8');
    const data = JSON.parse(raw);
    watchTopics = Array.isArray(data.topics) ? data.topics : [];
  } catch {
    watchTopics = watchTopics.length ? watchTopics : [
      { id: 'w_btc', query: 'BTC 比特币 行情', symbol: 'BTCUSDT', enabled: true },
      { id: 'w_macro', query: '美联储 流动性 宏观', symbol: 'AAPL', enabled: true },
    ];
  }
}

function saveWatch() {
  try {
    fs.mkdirSync(getDataDir(), { recursive: true });
    fs.writeFileSync(watchFile(), JSON.stringify({ topics: watchTopics, updatedAt: new Date().toISOString() }, null, 2));
  } catch (err) {
    console.error('[Intel] save watch failed:', err.message);
  }
}

function pushFeed(entry) {
  feed.unshift({ ...entry, id: `intel_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, ts: new Date().toISOString() });
  if (feed.length > FEED_MAX) feed.length = FEED_MAX;
  try {
    sseService.broadcast('intel', 'intel_update', feed[0]);
  } catch {
    // SSE is optional during tests
  }
  return feed[0];
}

function extractSymbols(text) {
  const s = String(text || '').toUpperCase();
  const found = new Set();
  const aliases = [
    [/APPLE|AAPL/g, 'AAPL'],
    [/NVIDIA|NVDA/g, 'NVDA'],
    [/TESLA|TSLA/g, 'TSLA'],
    [/MICROSOFT|MSFT/g, 'MSFT'],
    [/ALPHABET|GOOGLE|GOOGL/g, 'GOOGL'],
    [/AMAZON|AMZN/g, 'AMZN'],
    [/\bMETA\b/g, 'META'],
    [/\bAMD\b/g, 'AMD'],
    [/BITCOIN|BTC/g, 'BTCUSDT'],
    [/ETHEREUM|ETHER|ETH/g, 'ETHUSDT'],
    [/\bSOLANA\b|\bSOL\b/g, 'SOLUSDT'],
    [/\bBNB\b/g, 'BNBUSDT'],
    [/\bSPY\b/g, 'SPY'],
    [/\bQQQ\b/g, 'QQQ'],
  ];
  for (const [pattern, symbol] of aliases) {
    if (pattern.test(s)) found.add(symbol);
  }
  const re = /\b([A-Z]{1,5}|[A-Z0-9]{2,20}(?:USDT|USDT\.P)?)\b/g;
  let m;
  while ((m = re.exec(s))) {
    const tok = m[1];
    if (['THE', 'AND', 'FOR', 'USD', 'API'].includes(tok)) continue;
    found.add(tok);
  }
  return [...found].slice(0, 5);
}

async function buildRelatedSymbols({ text, primary, quote, max = 5, verifySecondary = true }) {
  const candidates = new Set();
  if (primary) candidates.add(String(primary).trim().toUpperCase());
  extractSymbols(text).forEach(sym => candidates.add(sym));
  const related = [];
  for (const symbol of [...candidates].slice(0, 10)) {
    if (!verifySecondary && symbol !== primary) continue;
    const snapshot = symbol === primary && quote ? quote : await fetchQuoteSnapshot(symbol);
    if (!snapshot?.price) continue;
    related.push({
      symbol: snapshot.symbol || symbol,
      name: snapshot.name || symbol,
      market: snapshot.category || snapshot.market || 'unknown',
      price: snapshot.price,
      changePercent: snapshot.changePercent || 0,
      currency: snapshot.currency || 'USD',
      relevance: symbol === primary ? 1 : 0.74,
      reason: symbol === primary ? '检索标的' : '新闻文本提及',
    });
    if (related.length >= max) break;
  }
  return related;
}

async function attachRelated(items, { primary, quote, query }) {
  return Promise.all((items || []).map(async item => {
    const text = [query, item.title, item.titleEn, item.snippet, item.snippetEn].filter(Boolean).join(' ');
    const related = await buildRelatedSymbols({ text, primary, quote, max: 2, verifySecondary: false });
    return { ...item, related };
  }));
}

async function fetchQuoteSnapshot(symbol) {
  if (!symbol) return null;
  try {
    const q = await getStockQuote(symbol);
    if (!q?.price) return null;
    return {
      symbol: q.symbol,
      name: q.name,
      price: q.price,
      changePercent: q.changePercent,
      category: q.category,
      currency: q.currency,
    };
  } catch {
    return null;
  }
}

async function scanIntel({ query, symbol }) {
  const q = String(query || symbol || '').trim();
  if (!q) throw new Error('请输入检索关键词或标的');

  const symbols = symbol ? [symbol] : extractSymbols(q);
  const primary = symbol || symbols[0] || null;

  const quote = primary ? await fetchQuoteSnapshot(primary) : null;
  const headlines = await fetchHeadlines({ query: q, symbol: primary, category: quote?.category });
  const [news, search] = await Promise.all([
    localizeIntelItems(headlines.news || []),
    localizeIntelItems(headlines.search || []),
  ]);
  const [newsWithRelated, searchWithRelated] = await Promise.all([
    attachRelated(news, { primary, quote, query: q }),
    attachRelated(search, { primary, quote, query: q }),
  ]);
  const related = await buildRelatedSymbols({
    text: [q, ...news.map(n => n.titleEn || n.title), ...search.map(s => s.titleEn || s.title)].join(' '),
    primary,
    quote,
    verifySecondary: false,
  });

  const entry = pushFeed({
    type: 'scan',
    query: q,
    symbol: primary,
    quote,
    news: newsWithRelated,
    search: searchWithRelated,
    related,
    sourceMeta: headlines.meta || {},
    agentLinked: false,
  });

  return entry;
}

async function analyzeIntel({ query, symbol }) {
  const entry = await scanIntel({ query, symbol });
  const llmReady = isLLMReady();

  if (!llmReady) {
    entry.analysis = ruleBasedSummary({
      query: entry.query,
      quote: entry.quote,
      news: entry.news,
      search: entry.search,
    });
    return entry;
  }

  const context = {
    query: entry.query,
    symbol: entry.symbol,
    quote: entry.quote,
    news: entry.news,
    search: entry.search,
  };

  const systemPrompt = `你是 LeoMoney V4 个人模拟仓的分析师助手。根据新闻与搜索摘要，用中文输出 JSON：
{"summary":"3-6句结论","sentiment":"bullish|bearish|neutral","action":"BUY|SELL|HOLD","confidence":0-1,"watchItems":["后续关注1","关注2"],"risks":["风险1"],"relatedSymbols":[{"symbol":"AAPL","name":"Apple","market":"usstocks","relevance":0.9,"reason":"关联理由"}]}
要求：股票、ETF、指数、币种、金融产品和公司名称不必强制翻译，Apple、NVIDIA、BTC、ETH、SPY、QQQ、S&P 500 等可以保留英文。
只输出 JSON，不要 markdown。模拟盘场景，不构成投资建议。`;

  const userMessage = JSON.stringify(context, null, 2);

  try {
    const parsed = await askLLM(systemPrompt, userMessage, { validateSchema: false });
    entry.analysis = {
      ...parsed,
      llmReady: true,
      analyzedAt: new Date().toISOString(),
    };
    if (Array.isArray(parsed?.relatedSymbols) && parsed.relatedSymbols.length) {
      const verified = [];
      for (const row of parsed.relatedSymbols.slice(0, 8)) {
        const snap = await fetchQuoteSnapshot(row.symbol);
        if (!snap?.price) continue;
        verified.push({
          symbol: snap.symbol,
          name: snap.name || row.name || snap.symbol,
          market: snap.category || row.market || 'unknown',
          price: snap.price,
          changePercent: snap.changePercent || 0,
          currency: snap.currency || 'USD',
          relevance: Math.max(0, Math.min(1, Number(row.relevance || 0.7))),
          reason: String(row.reason || 'LLM 标的映射').slice(0, 120),
        });
      }
      if (verified.length) entry.related = verified;
    }
    entry.agentLinked = true;
  } catch (err) {
    entry.analysis = {
      summary: `Agent 解读失败：${err.message}`,
      action: 'HOLD',
      confidence: 0,
      llmReady: true,
      error: err.message,
    };
  }

  return entry;
}

function localizeEntryForDisplay(entry) {
  const mapItem = (item) => {
    if (!item) return item;
    if (item.titleZh) return item;
    const base = item.title || item.snippet || '';
    const loc = localizeTitleSync(base);
    return { ...item, title: loc.title, titleZh: loc.titleZh, titleEn: loc.titleEn };
  };
  return {
    ...entry,
    news: (entry.news || []).map(mapItem),
    search: (entry.search || []).map(mapItem),
  };
}

function getFeed(limit = 30) {
  return feed.slice(0, Math.min(limit, FEED_MAX)).map(localizeEntryForDisplay);
}

function getWatchTopics() {
  return watchTopics;
}

function addWatchTopic({ query, symbol }) {
  const q = String(query || '').trim();
  if (!q) throw new Error('关注词不能为空');
  const topic = {
    id: `w_${Date.now()}`,
    query: q,
    symbol: symbol || extractSymbols(q)[0] || null,
    enabled: true,
    createdAt: new Date().toISOString(),
  };
  watchTopics.unshift(topic);
  if (watchTopics.length > 30) watchTopics.length = 30;
  saveWatch();
  return topic;
}

function removeWatchTopic(id) {
  watchTopics = watchTopics.filter(t => t.id !== id);
  saveWatch();
}

async function pollWatchTopics() {
  const active = watchTopics.filter(t => t.enabled);
  for (const t of active.slice(0, 5)) {
    try {
      await scanIntel({ query: t.query, symbol: t.symbol });
    } catch (err) {
      console.warn('[Intel] poll failed:', t.query, err.message);
    }
  }
}

function startIntelPolling(intervalMs = 90000) {
  if (pollTimer) clearInterval(pollTimer);
  loadWatch();
  pollTimer = setInterval(() => {
    if (watchTopics.some(t => t.enabled)) pollWatchTopics();
  }, intervalMs);
  console.log('[Intel] 关注词轮询已启动（90秒）');
}

function stopIntelPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

loadWatch();

module.exports = {
  scanIntel,
  analyzeIntel,
  getFeed,
  getWatchTopics,
  addWatchTopic,
  removeWatchTopic,
  startIntelPolling,
  stopIntelPolling,
  pushFeed,
  isLLMReady,
  getLLMInfo,
};
