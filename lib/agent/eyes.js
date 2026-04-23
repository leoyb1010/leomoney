/**
 * Leomoney Agent 眼睛 — 实时信息获取
 * 东方财富个股新闻 + 通用搜索（SearXNG/Tavily/Serper）
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
 * 通用搜索（需配置 SEARCH_API_URL）
 * 支持 SearXNG / Tavily / Serper
 */
async function searchWeb(query) {
  const searchApiUrl = process.env.SEARCH_API_URL;
  if (!searchApiUrl) return [];

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

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const transport = parsed.protocol === 'https:' ? https : http;
    transport.get(url, { rejectUnauthorized: false }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

module.exports = { gatherIntelligence, fetchStockNews, searchWeb };
