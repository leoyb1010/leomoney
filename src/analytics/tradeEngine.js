/**
 * Leomoney - 交易分析总入口
 * 汇总持仓计算 + 指标计算 + Agent 决策
 */

const { 计算持仓, 计算全部持仓, 计算盈亏明细 } = require('./position');
const { 计算指标, 按策略统计 } = require('./metrics');

/**
 * 分析交易 - 核心入口
 * @param {Array} trades - 交易记录数组
 * @returns {Object} { 持仓, 指标, 盈亏明细, 策略统计 }
 */
function 分析交易(trades) {
  const 持仓 = 计算全部持仓(trades);
  const 指标 = 计算指标(trades, 持仓);
  const 盈亏明细 = 计算盈亏明细(trades);
  const 策略统计 = 按策略统计(trades);

  return {
    持仓,
    指标,
    盈亏明细,
    策略统计,
  };
}

/**
 * 生成 Agent 总结
 * @param {Object} 分析结果 - 分析交易 的返回值
 * @returns {Object} 结构化总结
 */
function 生成Agent总结(分析结果) {
  const { 指标 } = 分析结果;

  // 判定状态
  let 状态 = '无数据';
  if (指标.交易次数 > 0) {
    if (指标.胜率 === null) 状态 = '数据不足';
    else if (指标.胜率 > 0.6) 状态 = '良好';
    else if (指标.胜率 > 0.4) 状态 = '一般';
    else 状态 = '较差';
  }

  // 判定风险
  let 风险 = '低';
  if (指标.最大回撤 !== null) {
    if (指标.最大回撤 < -0.15) 风险 = '高';
    else if (指标.最大回撤 < -0.05) 风险 = '中';
  }

  return {
    表现: {
      总收益: 指标.总收益,
      胜率: 指标.胜率,
      盈亏比: 指标.盈亏比,
      最大回撤: 指标.最大回撤,
      交易次数: 指标.交易次数,
    },
    评估: {
      状态,
      风险,
    },
  };
}

/**
 * Agent 决策提示词
 */
const AGENT_PROMPT = `你是一个交易决策助手。

你的目标：
- 在控制风险的前提下提升收益
- 避免频繁交易
- 避免在不确定情况下做决策

你会收到：
1）当前持仓
2）交易表现指标
3）市场信息

你的任务：
基于这些信息，输出一个交易决策。

决策规则：
- 趋势明确且无仓位，可以考虑买入
- 已盈利且趋势减弱，可以考虑卖出
- 不确定必须观望
- 禁止输出模糊建议

输出必须是 JSON，格式如下：

{
  "action": "买入 | 卖出 | 观望",
  "仓位比例": number (0~1),
  "置信度": number (0~1),
  "原因": string,
  "风险等级": "低 | 中 | 高"
}

禁止输出 JSON 以外内容。`;

/**
 * 生成 Agent 决策输入数据
 * @param {Object} 分析结果 - 分析交易 的返回值
 * @param {Object} marketData - 市场行情数据
 * @returns {Object} Agent 输入数据
 */
function 生成决策输入(分析结果, marketData) {
  return {
    持仓: 分析结果.持仓,
    指标: 分析结果.指标,
    市场: marketData,
  };
}

module.exports = {
  分析交易,
  生成Agent总结,
  生成决策输入,
  AGENT_PROMPT,
};
