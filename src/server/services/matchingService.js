/**
 * Leomoney 撮合服务
 * 职责：生成 fills（成交记录），不修改账本
 * 模拟盘：按当前价即时全部成交
 * 回测：按 bar 数据撮合
 */

const { D, toMoney, toQty } = require('../domain/money');
const { EVENT_TYPES, eventBus } = require('../domain/events');

/**
 * 模拟盘撮合 — 按当前价即时全部成交
 * @param {Object} order - 订单
 * @param {Object} quote - 行情 { price, category }
 * @returns {Object} fill 结果
 */
function matchPaperOrder(order, quote) {
  if (!quote || !quote.price) {
    return { success: false, error: '无有效行情' };
  }

  const fillPrice = quote.price;
  const fillQty = order.qty;
  const totalAmount = D(fillPrice).times(fillQty);

  const fill = {
    id: `fill_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    orderId: order.id,
    symbol: order.symbol,
    name: order.name,
    side: order.side || order.type,
    price: toMoney(fillPrice),
    qty: toQty(fillQty),
    totalAmount: toMoney(totalAmount),
    fee: toMoney(totalAmount.times(0.0003)), // 万三手续费
    timestamp: new Date().toISOString(),
    source: 'paper_matching',
  };

  eventBus.emit(EVENT_TYPES.ORDER_FILLED, {
    orderId: order.id,
    fillId: fill.id,
    symbol: order.symbol,
    qty: fill.qty,
    price: fill.price,
  });

  return { success: true, fill };
}

/**
 * 回测撮合 — 基于 bar 数据
 * @param {Object} order - 订单
 * @param {Object} bar - { open, high, low, close, volume }
 * @param {string} mode - 'open' | 'close' | 'vwap'
 * @returns {Object} fill 结果
 */
function matchBacktestOrder(order, bar, mode = 'close') {
  if (!bar) return { success: false, error: '无 bar 数据' };

  let fillPrice;
  switch (mode) {
    case 'open': fillPrice = bar.open; break;
    case 'high': fillPrice = bar.high; break;
    case 'low': fillPrice = bar.low; break;
    case 'vwap': fillPrice = bar.vwap || bar.close; break;
    case 'close':
    default: fillPrice = bar.close; break;
  }

  if (!fillPrice || fillPrice <= 0) {
    return { success: false, error: 'bar 价格无效' };
  }

  // 限价单检查
  if (order.limitPrice) {
    if (order.side === 'buy' && fillPrice > order.limitPrice) {
      return { success: false, error: `限价 ${order.limitPrice} 未触及，当前价 ${fillPrice}` };
    }
    if (order.side === 'sell' && fillPrice < order.limitPrice) {
      return { success: false, error: `限价 ${order.limitPrice} 未触及，当前价 ${fillPrice}` };
    }
  }

  // 涨跌停检查（简化）
  if (bar.upLimit && fillPrice >= bar.upLimit && order.side === 'buy') {
    return { success: false, error: '涨停，无法买入' };
  }
  if (bar.downLimit && fillPrice <= bar.downLimit && order.side === 'sell') {
    return { success: false, error: '跌停，无法卖出' };
  }

  const totalAmount = D(fillPrice).times(order.qty);
  const fill = {
    id: `fill_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    orderId: order.id,
    symbol: order.symbol,
    side: order.side || order.type,
    price: toMoney(fillPrice),
    qty: toQty(order.qty),
    totalAmount: toMoney(totalAmount),
    fee: toMoney(totalAmount.times(0.0003)),
    timestamp: bar.timestamp || new Date().toISOString(),
    source: 'backtest_matching',
    barMode: mode,
  };

  return { success: true, fill };
}

/**
 * 批量撮合（回测用）
 * @param {Array} orders - 订单列表
 * @param {Object} bar - 当前 bar
 * @returns {Array} fill 列表
 */
function matchBacktestBatch(orders, bar) {
  const fills = [];
  for (const order of orders) {
    const result = matchBacktestOrder(order, bar);
    if (result.success) fills.push(result.fill);
  }
  return fills;
}

module.exports = { matchPaperOrder, matchBacktestOrder, matchBacktestBatch };
