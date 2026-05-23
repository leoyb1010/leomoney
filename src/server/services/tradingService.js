/**
 * Leomoney 交易服务层 v2
 * 接入 Decimal + 状态机 + 冻结账本
 * 买入/卖出 → 冻结 → 成交 → 结算
 */

const { withStateTransaction } = require('../repositories/stateRepository');
const { getMarketConfig, getUnit } = require('../domain/models');
const { ORDER_STATUS, transitionOrder, mapLegacyStatus } = require('../domain/orderStateMachine');
const { freezeCash, releaseCash, freezePosition, releasePosition, settleBuyFill, settleSellFill, migrateAccountIfNeeded } = require('../domain/ledger');
const { D, mul, gt, lte, toMoney, toQty, calcBuyReserve, calcFee } = require('../domain/money');
const { getRuntimeConfig } = require('../config');
const { SYMBOL_PATTERN } = require('../validation');
const { recordAuditEvent } = require('../audit/auditLog');

function safeDecimal(value) {
  try {
    return D(value ?? 0);
  } catch {
    return null;
  }
}

function validateQty(qty, category) {
  const config = getRuntimeConfig();
  const parsedQty = safeDecimal(qty);
  if (!parsedQty || !parsedQty.isFinite() || parsedQty.lte(0)) return { ok: false, error: '数量必须大于0' };
  if (parsedQty.gt(config.maxOrderQty)) return { ok: false, error: `数量超过系统上限 ${config.maxOrderQty}` };
  const cfg = getMarketConfig(category);
  if (cfg.multiple && parsedQty.mod(cfg.step).gt(0)) return { ok: false, error: `数量必须为${cfg.step}的整数倍` };
  return { ok: true };
}

function buildTradeMeta(stockQuote) {
  const source = stockQuote.source || 'manual';
  const explicitMode = stockQuote.mode || stockQuote.executionMode;
  const automatedSource = ['agent', 'automation', 'scheduler'].includes(String(source).toLowerCase());
  return {
    strategy: stockQuote.strategy || undefined,
    source,
    mode: explicitMode || (automatedSource ? 'unspecified' : 'paper_execution'),
    runId: stockQuote.runId || null,
    decisionId: stockQuote.decisionId || null,
    evidenceRefs: Array.isArray(stockQuote.evidenceRefs) ? stockQuote.evidenceRefs : [],
    riskApproved: stockQuote.riskApproved !== false,
  };
}

function validateTradeIntent(stockQuote, qty, price, side) {
  const config = getRuntimeConfig();
  const symbol = String(stockQuote.symbol || '').trim();
  if (!SYMBOL_PATTERN.test(symbol)) return { ok: false, error: 'symbol 格式无效' };
  const numericPrice = safeDecimal(price);
  const numericQty = safeDecimal(qty);
  if (!numericQty || !numericQty.isFinite() || numericQty.lte(0)) return { ok: false, error: '数量必须大于0' };
  if (!numericPrice || !numericPrice.isFinite() || numericPrice.lte(0)) return { ok: false, error: '无效价格' };
  if (numericPrice.gt(config.maxOrderPrice)) return { ok: false, error: `价格超过系统上限 ${config.maxOrderPrice}` };
  const notional = numericPrice.times(numericQty);
  if (notional.gt(config.maxOrderNotionalCny)) return { ok: false, error: `订单名义金额超过系统上限 ${config.maxOrderNotionalCny}` };

  const meta = buildTradeMeta(stockQuote);
  const automated = ['agent', 'automation', 'scheduler'].includes(String(meta.source || '').toLowerCase()) || !!meta.runId || !!meta.decisionId;
  if (automated) {
    if (meta.mode !== 'paper_execution') {
      return { ok: false, error: '自动化/Agent 交易必须通过 paper_execution 模式，dry-run 或未声明模式不会写入模拟盘' };
    }
    if (!config.paperExecutionEnabled) {
      return { ok: false, error: '当前环境已关闭所有模拟盘写入' };
    }
    if (meta.source === 'agent' && !config.agentPaperExecutionEnabled) {
      return { ok: false, error: 'Agent 直连执行默认关闭，请使用 /api/automation/run 执行闸门或显式启用 LEOMONEY_AGENT_PAPER_EXECUTION_ENABLED=true' };
    }
    if (!meta.riskApproved) {
      return { ok: false, error: '自动化/Agent 交易缺少风控批准' };
    }
  }

  return { ok: true, meta, side };
}

/**
 * 买入 — 即时成交模式
 * 流程：冻结资金 → 成交 → 结算
 */
