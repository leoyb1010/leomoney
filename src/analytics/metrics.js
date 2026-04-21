/**
 * Leomoney - 交易指标计算模块
 * 核心指标：胜率、盈亏比、平均盈利/亏损、最大回撤
 * 按策略统计
 */

/**
 * 计算交易核心指标
 * @param {Array} trades - 交易记录数组
 * @param {Object} 持仓 - 计算持仓结果（可选）
 * @returns {Object} 指标对象
 */
function 计算指标(trades, 持仓) {
  // 从交易记录中提取有 pnl 的（已完成交易）
  const sellTrades = trades.filter(t => t.type === 'sell');

  if (sellTrades.length === 0) {
    return {
      总收益: null,
      胜率: null,
      交易次数: 0,
      盈利次数: 0,
      亏损次数: 0,
      平均盈利: null,
      平均亏损: null,
      盈亏比: null,
      最大回撤: null,
    };
  }

  // 计算每笔卖出的盈亏（简化：用 avgCost 对比）
  let 盈利次数 = 0;
  let 亏损次数 = 0;
  let 总盈利额 = 0;
  let 总亏损额 = 0;
  let 总收益 = 0;

  // 资金曲线用于计算最大回撤
  let 资金曲线 = [0];
  let 累计 = 0;

  const buyMap = {}; // symbol -> [{price, qty}]

  // 先按时间正序处理
  const sorted = [...trades].sort((a, b) => new Date(a.time) - new Date(b.time));

  sorted.forEach(t => {
    if (t.type === 'buy') {
      if (!buyMap[t.symbol]) buyMap[t.symbol] = [];
      buyMap[t.symbol].push({ price: t.price, qty: t.qty });
    } else if (t.type === 'sell') {
      // FIFO 计算成本
      let 剩余 = t.qty;
      let 成本 = 0;
      if (buyMap[t.symbol]) {
        while (剩余 > 0 && buyMap[t.symbol].length > 0) {
          const 头 = buyMap[t.symbol][0];
          const 消耗 = Math.min(剩余, 头.qty);
          成本 += 消耗 * 头.price;
          头.qty -= 消耗;
          剩余 -= 消耗;
          if (头.qty <= 0) buyMap[t.symbol].shift();
        }
      }
      const pnl = (t.price * t.qty) - 成本;
      总收益 += pnl;
      累计 += pnl;
      资金曲线.push(累计);

      if (pnl > 0) { 盈利次数++; 总盈利额 += pnl; }
      if (pnl < 0) { 亏损次数++; 总亏损额 += Math.abs(pnl); }
    }
  });

  const 已完成 = 盈利次数 + 亏损次数;
  const 胜率 = 已完成 > 0 ? 盈利次数 / 已完成 : null;
  const 平均盈利 = 盈利次数 > 0 ? 总盈利额 / 盈利次数 : null;
  const 平均亏损 = 亏损次数 > 0 ? 总亏损额 / 亏损次数 : null;
  const 盈亏比 = (平均盈利 !== null && 平均亏损 !== null && 平均亏损 > 0)
    ? 平均盈利 / 平均亏损
    : null;

  // 最大回撤
  const 最大回撤 = 计算最大回撤(资金曲线);

  return {
    总收益,
    胜率,
    交易次数: 已完成,
    盈利次数,
    亏损次数,
    平均盈利,
    平均亏损,
    盈亏比,
    最大回撤,
  };
}

/**
 * 计算最大回撤
 * @param {Array} 曲线 - 累计收益曲线
 * @returns {number|null} 最大回撤比例（负数）
 */
function 计算最大回撤(曲线) {
  if (!曲线 || 曲线.length < 2) return null;

  let 峰值 = 曲线[0];
  let 最大跌幅 = 0;

  for (let i = 1; i < 曲线.length; i++) {
    if (曲线[i] > 峰值) 峰值 = 曲线[i];
    const 跌幅 = 峰值 !== 0 ? (曲线[i] - 峰值) / Math.abs(峰值) : 0;
    if (跌幅 < 最大跌幅) 最大跌幅 = 跌幅;
  }

  return 最大跌幅 !== 0 ? 最大跌幅 : null;
}

/**
 * 按策略统计交易表现
 * @param {Array} trades - 交易记录（可选 strategy 字段）
 * @returns {Object} { 策略名: { 总收益, 胜率, 交易次数 } }
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
