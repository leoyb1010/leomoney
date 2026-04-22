/**
 * Leomoney 账户汇总服务层
 * 用现价计算真实市值，汇率统一折算 CNY
 */

const { getAccount } = require('./accountService');
const { toCNY, conversionHint } = require('../domain/models');

async function buildAccountSummary(getQuotes, getStockQuote, getAllRates) {
  const account = getAccount();
  const quotes = await getQuotes();

  // 构建现价映射
  const priceMap = {};
  ['astocks', 'hkstocks', 'usstocks', 'metals', 'crypto'].forEach(cat => {
    (quotes[cat] || []).forEach(s => { priceMap[s.symbol] = { price: s.price, currency: s.currency || 'CNY' }; });
  });

  // 对不在热门列表中的持仓，逐个查实时价格
  const missingSymbols = Object.keys(account.holdings).filter(sym => !priceMap[sym]);
  if (missingSymbols.length > 0) {
    const quotePromises = missingSymbols.map(async sym => {
      try {
        const q = await getStockQuote(sym);
        if (q && q.price) priceMap[sym] = { price: q.price, currency: q.currency || 'CNY' };
      } catch(e) { /* 静默失败 */ }
    });
    await Promise.all(quotePromises);
  }

  // 用现价计算每只持仓市值（统一折算CNY）
  let holdingValueCNY = 0;
  const holdingDetails = [];
  Object.entries(account.holdings).forEach(([sym, h]) => {
    const quoteInfo = priceMap[sym];
    const latestPrice = quoteInfo ? quoteInfo.price : h.avgCost;
    const priceCurrency = quoteInfo ? quoteInfo.currency : (h.category === 'usstocks' ? 'USD' : h.category === 'hkstocks' ? 'HKD' : 'CNY');
    const marketValueOrig = h.qty * latestPrice;
    const marketValueCNY = toCNY(marketValueOrig, priceCurrency);
    const costBasisCNY = toCNY(h.qty * h.avgCost, priceCurrency);
    const unrealizedPnL = marketValueCNY - costBasisCNY;
    const unrealizedPnLRatio = costBasisCNY > 0 ? (unrealizedPnL / costBasisCNY * 100) : 0;
    holdingValueCNY += marketValueCNY;
    holdingDetails.push({
      symbol: sym, name: h.name, qty: h.qty, avgCost: h.avgCost, latestPrice,
      priceCurrency, marketValueOrig, marketValueCNY, costBasisCNY,
      unrealizedPnL, unrealizedPnLRatio, isUp: unrealizedPnL >= 0,
      category: h.category, currency: priceCurrency,
      conversionHint: conversionHint(marketValueOrig, priceCurrency),
    });
  });

  const totalAssets = account.balance + holdingValueCNY;
  const totalUnrealizedPnL = holdingDetails.reduce((sum, h) => sum + h.unrealizedPnL, 0);

  // 今日收益（简化版用今日卖出总额 - 对应买入成本）
  const today = new Date().toISOString().slice(0, 10);
  const todayTrades = (account.history || []).filter(t => t.time && t.time.startsWith(today));
  let todayRealizedPnL = 0;
  todayTrades.filter(t => t.type === 'sell').forEach(t => {
    const h = account.holdings[t.symbol];
    const avgCost = h ? h.avgCost : 0;
    todayRealizedPnL += (t.price - avgCost) * t.qty;
  });

  return {
    success: true, accountId: account.accountId,
    baseCurrency: 'CNY', cash: account.balance, holdingValue: holdingValueCNY,
    totalAssets, totalUnrealizedPnL, todayRealizedPnL,
    holdingCount: holdingDetails.length, holdings: holdingDetails,
    pendingOrders: account.pendingOrders, rates: getAllRates(),
  };
}

module.exports = { buildAccountSummary };
