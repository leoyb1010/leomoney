/**
 * Leomoney 策略模板 — 预设 + 自定义 Prompt
 * 每个策略定义 systemPrompt + 输出 JSON Schema + 风控参数覆盖
 */

const STRATEGIES = {
  // ── 预设策略 ──

  conservative: {
    id: 'conservative',
    name: '保守防守',
    description: '低风险，只在高确定性机会买入，止损严格',
    icon: '🛡️',
    riskLevel: '低',
    promptOverride: null, // 使用默认 AGENT_PROMPT
    riskConfigOverride: {
      maxSinglePositionPct: 0.1,
      maxTotalPositionPct: 0.5,
      defaultStopLossPct: 0.02,
      defaultTakeProfitPct: 0.05,
      maxTradesPerDay: 5,
    },
    confidenceThreshold: 0.8,
  },

  balanced: {
    id: 'balanced',
    name: '均衡策略',
    description: '风险与收益平衡，适合大多数场景',
    icon: '⚖️',
    riskLevel: '中',
    promptOverride: null,
    riskConfigOverride: {
      maxSinglePositionPct: 0.2,
      maxTotalPositionPct: 0.7,
      defaultStopLossPct: 0.03,
      defaultTakeProfitPct: 0.08,
      maxTradesPerDay: 10,
    },
    confidenceThreshold: 0.7,
  },

  aggressive: {
    id: 'aggressive',
    name: '激进进攻',
    description: '高风险高收益，频繁交易，止损较宽',
    icon: '🔥',
    riskLevel: '中高',
    promptOverride: null,
    riskConfigOverride: {
      maxSinglePositionPct: 0.3,
      maxTotalPositionPct: 0.9,
      defaultStopLossPct: 0.05,
      defaultTakeProfitPct: 0.15,
      maxTradesPerDay: 20,
    },
    confidenceThreshold: 0.6,
  },

  momentum: {
    id: 'momentum',
    name: '动量追踪',
    description: '追涨杀跌，顺势而为。趋势确立时加仓，趋势反转时离场',
    icon: '🚀',
    riskLevel: '中',
    promptOverride: `你是一个动量追踪交易助手。

核心逻辑：
- 只做趋势明确的方向：上涨趋势只做多，下跌趋势只做空或观望
- 突破关键位（前高/前低/均线）是重要信号
- 量价配合：放量突破确认趋势，缩量反弹视为假突破
- 追涨不追高：趋势初期介入，而非趋势末期

风控规则：
- 任何交易必须设止损
- 连续2次亏损后降低仓位至半仓
- 大盘弱势时降低整体仓位

输出 JSON：
{
  "action": "买入 | 卖出 | 观望",
  "仓位比例": number (0~1),
  "置信度": number (0~1),
  "原因": string,
  "风险等级": "低 | 中 | 高",
  "趋势判断": "上涨 | 下跌 | 震荡",
  "关键位": string
}`,
    riskConfigOverride: {
      maxSinglePositionPct: 0.25,
      maxTotalPositionPct: 0.8,
      defaultStopLossPct: 0.04,
      defaultTakeProfitPct: 0.12,
      maxTradesPerDay: 12,
    },
    confidenceThreshold: 0.65,
  },

  trend_following: {
    id: 'trend_following',
    name: '趋势跟踪',
    description: '围绕均线、突破与趋势延续做顺势交易，适合美股龙头和高流动性加密现货',
    icon: 'T',
    riskLevel: '中',
    promptOverride: `你是趋势跟踪交易助手。
核心逻辑：
- 只在趋势方向明确时行动，震荡期以观望为主
- 关注 20/60 均线、前高突破、成交量放大和回撤不破位
- 入场后用移动止损保护利润
输出 JSON，字段为 action、仓位比例、置信度、原因、风险等级、趋势判断、止损位、止盈位。`,
    riskConfigOverride: {
      maxSinglePositionPct: 0.22,
      maxTotalPositionPct: 0.75,
      defaultStopLossPct: 0.04,
      defaultTakeProfitPct: 0.12,
      maxTradesPerDay: 10,
    },
    confidenceThreshold: 0.68,
  },

  mean_reversion: {
    id: 'mean_reversion',
    name: '均值回归',
    description: '寻找短期超买/超卖后的价格回归机会，强调小仓位和严格止损',
    icon: 'M',
    riskLevel: '中',
    promptOverride: `你是均值回归交易助手。
核心逻辑：
- 价格偏离均线或情绪过热/过冷时才考虑
- 避免接正在加速下跌的标的
- 只做高流动性标的，仓位轻，止损近
输出 JSON，字段为 action、仓位比例、置信度、原因、风险等级、偏离程度、回归目标、无效条件。`,
    riskConfigOverride: {
      maxSinglePositionPct: 0.12,
      maxTotalPositionPct: 0.45,
      defaultStopLossPct: 0.025,
      defaultTakeProfitPct: 0.055,
      maxTradesPerDay: 8,
    },
    confidenceThreshold: 0.72,
  },

  grid_hint: {
    id: 'grid_hint',
    name: '网格提示',
    description: '仅生成区间和网格建议，不做高频自动交易，适合震荡市场观察',
    icon: 'G',
    riskLevel: '中',
    promptOverride: `你是网格交易提示助手。
核心逻辑：
- 只在震荡区间清晰、波动适中时给出网格建议
- 不自动高频下单，只输出区间、层数、单格风险和暂停条件
输出 JSON，字段为 action、仓位比例、置信度、原因、风险等级、区间上沿、区间下沿、网格层数、暂停条件。`,
    riskConfigOverride: {
      maxSinglePositionPct: 0.1,
      maxTotalPositionPct: 0.35,
      defaultStopLossPct: 0.03,
      defaultTakeProfitPct: 0.05,
      maxTradesPerDay: 6,
    },
    confidenceThreshold: 0.74,
  },

  dca: {
    id: 'dca',
    name: 'DCA 定投',
    description: '按计划分批投入，弱化择时，适合长期观察仓位',
    icon: '$',
    riskLevel: '低中',
    promptOverride: `你是 DCA 定投助手。
核心逻辑：
- 优先评估是否适合分批，而不是一次性买入
- 市场极端过热时建议延后或降低单次金额
- 下跌但基本面/长期逻辑未变时允许小额分批
输出 JSON，字段为 action、仓位比例、置信度、原因、风险等级、本次比例、下次观察条件。`,
    riskConfigOverride: {
      maxSinglePositionPct: 0.08,
      maxTotalPositionPct: 0.55,
      defaultStopLossPct: 0.08,
      defaultTakeProfitPct: 0.18,
      maxTradesPerDay: 4,
    },
    confidenceThreshold: 0.62,
  },

  event_driven: {
    id: 'event_driven',
    name: '事件驱动',
    description: '基于新闻、公告、政策等事件做短期博弈',
    icon: '📰',
    riskLevel: '中',
    promptOverride: `你是一个事件驱动交易助手。

核心逻辑：
- 重大新闻/公告是主要信号源
- 政策变化、业绩超预期、行业利好是核心催化剂
- 事件影响分为：短期情绪（1-3天）和中期趋势（1-4周）
- 利好出尽是利空，注意逆向思维

决策规则：
- 事件明确+市场反应初期 → 顺势操作
- 事件模糊+市场已充分反应 → 观望
- 突发黑天鹅 → 先避险，再评估

输出 JSON：
{
  "action": "买入 | 卖出 | 观望",
  "仓位比例": number (0~1),
  "置信度": number (0~1),
  "原因": string,
  "风险等级": "低 | 中 | 高",
  "事件类型": "政策 | 财报 | 行业 | 黑天鹅 | 无",
  "事件影响": "短期 | 中期 | 不确定"
}`,
    riskConfigOverride: {
      maxSinglePositionPct: 0.15,
      maxTotalPositionPct: 0.6,
      defaultStopLossPct: 0.03,
      defaultTakeProfitPct: 0.06,
      maxTradesPerDay: 8,
    },
    confidenceThreshold: 0.75,
  },
};

