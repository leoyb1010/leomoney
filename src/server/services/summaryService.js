/**
 * Leomoney 账户汇总服务层 v2
 * 适配 cash/positions 新结构 + Decimal 计算
 */

const { getAccount } = require('./accountService');
const { toCNY, conversionHint } = require('../domain/models');
const { D, mul, sub, add, toMoney, gt } = require('../domain/money');
const { 计算盈亏明细 } = require('../../analytics/position');

async function buildAccountSummary(getQuotes, getStockQuote, getAllRates) {
  const account = getAccount();
  const quotes = await getQuotes();

  const priceMap = {};
  ['astocks', 'hkstocks', 'usstocks', 'metals', 'crypto'].forEach(cat => {
    (quotes[cat] || []).forEach(s => {
      priceMap[s.symbol] = { price: s.price, currency: s.currency || 'CNY' };
    });
  });

  // 兼容 positions (新) 和 holdings (旧)
  const positions = account.positions || {};
  const holdings = account.holdings || {};

  // 合并两个数据源
  const allSymbols = new Set([...Object.keys(positions), ...Object.keys(holdings)]);

  const missingSymbols = [...allSymbols].filter(sym => !priceMap[sym]);
  if (missingSymbols.length > 0) {
    await Promise.all(missingSymbols.map(async sym => {
      try {
        const q = await getStockQuote(sym);
        if (q && q.price) priceMap[sym] = { price: q.price, currency: q.currency || 'CNY' };
      } catch (e) { /* ignore */ }
    }));
  }

  let holdingValueCNY = D(0);
  const holdingDetails = [];

  for (const sym of allSymbols) {
    const pos = positions[sym];
    const hold = holdings[sym];

    // 优先用新结构
    const qty = pos ? Number(pos.totalQty) : (hold ? hold.qty : 0);
    const sellableQty = pos ? Number(pos.sellableQty) : qty;
    const frozenQty = pos ? Number(pos.frozenQty) : 0;
    const avgCost = pos ? Number(pos.avgCost) : (hold ? hold.avgCost : 0);
    const realizedPnl = pos ? Number(pos.realizedPnl || 0) : 0;
    const name = (pos?.name || hold?.name || sym);
    const category = (pos?.category || hold?.category || 'astocks');

    const quoteInfo = priceMap[sym];
    const latestPrice = quoteInfo ? quoteInfo.price : avgCost;
    const priceCurrency = quoteInfo ? quoteInfo.currency :
      (category === 'usstocks' ? 'USD' : category === 'hkstocks' ? 'HKD' : 'CNY');

    const marketValueOrig = mul(qty, latestPrice);
    const marketValueCNY = toCNY(Number(marketValueOrig), priceCurrency);
    const costBasisCNY = toCNY(Number(mul(qty, avgCost)), priceCurrency);
    const unrealizedPnL = sub(marketValueCNY, costBasisCNY);
    const unrealizedPnLRatio = gt(costBasisCNY, 0) ? Number(unrealizedPnL) / Number(costBasisCNY) * 100 : 0;

    holdingValueCNY = holdingValueCNY.plus(D(marketValueCNY));

    holdingDetails.push({
      symbol: sym, name, totalQty: qty, sellableQty, frozenQty,
      avgCost, latestPrice, priceCurrency,
      marketValueOrig: Number(marketValueOrig), marketValueCNY, costBasisCNY,
      unrealizedPnL: Number(unrealizedPnL), unrealizedPnLRatio,
      realizedPnl,
      isUp: Number(unrealizedPnL) >= 0,
      category, currency: priceCurrency,
      conversionHint: conversionHint(Number(marketValueOrig), priceCurrency),
    });
  }

  // 兼容 cash (新) 和 balance (旧)
  const cash = account.cash || { available: account.balance || 0, frozen: 0, total: account.balance || 0 };
  const cashAvailable = Number(cash.available);
  const cashFrozen = Number(cash.frozen || 0);
  const cashTotal = Number(cash.total || cashAvailable);

  const totalAssets = add(cashTotal, holdingValueCNY);
  const totalUnrealizedPnL = holdingDetails.reduce((sum, h) => add(sum, h.unrealizedPnL), 0);

  const today = new Date().toISOString().slice(0, 10);
  const realizedDetails = 计算盈亏明细(account.history || []);
  const todayRealizedPnL = realizedDetails
    .filter(t => t.time && t.time.startsWith(today))
    .reduce((sum, t) => add(sum, t.pnl || 0), 0);

  return {
    success: true,
    accountId: account.accountId,
    baseCurrency: 'CNY',
    cash: { available: toMoney(cashAvailable), frozen: toMoney(cashFrozen), total: toMoney(cashTotal) },
    cashAvailable: toMoney(cashAvailable), // 兼容旧前端
    cashFrozen: toMoney(cashFrozen),
    balance: toMoney(cashTotal), // 兼容旧前端
    holdingValue: toMoney(holdingValueCNY),
    totalAssets: toMoney(totalAssets),
    totalUnrealizedPnL: toMoney(totalUnrealizedPnL),
    todayRealizedPnL: toMoney(todayRealizedPnL),
    holdingCount: holdingDetails.length,
    holdings: holdingDetails,
    pendingOrders: account.pendingOrders || [],
    rates: getAllRates(),
  };
}

module.exports = { buildAccountSummary };