async function buy(stockQuote, qty, limitPrice = null) {
  const price = limitPrice || stockQuote.price;
  const category = stockQuote.category || 'astocks';
  const intent = validateTradeIntent(stockQuote, qty, price, 'buy');
  if (!intent.ok) return auditAndReturn({ success: false, error: intent.error }, stockQuote, qty, price, 'buy');

  const v = validateQty(qty, category);
  if (!v.ok) return auditAndReturn({ success: false, error: v.error }, stockQuote, qty, price, 'buy');

  const result = await withStateTransaction((state) => {
    const accountId = state.currentAccountId;
    const account = state.accounts[accountId];
    if (!account) return { success: false, error: '当前账户不存在' };

    // 迁移旧版结构
    migrateAccountIfNeeded(account);

    // 计算冻结金额（含手续费预留）
    const reserveCash = calcBuyReserve(price, qty);

    // 冻结资金
    try {
      freezeCash(account, reserveCash, `买入 ${stockQuote.symbol}`);
    } catch (err) {
      return { success: false, error: err.message };
    }

    // 结算买入
    try {
      const result = settleBuyFill(account, {
        symbol: stockQuote.symbol,
        name: stockQuote.name,
        price,
        qty,
        category,
        orderId: null,
        meta: intent.meta,
      });

      // 释放多余的冻结（预留 vs 实际费用差）
      const actualCost = result.totalCost;
      if (gt(reserveCash, actualCost)) {
        releaseCash(account, D(reserveCash).minus(D(actualCost)).toFixed(2), '买入结算退还预留差额');
      }

      return {
        success: true,
        message: `买入 ${stockQuote.name} ${qty}${getUnit(category)} @ ¥${toMoney(price)}`,
        balance: account.cash,
        holding: account.positions[stockQuote.symbol] || null,
        accountId,
      };
    } catch (err) {
      // 结算失败，回滚冻结
      releaseCash(account, reserveCash, '买入结算失败，回滚冻结');
      return { success: false, error: `买入结算失败: ${err.message}` };
    }
  });
  return auditAndReturn(result, stockQuote, qty, price, 'buy');
}

/**
 * 卖出 — 即时成交模式
 * 流程：冻结持仓 → 成交 → 结算
 */
async function sell(stockQuote, qty, limitPrice = null) {
  const price = limitPrice || stockQuote.price;
  const category = stockQuote.category || 'astocks';
  const intent = validateTradeIntent(stockQuote, qty, price, 'sell');
  if (!intent.ok) return auditAndReturn({ success: false, error: intent.error }, stockQuote, qty, price, 'sell');

  const v = validateQty(qty, category);
  if (!v.ok) return auditAndReturn({ success: false, error: v.error }, stockQuote, qty, price, 'sell');

  const result = await withStateTransaction((state) => {
    const accountId = state.currentAccountId;
    const account = state.accounts[accountId];
    if (!account) return { success: false, error: '当前账户不存在' };

    // 迁移旧版结构
    migrateAccountIfNeeded(account);

    // 检查持仓存在
    if (!account.positions[stockQuote.symbol]) {
      return { success: false, error: `持仓不足，可用: 0${getUnit(category)}` };
    }

    // 冻结持仓
    try {
      freezePosition(account, stockQuote.symbol, qty, `卖出 ${stockQuote.symbol}`);
    } catch (err) {
      return { success: false, error: err.message };
    }

    // 结算卖出
    try {
      const result = settleSellFill(account, {
        symbol: stockQuote.symbol,
        name: stockQuote.name,
        price,
        qty,
        category,
        orderId: null,
        meta: intent.meta,
      });

      return {
        success: true,
        message: `卖出 ${stockQuote.name} ${qty}${getUnit(category)} @ ¥${toMoney(price)}`,
        balance: account.cash,
        holding: account.positions[stockQuote.symbol] || null,
        realizedPnl: result.realizedPnl,
        accountId,
      };
    } catch (err) {
      // 结算失败，回滚冻结
      releasePosition(account, stockQuote.symbol, qty, '卖出结算失败，回滚冻结');
      return { success: false, error: `卖出结算失败: ${err.message}` };
    }
  });
  return auditAndReturn(result, stockQuote, qty, price, 'sell');
}

/**
 * 执行订单成交（条件单触发时调用）
 * @param {Object} account - 账户对象（在 withStateTransaction 内）
 * @param {Object} order - 订单对象
 * @param {number|string} currentPrice - 当前价格
 * @returns {Object} 执行结果
 */
function executeOrderFill(account, order, currentPrice) {
  migrateAccountIfNeeded(account);

  const category = order.category || 'astocks';
  const qty = D(order.qty);

  try {
    if (order.side === 'BUY' || order.type === 'buy') {
      // 买单：资金已冻结在创建时，直接结算
      const result = settleBuyFill(account, {
        symbol: order.symbol,
        name: order.name,
        price: currentPrice,
        qty: order.qty,
        category,
        orderId: order.id,
      });

      // 释放多余冻结
      const reserveCash = order.reservedCash || calcBuyReserve(currentPrice, qty);
      const actualCost = result.totalCost;
      if (gt(reserveCash, actualCost)) {
        releaseCash(account, D(reserveCash).minus(D(actualCost)).toFixed(2), '条件单结算退还预留差额');
      }

      return { success: true, ...result };
    } else {
      // 卖单：持仓已冻结在创建时，直接结算
      const result = settleSellFill(account, {
        symbol: order.symbol,
        name: order.name,
        price: currentPrice,
        qty: order.qty,
        category,
        orderId: order.id,
      });

      return { success: true, ...result };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function auditAndReturn(result, stockQuote, qty, price, side) {
  try {
    const meta = buildTradeMeta(stockQuote);
    await recordAuditEvent({
      type: result.success ? 'trade_executed' : 'trade_rejected',
      source: meta.source,
      mode: meta.mode,
      runId: meta.runId,
      decisionId: meta.decisionId,
      symbol: stockQuote.symbol,
      name: stockQuote.name,
      side,
      qty,
      price: price ? toMoney(price) : null,
      result: { success: result.success, error: result.error, accountId: result.accountId },
    });
  } catch (err) {
    console.warn('[TradingService] 审计写入失败:', err.message);
  }
  return result;
}

module.exports = { buy, sell, validateQty, buildTradeMeta, validateTradeIntent, executeOrderFill };
