/**
 * Leomoney 行情适配层
 * 统一不同来源的行情数据格式
 */

import { toNumber, safeString } from '../utils/guard.js';

/**
 * 归一化行情数据
 * 消灭到处写 `raw.name || raw.displayName || raw.symbol` 的模式
 * @param {Object} raw - 原始行情数据
 * @returns {Object} 标准化行情对象
 */
export function 归一化行情(raw = {}) {
  const price = toNumber(raw.price ?? raw.lastPrice ?? raw.currentPrice ?? 0);
  const prevClose = toNumber(raw.prevClose ?? raw.previousClose ?? price);
  const change = toNumber(raw.change ?? raw.priceChange ?? (price - prevClose));
  const changePercent = toNumber(raw.changePercent ?? raw.percentChange ?? (prevClose > 0 ? (change / prevClose * 100) : 0));

  return {
    symbol: safeString(raw.symbol || raw.code, ''),
    name: safeString(raw.name || raw.displayName || raw.symbol, ''),
    price,
    prevClose,
    open: toNumber(raw.open ?? raw.dayOpen ?? 0),
    high: toNumber(raw.high ?? raw.dayHigh ?? 0),
    low: toNumber(raw.low ?? raw.dayLow ?? 0),
    change,
    changePercent,
    volume: toNumber(raw.volume ?? 0),
    sector: safeString(raw.sector || raw.industry, ''),
    category: safeString(raw.category || raw.market, 'astocks'),
    currency: safeString(raw.currency, 'CNY'),
    unit: safeString(raw.unit, ''),
  };
}