/**
 * 获取所有策略列表（不含 promptOverride 大文本）
 */
function listStrategies() {
  return Object.values(STRATEGIES).map(s => ({
    id: s.id,
    name: s.name,
    description: s.description,
    icon: s.icon,
    riskLevel: s.riskLevel,
    confidenceThreshold: s.confidenceThreshold,
  }));
}

/**
 * 获取策略详情
 */
function getStrategy(id) {
  return STRATEGIES[id] || null;
}

/**
 * 生成自定义策略
 * @param {Object} customConfig - { name, description, systemPrompt, riskConfig, confidenceThreshold }
 */
function createCustomStrategy(customConfig) {
  return {
    id: 'custom_' + Date.now(),
    name: customConfig.name || '自定义策略',
    description: customConfig.description || '用户自定义策略',
    icon: '🎯',
    riskLevel: customConfig.riskLevel || '中',
    promptOverride: customConfig.systemPrompt || null,
    riskConfigOverride: customConfig.riskConfig || null,
    confidenceThreshold: customConfig.confidenceThreshold || 0.7,
    isCustom: true,
  };
}

/**
 * 获取策略的完整 systemPrompt
 * 如果策略有 promptOverride 则用之，否则用默认的
 */
function getStrategyPrompt(strategyId, defaultPrompt) {
  const strategy = STRATEGIES[strategyId];
  if (!strategy) return defaultPrompt;
  return strategy.promptOverride || defaultPrompt;
}

module.exports = { STRATEGIES, listStrategies, getStrategy, createCustomStrategy, getStrategyPrompt };
