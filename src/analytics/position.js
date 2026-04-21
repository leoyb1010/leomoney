/**
 * Leomoney - 持仓计算模块
 * 统一标准计算持仓成本和数量
 */

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

  let 数量 = 0;
  let 成本 = 0;

  相关交易.forEach(t => {
    if (t.type === 'buy') {
      成本 = 成本 * (数量 / (数量 + t.qty || 1)) + t.price * (t.qty / (数量 + t.qty || 1));
      数量 += t.qty;
    } else if (t.type === 'sell') {
      数量 -= t.qty;
      if (数量 <= 0) {
        数量 = 0;
        成本 = 0;
      }
    }
  });

  return {
    数量,
    平均成本: 数量 > 0 ? 成本 : 0,
    总成本: 数量 * 成本,
  };
}

/**
 * 计算所有股票的持仓（按 symbol 分组）
 * @param {Array} trades - 交易记录数组
 * @returns {Object} { symbol: 持仓信息 }
 */
function 计算全部持仓(trades) {
  const symbols = [...new Set(trades.map(t => t.symbol))];
  const result = {};
  symbols.forEach(sym => {
    result[sym] = 计算持仓(trades, sym);
  });
  return result;
}

/**
 * 匹配买卖对，计算每笔卖出交易的盈亏
 * @param {Array} trades - 交易记录数组
 * @returns {Array} 带 pnl 字段的交易记录
 */
function 计算盈亏明细(trades) {
  // 按 symbol 分组的买入队列
  const 买入队列 = {};
  const 结果 = [];

  // 按时间正序处理
  const sorted = [...trades].sort((a, b) => new Date(a.time) - new Date(b.time));

  sorted.forEach(t => {
    if (t.type === 'buy') {
      if (!买入队列[t.symbol]) 买入队列[t.symbol] = [];
      买入队列[t.symbol].push({ price: t.price, qty: t.qty, time: t.time });
    } else if (t.type === 'sell') {
      let 剩余 = t.qty;
      let 总成本 = 0;

      if (买入队列[t.symbol]) {
        while (剩余 > 0 && 买入队列[t.symbol].length > 0) {
          const 头 = 买入队列[t.symbol][0];
          const 消耗 = Math.min(剩余, 头.qty);
          总成本 += 消耗 * 头.price;
          头.qty -= 消耗;
          剩余 -= 消耗;
          if (头.qty <= 0) 买入队列[t.symbol].shift();
        }
      }

      const pnl = (t.price * t.qty) - 总成本;
      结果.push({
        ...t,
        pnl,
        买入成本: 总成本,
      });
    }
  });

  return 结果;
}

module.exports = { 计算持仓, 计算全部持仓, 计算盈亏明细 };
