/**
 * Leomoney - 持仓计算模块 v2
 * 改造点：
 *   1. 统一使用 Decimal 计算，消灭浮点误差
 *   2. FIFO 成本法显式实现
 *   3. 超卖直接报错，不允许吞掉
 */

const { D, add, sub, mul, div, gt, lte, toMoney, toQty } = require('../server/domain/money');

/**
 * FIFO 消耗买入批次
 * @param {Array} lots - [{ price, qty }]
 * @param {number|string} sellQty - 卖出数量
 * @returns {{ cost: Decimal, remainingLots: Array }} 成本和剩余批次
 */
function consumeLotsFIFO(lots, sellQty) {
  let remain = D(sellQty);
  let cost = D(0);
  const remaining = [];

  for (const lot of lots) {
    if (remain.lte(0)) {
      remaining.push({ ...lot });
      continue;
    }
    const available = D(lot.qty);
    const useQty = available.gt(remain) ? remain : available;
    cost = cost.plus(useQty.mul(lot.price));
    const newQty = available.minus(useQty);
    if (newQty.gt(0)) {
      remaining.push({ price: lot.price, qty: toQty(newQty) });
    }
    remain = remain.minus(useQty);
  }

  if (remain.gt(0)) {
    throw new Error(`库存不足，检测到超卖: 需卖出 ${sellQty}, 库存缺口 ${remain.toFixed(2)}`);
  }

  return { cost, remainingLots: remaining };
}

/**
 * 计算指定股票的持仓情况
 * @param {Array} trades - 交易记录数组
 * @param {string} [symbol] - 可选，指定股票代码
 * @returns {Object} 持仓信息
 */
function 计算持仓(trades, symbol) {
  const 相关交易 = symbol
    ? trades.filter(t => t.symbol === symbol)
    : trades;

  let lots = []; // FIFO 批次 [{ price, qty }]
  let totalQty = D(0);

  // 按时间正序处理
  const sorted = [...相关交易].sort((a, b) => new Date(a.time || 0) - new Date(b.time || 0));

  sorted.forEach(t => {
    if (t.type === 'buy') {
      lots.push({ price: t.price, qty: t.qty });
      totalQty = totalQty.plus(t.qty);
    } else if (t.type === 'sell') {
      const result = consumeLotsFIFO(lots, t.qty);
      lots = result.remainingLots;
      totalQty = totalQty.minus(t.qty);
    }
  });

  // 计算均价
  let totalCost = D(0);
  for (const lot of lots) {
    totalCost = totalCost.plus(D(lot.qty).mul(lot.price));
  }
  const avgCost = totalQty.gt(0) ? div(totalCost, totalQty) : D(0);

  return {
    数量: toQty(totalQty),
    平均成本: toMoney(avgCost),
    总成本: toMoney(totalCost),
    _lots: lots, // 内部批次，供调试
  };
}

/**
 * 计算所有股票的持仓（按 symbol 分组）
 */
function 计算全部持仓(trades) {
  const symbols = [...new Set(trades.map(t => t.symbol).filter(Boolean))];
  const result = {};
  symbols.forEach(sym => {
    result[sym] = 计算持仓(trades, sym);
  });
  return result;
}

/**
 * 计算盈亏明细（FIFO）
 */
function 计算盈亏明细(trades) {
  const 买入队列 = {};
  const 结果 = [];

  const sorted = [...trades].sort((a, b) => new Date(a.time || 0) - new Date(b.time || 0));

  sorted.forEach(t => {
    if (t.type === 'buy') {
      if (!买入队列[t.symbol]) 买入队列[t.symbol] = [];
      买入队列[t.symbol].push({ price: t.price, qty: D(t.qty) });
    } else if (t.type === 'sell') {
      try {
        const result = consumeLotsFIFO(买入队列[t.symbol] || [], t.qty);
        买入队列[t.symbol] = result.remainingLots.map(l => ({ price: l.price, qty: D(l.qty) }));
        const pnl = D(t.price).mul(t.qty).minus(result.cost);
        结果.push({
          ...t,
          pnl: toMoney(pnl),
          买入成本: toMoney(result.cost),
        });
      } catch (err) {
        结果.push({
          ...t,
          pnl: null,
          买入成本: null,
          error: err.message,
        });
      }
    }
  });

  return 结果;
}

module.exports = { 计算持仓, 计算全部持仓, 计算盈亏明细, consumeLotsFIFO };
