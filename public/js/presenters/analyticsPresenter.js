/**
 * Leomoney 复盘解释层
 * 在纯数字指标之上增加中文洞察
 */

/**
 * 构建复盘解释
 * @param {Object} metrics - { 总收益, 胜率, 盈亏比, 最大回撤, 交易次数 }
 * @returns {string[]} 中文洞察数组
 */
export function 构建复盘解释(metrics) {
  const insights = [];

  if ((metrics.totalTrades || metrics.交易次数 || 0) < 5) {
    insights.push('当前交易样本较少，分析结论仅供参考。');
  }

  if ((metrics.winRate || metrics.胜率 || 0) >= 0.6 && (metrics.profitFactor || metrics.盈亏比 || 0) < 1.2) {
    insights.push('胜率较高，但盈亏比偏弱，可能存在赚小亏大的问题。');
  }

  if ((metrics.maxDrawdown || metrics.最大回撤 || 0) <= -0.15) {
    insights.push('最大回撤偏高，建议降低仓位集中度并减少连续追单。');
  }

  if ((metrics.winRate || metrics.胜率 || 0) >= 0.5 && (metrics.profitFactor || metrics.盈亏比 || 0) >= 1.5) {
    insights.push('胜率和盈亏比均表现良好，当前策略框架有效。');
  }

  if (!insights.length) {
    insights.push('当前交易表现较均衡，建议继续关注仓位控制与交易节奏。');
  }

  return insights;
}
