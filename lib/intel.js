/**
 * 消息情报 — 实时检索 + Agent 解读 + 关注词轮询
 */

const fs = require('fs');
const path = require('path');
const { fetchHeadlines, ruleBasedSummary } = require('./intelSources');
const { askLLM, isLLMReady, getLLMInfo } = require('./agent/brain');
const { getStockQuote } = require('./quotes');
const { getDataDir } = require('../src/server/config');

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
  return feed[0];
}

function extractSymbols(text) {
  const s = String(text || '').toUpperCase();
  const found = new Set();
  const re = /\b([A-Z]{1,5}|[A-Z0-9]{2,20}(?:USDT|USDT\.P)?)\b/g;
  let m;
  while ((m = re.exec(s))) {
    const tok = m[1];
    if (['THE', 'AND', 'FOR', 'USD', 'API'].includes(tok)) continue;
    found.add(tok);
  }
  return [...found].slice(0, 5);
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

  const entry = pushFeed({
    type: 'scan',
    query: q,
    symbol: primary,
    quote,
    news: headlines.news || [],
    search: headlines.search || [],
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

  const systemPrompt = `你是 Leo Desk 个人模拟仓的分析师助手。根据新闻与搜索摘要，用中文输出 JSON：
{"summary":"3-6句结论","sentiment":"bullish|bearish|neutral","action":"BUY|SELL|HOLD","confidence":0-1,"watchItems":["后续关注1","关注2"],"risks":["风险1"]}
只输出 JSON，不要 markdown。模拟盘场景，不构成投资建议。`;

  const userMessage = JSON.stringify(context, null, 2);

  try {
    const parsed = await askLLM(systemPrompt, userMessage, { validateSchema: false });
    entry.analysis = {
      ...parsed,
      llmReady: true,
      analyzedAt: new Date().toISOString(),
    };
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

function getFeed(limit = 30) {
  return feed.slice(0, Math.min(limit, FEED_MAX));
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