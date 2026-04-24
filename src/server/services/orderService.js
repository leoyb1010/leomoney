/**
 * Leomoney 条件单服务层 v2
 * 接入 Decimal + 状态机 + 冻结账本
 * 条件单创建即冻结资源，触发只做状态流转和执行
 */

const crypto = require('crypto');
const { loadState, withStateTransaction } = require('../repositories/stateRepository');
const { getUnit, getMarketConfig } = require('../domain/models');
const { isActiveAccount } = require('./accountService');
const { ORDER_STATUS, transitionOrder, mapLegacyStatus, isActiveStatus } = require('../domain/orderStateMachine');
const { freezeCash, releaseCash, freezePosition, releasePosition, migrateAccountIfNeeded } = require('../domain/ledger');
const { D, mul, gt, gte, lte, toMoney, toQty, calcBuyReserve, calcFee } = require('../domain/money');
const { executeOrderFill } = require('./tradingService');

const VALID_SIDES = new Set(['buy', 'sell']);
const VALID_TRIGGER_TYPES = new Set(['gte', 'lte']);

function normalizeOrderInput(order) {
  const normalizedSide = String(order.side || order.type || '').toLowerCase();
  const normalizedTriggerType = String(order.triggerType || '').toLowerCase();
  const qty = Number(order.qty);
  const triggerPrice = Number(order.triggerPrice);

  if (!order.symbol) return { ok: false, error: '缺少参数: symbol' };
  if (!VALID_SIDES.has(normalizedSide)) return { ok: false, error: 'side 必须为 buy 或 sell' };
  if (!VALID_TRIGGER_TYPES.has(normalizedTriggerType)) return { ok: false, error: 'triggerType 必须为 gte 或 lte' };
  if (!Number.isFinite(triggerPrice) || triggerPrice <= 0) return { ok: false, error: 'triggerPrice 必须大于 0' };
  if (!Number.isFinite(qty) || qty <= 0) return { ok: false, error: 'qty 必须大于 0' };

  // 数量步进校验
  const category = order.category || 'astocks';
  const cfg = getMarketConfig(category);
  if (cfg.multiple && qty % cfg.step !== 0) {
    return { ok: false, error: `数量必须为${cfg.step}的整数倍` };
  }

  return {
    ok: true,
    order: {
      symbol: String(order.symbol).trim(),
      name: order.name || String(order.symbol).trim(),
      side: normalizedSide,
      type: normalizedSide, // 兼容旧字段
      triggerType: normalizedTriggerType,
      triggerPrice,
      qty,
      category,
    }
  };
}

/**
 * 创建条件单 — 创建即冻结资源
 */
async function createOrder(order) {
  const normalized = normalizeOrderInput(order);
  if (!normalized.ok) return { success: false, error: normalized.error };

  return withStateTransaction((state) => {
    const accountId = state.currentAccountId;
    const account = state.accounts[accountId];
    if (!isActiveAccount(account)) return { success: false, error: '当前账户不存在' };

    // 迁移旧版结构
    migrateAccountIfNeeded(account);

    if (!account.pendingOrders) account.pendingOrders = [];

    const { symbol, name, side, type, triggerType, triggerPrice, qty, category } = normalized.order;

    // ── 冻结资源 ──
    let reservedCash = null;

    try {
      if (side === 'buy') {
        // 买单：冻结现金（含手续费预留）
        reservedCash = calcBuyReserve(triggerPrice, qty);
        freezeCash(account, reservedCash, `条件买单 ${symbol}`);
      } else {
        // 卖单：冻结持仓
        freezePosition(account, symbol, qty, `条件卖单 ${symbol}`);
      }
    } catch (err) {
      return { success: false, error: `资源不足，无法创建条件单: ${err.message}` };
    }

    // ── 创建订单 ──
    const newOrder = {
      id: crypto.randomUUID(),
      symbol, name, side, type, triggerType, triggerPrice, qty, category,
      reservedCash, // 记录冻结金额，用于撤单时释放
      status: ORDER_STATUS.PENDING_TRIGGER,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      // 终态时间戳
      acceptedAt: null,
      filledAt: null,
      canceledAt: null,
      settledAt: null,
      expiredAt: null,
      rejectedAt: null,
      failedAt: null,
      // 执行结果
      executedPrice: null,
      failureReason: null,
      rejectionReason: null,
    };

    account.pendingOrders.push(newOrder);
    account.updatedAt = new Date().toISOString();

    return { success: true, order: newOrder, accountId };
  });
}

/**
 * 取消条件单 — 释放冻结资源
 */
