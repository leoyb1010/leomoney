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

function validateQty(qty, category) {
  if (!qty || D(qty).lte(0)) return { ok: false, error: '数量必须大于0' };
  const cfg = getMarketConfig(category);
  if (cfg.multiple && D(qty).mod(cfg.step).gt(0)) return { ok: false, error: `数量必须为${cfg.step}的整数倍` };
  return { ok: true };
}

function buildTradeMeta(stockQuote) {
  return {
    strategy: stockQuote.strategy || undefined,
    source: stockQuote.source || 'manual',
    mode: stockQuote.mode || stockQuote.executionMode || 'paper_execution',
    runId: stockQuote.runId || null,
    decisionId: stockQuote.decisionId || null,
    evidenceRefs: Array.isArray(stockQuote.evidenceRefs) ? stockQuote.evidenceRefs : [],
    riskApproved: stockQuote.riskApproved !== false,
  };
}

/**
 * 买入 — 即时成交模式
 * 流程：冻结资金 → 成交 → 结算
 */
async function buy(stockQuote, qty, limitPrice = null) {
  const price = limitPrice || stockQuote.price;
  const category = stockQuote.category || 'astocks';
  if (!price || D(price).lte(0)) return { success: false, error: '无效价格' };

  const v = validateQty(qty, category);
  if (!v.ok) return { success: false, error: v.error };

  return withStateTransaction((state) => {
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
}

/**
 * 卖出 — 即时成交模式
 * 流程：冻结持仓 → 成交 → 结算
 */
async function sell(stockQuote, qty, limitPrice = null) {
  const price = limitPrice || stockQuote.price;
  const category = stockQuote.category || 'astocks';
  if (!price || D(price).lte(0)) return { success: false, error: '无效价格' };

  const v = validateQty(qty, category);
  if (!v.ok) return { success: false, error: v.error };

  return withStateTransaction((state) => {
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

module.exports = { buy, sell, validateQty, buildTradeMeta, executeOrderFill };
