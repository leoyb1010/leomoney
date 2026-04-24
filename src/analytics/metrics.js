/**
 * Leomoney - 交易指标计算模块 v2
 * 改造点：
 *   1. 最大回撤基于权益曲线（不是累计收益曲线）
 *   2. 统一使用 Decimal 计算
 *   3. 支持手续费占比、滑点损耗
 */

const { D, add, sub, mul, div, gt, lt, toMoney } = require('../server/domain/money');

/**
 * 计算交易核心指标
 * @param {Array} trades - 交易记录数组
 * @param {number} [initialEquity] - 初始权益（用于计算权益曲线）
 * @returns {Object} 指标对象
 */
function 计算指标(trades, initialEquity = 100000) {
  const sellTrades = trades.filter(t => t.type === 'sell');

  if (sellTrades.length === 0) {
    return {
      总收益: null, 胜率: null, 交易次数: 0, 盈利次数: 0, 亏损次数: 0,
      平均盈利: null, 平均亏损: null, 盈亏比: null,
      最大回撤: null, 权益曲线: [initialEquity],
    };
  }

  let 盈利次数 = 0, 亏损次数 = 0;
  let 总盈利额 = D(0), 总亏损额 = D(0), 总收益 = D(0);
  let 总手续费 = D(0);

  // 权益曲线 = 初始资金 + 累计已实现盈亏
  const 权益曲线 = [D(initialEquity)];
  let 累计 = D(0);

  const buyMap = {};
  const sorted = [...trades].sort((a, b) => new Date(a.time || 0) - new Date(b.time || 0));

  sorted.forEach(t => {
    if (t.type === 'buy') {
      if (!buyMap[t.symbol]) buyMap[t.symbol] = [];
      buyMap[t.symbol].push({ price: t.price, qty: D(t.qty) });
      if (t.fee) 总手续费 = 总手续费.plus(t.fee);
    } else if (t.type === 'sell') {
      let 剩余 = D(t.qty);
      let 成本 = D(0);
      if (buyMap[t.symbol]) {
        while (剩余.gt(0) && buyMap[t.symbol].length > 0) {
          const 头 = buyMap[t.symbol][0];
          const 可用 = D(头.qty);
          const 消耗 = 可用.gt(剩余) ? 剩余 : 可用;
          成本 = 成本.plus(消耗.mul(头.price));
          头.qty = 可用.minus(消耗).toFixed(8);
          剩余 = 剩余.minus(消耗);
          if (D(头.qty).lte(0)) buyMap[t.symbol].shift();
        }
      }
      const pnl = D(t.price).mul(t.qty).minus(成本);
      if (t.fee) pnl.minus(t.fee);
      总收益 = 总收益.plus(pnl);
      累计 = 累计.plus(pnl);
      权益曲线.push(D(initialEquity).plus(累计));

      if (pnl.gt(0)) { 盈利次数++; 总盈利额 = 总盈利额.plus(pnl); }
      if (pnl.lt(0)) { 亏损次数++; 总亏损额 = 总亏损额.plus(pnl.abs()); }
      if (t.fee) 总手续费 = 总手续费.plus(t.fee);
    }
  });

  const 已完成 = 盈利次数 + 亏损次数;
  const 胜率 = 已完成 > 0 ? 盈利次数 / 已完成 : null;
  const 平均盈利 = 盈利次数 > 0 ? div(总盈利额, 盈利次数) : null;
  const 平均亏损 = 亏损次数 > 0 ? div(总亏损额, 亏损次数) : null;
  const 盈亏比 = (平均盈利 !== null && 平均亏损 !== null && 平均亏损.gt(0))
    ? div(平均盈利, 平均亏损).toNumber()
    : null;

  // 最大回撤基于权益曲线
  const 最大回撤 = 计算最大回撤(权益曲线.map(x => x.toNumber()));

  return {
    总收益: toMoney(总收益),
    胜率: 胜率 !== null ? (胜率 * 100).toFixed(1) + '%' : null,
    交易次数: 已完成,
    盈利次数,
    亏损次数,
    平均盈利: 平均盈利 !== null ? toMoney(平均盈利) : null,
    平均亏损: 平均亏损 !== null ? toMoney(平均亏损) : null,
    盈亏比: 盈亏比 !== null ? 盈亏比.toFixed(2) : null,
    最大回撤: 最大回撤 !== null ? (最大回撤 * 100).toFixed(2) + '%' : null,
    手续费占比: 总收益.gt(0) ? toMoney(div(总手续费, 总收益).times(100)) + '%' : 'N/A',
    权益曲线: 权益曲线.map(x => x.toNumber()),
  };
}

/**
 * 计算最大回撤（基于权益曲线）
 * @param {Array<number>} equityCurve - 权益曲线数组
 * @returns {number|null} 最大回撤比例（负数）
 */
function 计算最大回撤(equityCurve) {
  if (!equityCurve || equityCurve.length < 2) return null;

  let peak = equityCurve[0];
  let maxDD = 0;

  for (const equity of equityCurve) {
    if (equity > peak) peak = equity;
    if (peak <= 0) continue;
    const dd = (equity - peak) / peak;
    if (dd < maxDD) maxDD = dd;
  }

  return maxDD !== 0 ? maxDD : null;
}

/**
 * 按策略统计交易表现
 */
function 按策略统计(trades) {
  const 策略分组 = {};
  trades.forEach(t => {
    const 策略 = t.strategy || '默认';
    if (!策略分组[策略]) 策略分组[策略] = [];
    策略分组[策略].push(t);
  });

  const 结果 = {};
  Object.entries(策略分组).forEach(([策略, 交易组]) => {
    结果[策略] = 计算指标(交易组);
  });
  return 结果;
}

module.exports = { 计算指标, 计算最大回撤, 按策略统计 };
