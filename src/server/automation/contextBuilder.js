const { getStockQuote, getQuotes } = require('../../../lib/quotes');
const { getAccount } = require('../services/accountService');
const { buildAccountSummary } = require('../services/summaryService');
const { getAllRates } = require('../../../lib/fx');

function dataQualityForQuote(quote) {
  const fetchedAt = quote?.fetchedAt || quote?.time || quote?.timestamp || new Date().toISOString();
  return {
    source: quote?.source || 'unknown',
    fetchedAt,
    isSynthetic: Boolean(quote?.isSynthetic || quote?.synthetic || quote?.source === 'fallback_simulated'),
    staleAfterMs: quote?.staleAfterMs || 15000,
  };
}

async function findQuoteAny(symbol) {
  const key = String(symbol || '').trim();
  if (!key) return null;
  const direct = await getStockQuote(key);
  if (direct) return direct;

  const quotes = await getQuotes();
  const all = [
    ...(quotes.indices || []),
    ...(quotes.astocks || []),
    ...(quotes.hkstocks || []),
    ...(quotes.usstocks || []),
    ...(quotes.metals || []),
    ...(quotes.crypto || []),
  ];
  const found = all.find(item => [item.symbol, item.code, item.id, item.sinaCode]
    .filter(Boolean)
    .map(String)
    .includes(key));
  if (!found) return null;

  return {
    symbol: found.symbol || found.code || found.id || found.sinaCode,
    ...found,
    category: found.category || 'indices',
  };
}

async function buildContext(trigger) {
  const account = getAccount();
  if (!account) throw new Error('Current account not found');
  if (trigger.accountId && account.accountId && trigger.accountId !== account.accountId) {
    throw new Error(`Trigger accountId ${trigger.accountId} does not match current account ${account.accountId}`);
  }

  const quote = trigger.symbol ? await findQuoteAny(trigger.symbol) : null;
  const summary = await buildAccountSummary(getQuotes, getStockQuote, getAllRates);
  const position = trigger.symbol ? (account.positions || {})[trigger.symbol] || null : null;

  return {
    account: {
      accountId: account.accountId,
      accountName: account.accountName,
      cash: account.cash || { available: account.balance || 0, frozen: 0, total: account.balance || 0 },
      riskBaseCurrency: 'CNY',
    },
    portfolio: {
      totalAssets: summary.totalAssets,
      holdingValue: summary.holdingValue,
      holdingCount: summary.holdingCount,
      todayRealizedPnL: summary.todayRealizedPnL,
    },
    position,
    market: quote ? {
      symbol: quote.symbol || quote.code || quote.id || quote.sinaCode,
      name: quote.name || quote.symbol,
      price: Number(quote.price),
      category: quote.category || 'astocks',
      currency: quote.currency || 'CNY',
      change: quote.change,
      changePercent: quote.changePercent,
      dataQuality: dataQualityForQuote(quote),
    } : null,
    trigger,
    builtAt: new Date().toISOString(),
  };
}

module.exports = { buildContext, dataQualityForQuote, findQuoteAny };
