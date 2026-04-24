/**
 * Leomoney Agent 眼睛 — 实时信息获取
 * 东方财富个股新闻（免费公开API，无需key）+ Tavily/SearXNG/Serper 搜索
 *
 * 2026-04-24: 新增 Tavily POST API 原生支持
 */

const https = require('https');
const http = require('http');

/**
 * 综合情报采集
 * @param {string} symbol - 股票代码
 * @param {string} name - 股票名称
 * @returns {Promise<{news: Array, search: Array}>}
 */
async function gatherIntelligence(symbol, name) {
  const [news, search] = await Promise.allSettled([
    fetchStockNews(symbol, name),
    searchWeb(name || symbol),
  ]);
  return {
    news: news.status === 'fulfilled' ? news.value : [],
    search: search.status === 'fulfilled' ? search.value : [],
  };
}

/**
 * 东方财富个股新闻（免费，不需要 API key）
 * 
 * 原理：东方财富提供公开的 JSONP 搜索接口，直接请求即可获取新闻数据。
 * 无需注册、无需 API Key、无需配置，开箱即用。
 * 
 * 接口地址：https://search-api-web.eastmoney.com/search/jsonp
 * 返回格式：JSONP（cb({...})），需要解析提取 JSON
 */
async function fetchStockNews(symbol, name) {
  try {
    const keyword = encodeURIComponent(name || symbol);
    const url = `https://search-api-web.eastmoney.com/search/jsonp?cb=cb&param=%7B"uid"%3A""%2C"keyword"%3A"${keyword}"%7D`;
    const data = await httpGet(url);
    // 解析 JSONP
    const match = data.match(/cb\((.*)\)/s);
    if (!match) return [];
    const json = JSON.parse(match[1]);
    return (json.result?.news || []).slice(0, 5).map(n => ({
      title: n.title || '',
      time: n.date || '',
      source: n.source || '',
    }));
  } catch {
    return [];
  }
}

/**
 * 通用搜索 — 自动识别 SEARCH_API_URL 类型
 * 
 * 支持的搜索引擎：
 * - "tavily" 或 "https://api.tavily.com" → Tavily POST API
 * - 其他 URL → SearXNG / Serper GET API
 * 
 * 环境变量：
 * - SEARCH_API_URL: "tavily" 或搜索引擎 URL
 * - SEARCH_API_KEY: API 密钥
 */
async function searchWeb(query) {
  const searchApiUrl = process.env.SEARCH_API_URL;
  if (!searchApiUrl) return [];

  // Tavily 检测
  const isTavily = searchApiUrl === 'tavily' || searchApiUrl.includes('tavily.com');
  if (isTavily) {
    return await _searchTavily(query);
  }

  // SearXNG / Serper GET API
  return await _searchGet(query, searchApiUrl);
}

/**
 * Tavily Search API（POST）
 * 文档：https://docs.tavily.com/documentation/api-reference/endpoint/search
 */
async function _searchTavily(query) {
  const apiKey = process.env.SEARCH_API_KEY;
  if (!apiKey) return [];

  try {
    const body = JSON.stringify({
      api_key: apiKey,
      query: query + ' 研报 评级 分析',
      max_results: 5,
      search_depth: 'basic',
      include_answer: false,
    });

    const data = await httpPost('https://api.tavily.com/search', body, {
      'Content-Type': 'application/json',
    });

    const parsed = JSON.parse(data);
    return (parsed.results || []).slice(0, 5).map(r => ({
      title: r.title || '',
      snippet: r.content || r.snippet || '',
      url: r.url || '',
    }));
  } catch (err) {
    console.warn('[Eyes] Tavily 搜索失败:', err.message);
    return [];
  }
}

/**
 * SearXNG / Serper GET API
 */
async function _searchGet(query, searchApiUrl) {
  try {
    const q = encodeURIComponent(query + ' 研报 评级 分析');
    const apiKey = process.env.SEARCH_API_KEY || '';
    const url = `${searchApiUrl}?q=${q}&num=5${apiKey ? '&api_key=' + apiKey : ''}`;
    const data = await httpGet(url);
    const parsed = JSON.parse(data);
    return (parsed.results || parsed.organic || parsed.data || []).slice(0, 5).map(r => ({
      title: r.title || '',
      snippet: r.snippet || r.description || r.content || '',
      url: r.url || r.link || '',
    }));
  } catch {
    return [];
  }
}

// ── HTTP 工具函数 ──

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const transport = parsed.protocol === 'https:' ? https : http;
    transport.get(url, { rejectUnauthorized: process.env.TLS_REJECT_UNAUTHORIZED !== 'false' }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function httpPost(url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const transport = parsed.protocol === 'https:' ? https : http;
    const req = transport.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: {
        ...headers,
        'Content-Length': Buffer.byteLength(body),
      },
      rejectUnauthorized: process.env.TLS_REJECT_UNAUTHORIZED !== 'false',
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });

    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('搜索请求超时(15s)')); });
    req.write(body);
    req.end();
  });
}

module.exports = { gatherIntelligence, fetchStockNews, searchWeb };
