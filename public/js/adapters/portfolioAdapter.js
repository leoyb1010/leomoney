/**
 * Leomoney 持仓适配层
 * 统一持仓计算，消灭各页面各算一套
 */

import { toNumber } from '../utils/guard.js';

/**
 * 计算持仓指标
 * 统一一个函数，全系统共用
 * @param {Object} holding - { qty, avgCost, name, category }
 * @param {number} latestPrice - 最新价
 * @returns {Object}
 */
export function 计算持仓指标(holding, latestPrice) {
  const quantity = toNumber(holding.qty);
  const avgCost = toNumber(holding.avgCost || holding.averageCost || holding.costPrice);
  const price = toNumber(latestPrice || holding.currentPrice || avgCost);

  const marketValue = quantity * price;
  const costBasis = quantity * avgCost;
  const unrealizedPnL = marketValue - costBasis;
  const unrealizedPnLRatio = costBasis > 0 ? (unrealizedPnL / costBasis) * 100 : 0;

  return {
    symbol: holding.symbol || '',
    name: holding.name || '',
    quantity,
    avgCost,
    price,
    marketValue,
    costBasis,
    unrealizedPnL,
    unrealizedPnLRatio,
    isUp: unrealizedPnL >= 0,
  };
}

/**
 * 计算账户汇总
 * @param {number} cash - 可用现金
 * @param {Object} holdings - 持仓字典
 * @param {Object} priceMap - { symbol: latestPrice }
 * @returns {Object}
 */
export function 计算账户汇总(cash, holdings, priceMap = {}) {
  const holdingKeys = Object.keys(holdings || {});
  let totalMarketValue = 0;

  const holdingMetrics = holdingKeys.map(sym => {
    const h = holdings[sym];
    const latestPrice = priceMap[sym] ?? h.avgCost;
    const metrics = 计算持仓指标(h, latestPrice);
    totalMarketValue += metrics.marketValue;
    return metrics;
  });

  const totalAssets = toNumber(cash) + totalMarketValue;
  const totalUnrealizedPnL = holdingMetrics.reduce((sum, m) => sum + m.unrealizedPnL, 0);

  return {
    cash: toNumber(cash),
    totalMarketValue,
    totalAssets,
    totalUnrealizedPnL,
    holdingCount: holdingKeys.length,
    holdingMetrics,
  };
}
