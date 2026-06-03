/**
 * 情报标题中文化 — 规则词表 + LLM 批量翻译（可选）
 */
const { askLLM, isLLMReady } = require('./agent/brain');

const CACHE_MAX = 300;
const titleCache = new Map();

/** 常见财经/加密英文 → 中文（长词优先） */
const GLOSSARY = [
  ['Federal Reserve', '美联储'],
  ['Securities and Exchange Commission', '美国证券交易委员会'],
  ['interest rate', '利率'],
  ['interest rates', '利率'],
  ['inflation', '通胀'],
  ['recession', '衰退'],
  ['earnings', '财报'],
  ['quarterly', '季度'],
  ['stock market', '股市'],
  ['Wall Street', '华尔街'],
  ['cryptocurrency', '加密货币'],
  ['crypto market', '加密市场'],
  ['bitcoin', '比特币'],
  ['Bitcoin', '比特币'],
  ['ethereum', '以太坊'],
  ['Ethereum', '以太坊'],
  ['blockchain', '区块链'],
  ['altcoin', '山寨币'],
  ['altcoins', '山寨币'],
  ['stablecoin', '稳定币'],
  ['ETF', 'ETF'],
  ['IPO', 'IPO'],
  ['AI ', '人工智能 '],
  ['artificial intelligence', '人工智能'],
  ['chip stocks', '芯片股'],
  ['semiconductor', '半导体'],
  ['Nvidia', '英伟达'],
  ['Apple', '苹果'],
  ['Microsoft', '微软'],
  ['Google', '谷歌'],
  ['Amazon', '亚马逊'],
  ['Tesla', '特斯拉'],
  ['Meta', 'Meta'],
  ['Trump', '特朗普'],
  ['tariff', '关税'],
  ['tariffs', '关税'],
  ['trade war', '贸易战'],
  ['liquidity', '流动性'],
  ['volatility', '波动'],
  ['rally', '上涨'],
  ['surge', '大涨'],
  ['plunge', '大跌'],
  ['crash', '暴跌'],
  ['record high', '创历史新高'],
  ['record low', '创历史新低'],
  ['all-time high', '历史新高'],
  ['breaks out', '突破'],
  ['breakout', '突破'],
  ['selloff', '抛售'],
  ['sell-off', '抛售'],
  ['buyback', '回购'],
  ['dividend', '股息'],
  ['forecast', '预测'],
  ['outlook', '展望'],
  ['analyst', '分析师'],
  ['investors', '投资者'],
  ['investor', '投资者'],
  ['market', '市场'],
  ['markets', '市场'],
  ['stocks', '股票'],
  ['stock', '股票'],
  ['shares', '股份'],
  ['bond', '债券'],
  ['bonds', '债券'],
  ['yield', '收益率'],
  ['Fed', '美联储'],
  ['SEC', 'SEC'],
  ['BTC', 'BTC'],
  ['ETH', 'ETH'],
  ['SOL', 'SOL'],
  ['BNB', 'BNB'],
];

function cjkCount(text) {
  const m = String(text || '').match(/[\u4e00-\u9fff\u3400-\u4dbf]/g);
  return m ? m.length : 0;
}

function isMostlyEnglish(text) {
  const s = String(text || '').trim();
  if (!s) return false;
  const cjk = cjkCount(s);
  if (cjk >= 4) return false;
  if (cjk / s.length >= 0.15) return false;
  return /[A-Za-z]/.test(s);
}

function glossaryTranslate(text) {
  let out = String(text || '').trim();
  if (!out || !isMostlyEnglish(out)) return out;
  for (const [en, zh] of GLOSSARY) {
    const re = new RegExp(en.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    out = out.replace(re, zh);
  }
  return out;
}

function cacheGet(key) {
  return titleCache.get(key);
}

function cacheSet(key, value) {
  if (titleCache.size >= CACHE_MAX) {
    const first = titleCache.keys().next().value;
    titleCache.delete(first);
  }
  titleCache.set(key, value);
}

function displayTitle(item) {
  if (!item) return '';
  return item.titleZh || item.title || item.snippet || '';
}

/**
 * 单条标题本地化（同步，无 LLM）
 */
function localizeTitleSync(title) {
  const raw = String(title || '').trim();
  if (!raw) return { title: raw, titleZh: raw, titleEn: null };
  if (!isMostlyEnglish(raw)) {
    return { title: raw, titleZh: raw, titleEn: null };
  }
  const cached = cacheGet(raw);
  if (cached) return { title: cached, titleZh: cached, titleEn: raw };

  const zh = glossaryTranslate(raw);
  const display = zh !== raw && cjkCount(zh) > cjkCount(raw) ? zh : raw;
  if (display !== raw) cacheSet(raw, display);
  return { title: display, titleZh: display, titleEn: raw };
}

/**
 * LLM 批量翻译英文标题
 */
async function translateTitlesWithLLM(entries) {
  if (!entries.length || !isLLMReady()) return null;

  const payload = entries.map((e, i) => ({ i, title: e.titleEn || e.title }));
  const systemPrompt = `你是财经新闻标题翻译器。将用户给出的英文新闻标题翻译成简洁、准确的中文标题。
要求：保留公司名/币种/指数等专有名词的常见中文或原文；不要添加评论；每条不超过 80 字。
只输出 JSON：{"items":[{"i":0,"zh":"中文标题"},...]}，不要 markdown。`;

  try {
    const parsed = await askLLM(systemPrompt, JSON.stringify(payload), { validateSchema: false, maxRetries: 1 });
    const list = parsed?.items || parsed?.titles || parsed?.translations;
    if (!Array.isArray(list)) return null;
    const map = new Map();
    for (const row of list) {
      const idx = Number(row.i ?? row.index);
      const zh = String(row.zh || row.titleZh || row.title || '').trim();
      if (!Number.isNaN(idx) && zh) map.set(idx, zh);
    }
    return map;
  } catch (err) {
    console.warn('[IntelTranslate] LLM batch failed:', err.message);
    return null;
  }
}

/**
 * 批量本地化新闻/检索条目（异步）
 */
async function localizeIntelItems(items = []) {
  if (!items?.length) return [];

  const normalized = items.map(item => {
    const base = item.title || item.snippet || '';
    const sync = localizeTitleSync(base);
    return {
      ...item,
      title: sync.title,
      titleZh: sync.titleZh,
      titleEn: sync.titleEn || (isMostlyEnglish(base) ? base : null),
      snippet: item.snippet && isMostlyEnglish(item.snippet)
        ? glossaryTranslate(item.snippet)
        : item.snippet,
    };
  });

  const needLlm = normalized
    .map((item, idx) => ({ idx, item }))
    .filter(({ item }) => item.titleEn && item.title === item.titleEn)
    .slice(0, 14);

  if (!needLlm.length) return normalized;

  const llmMap = await translateTitlesWithLLM(needLlm.map(x => x.item));
  if (!llmMap) return normalized;

  for (const { idx, item } of needLlm) {
    const pos = needLlm.findIndex(n => n.idx === idx);
    const zh = llmMap.get(pos);
    if (!zh) continue;
    cacheSet(item.titleEn, zh);
    normalized[idx] = { ...normalized[idx], title: zh, titleZh: zh };
  }
  return normalized;
}

module.exports = {
  isMostlyEnglish,
  glossaryTranslate,
  localizeTitleSync,
  localizeIntelItems,
  displayTitle,
  cjkCount,
};