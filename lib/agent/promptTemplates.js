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
