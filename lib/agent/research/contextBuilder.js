const { getAccount } = require('../../../src/server/services/accountService');
const { getStockQuote } = require('../../quotes');
const { gatherIntelligence } = require('../eyes');
const { getMemory } = require('./memory');
const { normalizeSymbol } = require('./schemas');

function resolveBenchmark(category, config = {}) {
  const map = config.benchmarkMap || {};
  return map[category] || map.usstocks || 'QQQ';
}

function findPosition(positions, symbol, quote) {
  const candidates = [
    symbol,
    quote?.symbol,
    quote?.sinaCode,
    quote?.binanceSymbol,
  ].filter(Boolean).map(normalizeSymbol);
  for (const key of candidates) {
    if (positions[key]) return positions[key];
  }
  return null;
}

async function safeQuote(symbol) {
  if (!symbol) return null;
  try {
    return await getStockQuote(symbol);
  } catch {
    return null;
  }
}

async function buildResearchContext({ symbol, config, includeIntelligence = true }) {
  const normalized = normalizeSymbol(symbol);
  const quote = await safeQuote(normalized);
  if (!quote?.price) throw new Error(`未找到 ${normalized} 的有效行情`);

  const account = getAccount();
  const cash = account?.cash || { available: account?.balance || 0, total: account?.balance || 0, frozen: 0 };
  const positions = account?.positions || account?.holdings || {};
  const position = findPosition(positions, normalized, quote);
  const benchmarkSymbol = resolveBenchmark(quote.category || 'usstocks', config);
  const benchmarkQuote = benchmarkSymbol && benchmarkSymbol !== quote.symbol ? await safeQuote(benchmarkSymbol) : null;
  const intel = includeIntelligence ? await gatherIntelligence(quote.symbol || normalized, quote.name || normalized) : { news: [], search: [] };
  const memory = getMemory(quote.symbol || normalized, { limit: 8 });

  return {
    symbol: quote.symbol || normalized,
    requestedSymbol: normalized,
    generatedAt: new Date().toISOString(),
    quote: {
      symbol: quote.symbol || normalized,
      name: quote.name || quote.symbol || normalized,
      price: Number(quote.price),
      prevClose: Number(quote.prevClose || quote.open || quote.price),
      open: Number(quote.open || quote.price),
      high: Number(quote.high || quote.price),
      low: Number(quote.low || quote.price),
      change: Number(quote.change || 0),
      changePercent: Number(quote.changePercent || 0),
      volume: Number(quote.volume || quote.quoteVolume || 0),
      market: quote.market || '',
      category: quote.category || 'usstocks',
      currency: quote.currency || 'USD',
      source: quote.source || quote.dataQuality?.source || 'leomoney-quotes',
      asOf: quote.asOf || quote.timestamp || new Date().toISOString(),
      dataQuality: quote.dataQuality || { isSynthetic: false, source: quote.source || 'leomoney-quotes', note: 'LeoMoney 行情快照' },
    },
    benchmark: benchmarkQuote ? {
      symbol: benchmarkQuote.symbol,
      name: benchmarkQuote.name || benchmarkQuote.symbol,
      price: Number(benchmarkQuote.price),
      prevClose: Number(benchmarkQuote.prevClose || benchmarkQuote.open || benchmarkQuote.price),
      changePercent: Number(benchmarkQuote.changePercent || 0),
      source: benchmarkQuote.source || benchmarkQuote.dataQuality?.source || 'leomoney-quotes',
      asOf: benchmarkQuote.asOf || new Date().toISOString(),
    } : { symbol: benchmarkSymbol, unavailable: true },
    account: {
      accountId: account?.accountId || 'default',
      cashAvailable: Number(cash.available || 0),
      cashTotal: Number(cash.total || cash.available || 0),
      positionCount: Object.keys(positions).length,
    },
    position: position ? {
      symbol: position.symbol || quote.symbol,
      name: position.name || quote.name || quote.symbol,
      totalQty: Number(position.totalQty || position.qty || 0),
      sellableQty: Number(position.sellableQty || position.qty || 0),
      avgCost: Number(position.avgCost || 0),
      category: position.category || quote.category,
      currency: position.currency || quote.currency,
    } : null,
    intel: {
      news: (intel.news || []).slice(0, 8),
      search: (intel.search || []).slice(0, 8),
      sourceConfigured: !!process.env.SEARCH_API_URL,
    },
    memory,
    sources: {
      quote: quote.source || quote.dataQuality?.source || 'leomoney-quotes',
      news: 'eastmoney-public-search',
      search: process.env.SEARCH_API_URL ? 'configured-search-provider' : 'not-configured',
      memory: 'research-memory.json',
    },
  };
}

module.exports = {
  buildResearchContext,
  resolveBenchmark,
};