async function cancelOrder(orderId) {
  return withStateTransaction((state) => {
    const accountId = state.currentAccountId;
    const account = state.accounts[accountId];
    if (!isActiveAccount(account)) return { success: false, error: '当前账户不存在' };

    migrateAccountIfNeeded(account);

    if (!account.pendingOrders) return { success: false, error: '无待执行订单' };

    const idx = account.pendingOrders.findIndex(o => o.id === orderId && isActiveStatus(o.status));
    if (idx === -1) return { success: false, error: '订单不存在或已终态' };

    const order = account.pendingOrders[idx];

    // 状态流转
    const transition = transitionOrder(order, ORDER_STATUS.CANCELED, { reason: '用户撤单' });
    if (!transition.success) return { success: false, error: transition.error };

    // ── 释放冻结资源 ──
    try {
      if (order.side === 'buy' && order.reservedCash) {
        releaseCash(account, order.reservedCash, `撤单 ${order.symbol}`);
      } else if (order.side === 'sell') {
        releasePosition(account, order.symbol, order.qty, `撤单 ${order.symbol}`);
      }
    } catch (err) {
      console.error('[OrderService] 撤单释放资源失败:', err.message);
    }

    account.updatedAt = new Date().toISOString();
    return { success: true, message: '订单已取消', orderId, accountId };
  });
}

function getPendingOrders() {
  const state = loadState();
  const accountId = state.currentAccountId;
  const account = state.accounts[accountId];
  if (!isActiveAccount(account)) return [];
  return (account.pendingOrders || []).filter(o => isActiveStatus(o.status));
}

function getAllOrders() {
  const state = loadState();
  const accountId = state.currentAccountId;
  const account = state.accounts[accountId];
  if (!isActiveAccount(account)) return [];
  return account.pendingOrders || [];
}

/**
 * 检查并触发待执行条件单
 * 触发后：状态流转 → 执行成交 → 结算
 * 失败时：释放冻结资源
 */
async function checkPendingOrders(prices) {
  return withStateTransaction((state) => {
    const executed = [];

    for (const [accountId, account] of Object.entries(state.accounts || {})) {
      if (!isActiveAccount(account) || !account.pendingOrders || account.pendingOrders.length === 0) continue;

      migrateAccountIfNeeded(account);

      for (let i = 0; i < account.pendingOrders.length; i++) {
        const order = account.pendingOrders[i];
        if (order.status !== ORDER_STATUS.PENDING_TRIGGER) continue;

        // 兼容旧版状态
        if (order.status === 'pending') {
          order.status = ORDER_STATUS.PENDING_TRIGGER;
        }

        const currentPrice = prices[order.symbol] ?? prices[String(order.symbol).replace(/\.(SS|HK|US)$/i, '')];
        if (!currentPrice) continue;

        // 判断是否触发
        let triggered = false;
        if (order.triggerType === 'gte' && gte(currentPrice, order.triggerPrice)) triggered = true;
        if (order.triggerType === 'lte' && lte(currentPrice, order.triggerPrice)) triggered = true;
        if (!triggered) continue;

        // 状态流转：PENDING_TRIGGER → ACCEPTED
        const acceptResult = transitionOrder(order, ORDER_STATUS.ACCEPTED, { reason: '条件触发' });
        if (!acceptResult.success) {
          transitionOrder(order, ORDER_STATUS.FAILED, { reason: acceptResult.error });
          _releaseOrderResources(account, order);
          executed.push({ accountId, order: { ...order }, result: { success: false, error: acceptResult.error } });
          continue;
        }

        // 执行成交
        const fillResult = executeOrderFill(account, order, currentPrice);

        if (fillResult.success) {
          // 状态流转：ACCEPTED → FILLED → SETTLED
          transitionOrder(order, ORDER_STATUS.FILLED);
          transitionOrder(order, ORDER_STATUS.SETTLED);
          order.executedPrice = toMoney(currentPrice);
        } else {
          // 执行失败
          transitionOrder(order, ORDER_STATUS.FAILED, { reason: fillResult.error });
          order.failureReason = fillResult.error;
          _releaseOrderResources(account, order);
        }

        account.updatedAt = new Date().toISOString();

        const category = order.category || 'astocks';
        executed.push({
          accountId,
          accountName: account.accountName,
          ...order,
          result: {
            success: fillResult.success,
            message: fillResult.success
              ? `[${account.accountName}] ${order.side === 'buy' ? '买入' : '卖出'} ${order.name} ${order.qty}${getUnit(category)} @ ¥${toMoney(currentPrice)}`
              : fillResult.error,
          }
        });
      }
    }

    return executed;
  });
}

/**
 * 释放订单冻结资源（执行失败/过期时调用）
 */
function _releaseOrderResources(account, order) {
  try {
    if ((order.side === 'buy' || order.type === 'buy') && order.reservedCash) {
      releaseCash(account, order.reservedCash, `条件单失败释放 ${order.symbol}`);
    } else if (order.side === 'sell' || order.type === 'sell') {
      releasePosition(account, order.symbol, order.qty, `条件单失败释放 ${order.symbol}`);
    }
  } catch (err) {
    console.error('[OrderService] 释放订单资源失败:', err.message);
  }
}

module.exports = { createOrder, cancelOrder, getPendingOrders, getAllOrders, checkPendingOrders, normalizeOrderInput };
