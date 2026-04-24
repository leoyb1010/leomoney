/**
 * Leomoney Agent Schema 校验
 * 对 LLM 输出做严格解析，失败时安全降级为 HOLD
 */

const VALID_ACTIONS = ['BUY', 'SELL', 'HOLD', 'CANCEL_ORDER'];
const VALID_ORDER_TYPES = ['MARKET', 'LIMIT', 'STOP'];

// 中英文动作映射
const ACTION_ALIASES = {
  '买入': 'BUY', '卖出': 'SELL', '观望': 'HOLD', '持有': 'HOLD', '取消': 'CANCEL_ORDER',
  'BUY': 'BUY', 'SELL': 'SELL', 'HOLD': 'HOLD', 'CANCEL_ORDER': 'CANCEL_ORDER',
};

/**
 * 解析并校验 LLM 输出
 * @param {string} rawOutput - LLM 原始输出
 * @returns {{ success: boolean, action: Object, error?: string, rawOutput: string }}
 */
function parseAgentAction(rawOutput) {
  if (!rawOutput || typeof rawOutput !== 'string') {
    return { success: false, action: makeHoldAction('输出为空'), error: '输出为空', rawOutput: rawOutput || '' };
  }

  let parsed = null;

  // 尝试 1：直接 JSON 解析
  try {
    parsed = JSON.parse(rawOutput);
  } catch {
    // 尝试 2：提取 JSON 代码块
    const blockMatch = rawOutput.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (blockMatch) {
      try { parsed = JSON.parse(blockMatch[1].trim()); } catch {}
    }
    // 尝试 3：提取第一个 { ... }
    if (!parsed) {
      const braceMatch = rawOutput.match(/\{[\s\S]*\}/);
      if (braceMatch) {
        try { parsed = JSON.parse(braceMatch[0]); } catch {}
      }
    }
  }

  if (!parsed || typeof parsed !== 'object') {
    return { success: false, action: makeHoldAction('无法解析为 JSON'), error: '无法解析为 JSON', rawOutput };
  }

  // 字段校验 — 支持中英文动作
  const rawAction = (parsed.action || parsed.动作 || 'HOLD').toString().trim();
  const action = ACTION_ALIASES[rawAction] || ACTION_ALIASES[rawAction.toUpperCase()] || rawAction.toUpperCase();
  if (!VALID_ACTIONS.includes(action)) {
    return { success: false, action: makeHoldAction(`非法动作: ${action}`), error: `非法动作: ${action}`, rawOutput, parsed };
  }

  let confidence = Number(parsed.confidence || parsed.置信度 || 0);
  // 置信度兼容：>1 视为百分比（如 70 → 0.7）
  if (confidence > 1) confidence = confidence / 100;
  if (isNaN(confidence) || confidence < 0 || confidence > 1) {
    return { success: false, action: makeHoldAction('置信度非法'), error: '置信度非法', rawOutput, parsed };
  }

  // 构建标准化 action
  const result = {
    schemaVersion: 'v1',
    action,
    symbol: (parsed.symbol || parsed.标的 || null),
    qty: String(parsed.qty || parsed.数量 || parsed.仓位比例 || '0'),
    orderType: (parsed.orderType || parsed.订单类型 || 'MARKET').toString().toUpperCase(),
    limitPrice: parsed.limitPrice ? String(parsed.limitPrice) : null,
    confidence,
    thesis: String(parsed.thesis || parsed.原因 || parsed.reason || ''),
    riskNotes: Array.isArray(parsed.riskNotes) ? parsed.riskNotes : [],
    basedOn: {
      market: !!parsed.basedOn?.market || !!parsed.基于行情,
      position: !!parsed.basedOn?.position || !!parsed.基于持仓,
      account: !!parsed.basedOn?.account || !!parsed.基于账户,
      risk: !!parsed.basedOn?.risk || !!parsed.基于风控,
      news: !!parsed.basedOn?.news || !!parsed.基于新闻,
    },
  };

  // 买入/卖出必须带 symbol
  if ((action === 'BUY' || action === 'SELL') && !result.symbol) {
    return { success: false, action: makeHoldAction('BUY/SELL 缺少 symbol'), error: 'BUY/SELL 缺少 symbol', rawOutput, parsed };
  }

  return { success: true, action: result, rawOutput, parsed };
}

function makeHoldAction(reason) {
  return {
    schemaVersion: 'v1',
    action: 'HOLD',
    symbol: null,
    qty: '0',
    orderType: null,
    limitPrice: null,
    confidence: 0,
    thesis: `[降级] ${reason}`,
    riskNotes: [],
    basedOn: { market: false, position: false, account: false, risk: false, news: false },
  };
}

module.exports = { parseAgentAction, makeHoldAction, VALID_ACTIONS };
