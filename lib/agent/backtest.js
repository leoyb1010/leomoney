/**
 * Leomoney 多策略回测引擎 v3
 * 基于历史交易数据回测不同策略的表现
 * 
 * 支持的回测维度：
 *   - 按策略分组（保守/均衡/激进/动量/事件驱动）
 *   - 时间窗口（最近7天/30天/全部）
 *   - 收益率/胜率/最大回撤/夏普比率
 */

const { D, toMoney } = require('../../src/server/domain/money');
const { getAccount } = require('../../src/server/services/accountService');
const { listStrategies, getStrategy } = require('./promptTemplates');

/**
 * 回测结果
 * @typedef {Object} BacktestResult
 * @property {string} strategyId - 策略ID
 * @property {string} strategyName - 策略名称
 * @property {number} totalTrades - 总交易次数
 * @property {number} winningTrades - 盈利交易次数
 * @property {number} losingTrades - 亏损交易次数
 * @property {number} winRate - 胜率 (0-1)
 * @property {string} totalPnL - 总盈亏
 * @property {string} avgPnL - 平均盈亏
 * @property {number} maxDrawdown - 最大回撤
 * @property {number} sharpeRatio - 夏普比率（简化版）
 * @property {number} profitFactor - 盈亏比
 * @property {Array} trades - 交易明细
 */

/**
 * 执行单策略回测
 * @param {string} strategyId - 策略ID
 * @param {Object} [options] - 回测选项
 * @param {string} [options.period='all'] - 时间窗口 '7d'|'30d'|'all'
 * @param {string} [options.accountId] - 账户ID
 * @returns {BacktestResult}
 */
function backtestStrategy(strategyId, options = {}) {
  const account = getAccount();
  if (!account) return { error: '账户不存在' };

  const strategy = getStrategy(strategyId);
  const history = account.history || [];
  
  // 按策略过滤交易记录
  let trades = history.filter(t => {
    // 策略字段匹配
    const tradeStrategy = t.strategy || '';
    if (!tradeStrategy.includes(strategyId) && !tradeStrategy.includes(strategy?.name || '__none__')) return false;
    return true;
  });

  // 时间窗口过滤
  if (options.period === '7d') {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    trades = trades.filter(t => new Date(t.timestamp || t.time).getTime() >= cutoff);
  } else if (options.period === '30d') {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    trades = trades.filter(t => new Date(t.timestamp || t.time).getTime() >= cutoff);
  }

  return _calculateMetrics(strategyId, strategy?.name || strategyId, trades);
}

/**
 * 全策略对比回测
 * @param {Object} [options] - 回测选项
 * @returns {BacktestResult[]}
 */
function backtestAll(options = {}) {
  const strategies = listStrategies();
  const results = [];

  for (const s of strategies) {
    const result = backtestStrategy(s.id, options);
    if (!result.error) results.push(result);
  }

  // 无策略标记的交易归类为"手动交易"
  const account = getAccount();
  const allTrades = account?.history || [];
  const manualTrades = allTrades.filter(t => !t.strategy || t.strategy === 'manual');
  if (manualTrades.length > 0) {
    results.push(_calculateMetrics('manual', '手动交易', manualTrades));
  }

  // 按总盈亏排序
  results.sort((a, b) => Number(b.totalPnL) - Number(a.totalPnl));

  return results;
}

/**
 * 计算策略指标
 */
function _calculateMetrics(strategyId, strategyName, trades) {
  if (trades.length === 0) {
    return {
      strategyId, strategyName,
      totalTrades: 0, winningTrades: 0, losingTrades: 0,
      winRate: 0, totalPnL: '0.00', avgPnL: '0.00',
      maxDrawdown: 0, sharpeRatio: 0, profitFactor: 0,
      trades: [],
    };
  }

  let totalPnL = D(0);
  let winningTrades = 0;
  let losingTrades = 0;
  let totalWin = D(0);
  let totalLoss = D(0);
  let maxDrawdown = 0;
  let peak = D(0);
  const pnlSeries = [];

  for (const trade of trades) {
    const pnl = D(trade.pnl || trade.realizedPnl || 0);
    totalPnL = totalPnL.plus(pnl);
    pnlSeries.push(pnl);

    if (pnl.gt(0)) {
      winningTrades++;
      totalWin = totalWin.plus(pnl);
    } else if (pnl.lt(0)) {
      losingTrades++;
      totalLoss = totalLoss.plus(pnl.abs());
    }

    // 最大回撤计算
    if (totalPnL.gt(peak)) peak = totalPnL;
    const drawdown = peak.minus(totalPnL).div(peak.gt(0) ? peak : D(1)).toNumber();
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }

  const winRate = trades.length > 0 ? winningTrades / trades.length : 0;
  const avgPnL = D(totalPnL).div(trades.length);
  const profitFactor = totalLoss.gt(0) ? totalWin.div(totalLoss).toNumber() : totalWin.gt(0) ? Infinity : 0;

  // 简化夏普比率（假设无风险利率=0）
  let sharpeRatio = 0;
  if (pnlSeries.length > 1) {
    const mean = totalPnL.div(pnlSeries.length);
    let variance = D(0);
    for (const p of pnlSeries) {
      variance = variance.plus(p.minus(mean).pow(2));
    }
    const stdDev = variance.div(pnlSeries.length - 1).sqrt();
    sharpeRatio = stdDev.gt(0) ? mean.div(stdDev).toNumber() : 0;
  }

  return {
    strategyId,
    strategyName,
    totalTrades: trades.length,
    winningTrades,
    losingTrades,
    winRate: parseFloat(winRate.toFixed(4)),
    totalPnL: toMoney(totalPnL),
    avgPnL: toMoney(avgPnL),
    maxDrawdown: parseFloat(maxDrawdown.toFixed(4)),
    sharpeRatio: parseFloat(sharpeRatio.toFixed(2)),
    profitFactor: parseFloat(profitFactor.toFixed(2)),
    trades: trades.slice(0, 100),
  };
}

module.exports = { backtestStrategy, backtestAll };
