/**
 * Leomoney 订单适配层
 * 统一订单预览和校验逻辑
 */

import { toNumber, toInteger } from '../utils/guard.js';

/**
 * 构建订单预览
 * @param {Object} params
 * @param {'buy'|'sell'} params.side
 * @param {number} params.price
 * @param {number} params.quantity
 * @param {number} params.cash
 * @param {number} params.availableQuantity
 * @param {string} params.category
 * @returns {Object}
 */
export function 构建订单预览({ side, price, quantity, cash, availableQuantity, category = 'astocks' }) {
  const p = toNumber(price);
  const q = Math.max(0, Math.floor(toNumber(quantity)));
  const amount = p * q;

  const isStockLike = category === 'astocks' || category === 'hkstocks' || category === 'usstocks';
  const qtyValid = q > 0 && (!isStockLike || q % 100 === 0);

  const 可买 = side === 'buy' ? amount <= toNumber(cash) && qtyValid : true;
  const 可卖 = side === 'sell' ? q <= toNumber(availableQuantity) && qtyValid : true;

  const reasons = [];
  if (!qtyValid) reasons.push(isStockLike ? '数量必须为100的整数倍' : '数量必须大于0');
  if (side === 'buy' && !可买 && qtyValid) reasons.push('可用资金不足');
  if (side === 'sell' && !可卖 && qtyValid) reasons.push('可卖数量不足');

  return {
    side,
    price: p,
    quantity: q,
    amount,
    canSubmit: 可买 && 可卖,
    reasons,
    // 可买/可卖数量提示
    maxBuyQty: isStockLike ? Math.floor(toNumber(cash) / p / 100) * 100 : Math.floor(toNumber(cash) / p),
    maxSellQty: toInteger(availableQuantity),
  };
}

/**
 * 条件单状态归一化
 * @param {Object} order
 * @returns {Object}
 */
export function 归一化条件单(order = {}) {
  return {
    id: order.id || '',
    symbol: order.symbol || '',
    name: order.name || '',
    type: order.type || 'buy',
    triggerType: order.triggerType || 'gte',
    triggerPrice: toNumber(order.triggerPrice),
    qty: toNumber(order.qty),
    status: order.status || 'pending',
    createdAt: order.createdAt || '',
    executedAt: order.executedAt || null,
    executedPrice: toNumber(order.executedPrice || 0),
  };
}
