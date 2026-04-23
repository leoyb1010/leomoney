/**
 * Leomoney 条件单服务层
 * 创建、取消、查询、触发检查
 */

const crypto = require('crypto');
const { loadState, withStateTransaction } = require('../repositories/stateRepository');
const { getUnit } = require('../domain/models');
const { isActiveAccount } = require('./accountService');

const VALID_ORDER_TYPES = new Set(['buy', 'sell']);
const VALID_TRIGGER_TYPES = new Set(['gte', 'lte']);

function normalizeOrderInput(order) {
  const normalizedType = String(order.type || '').toLowerCase();
  const normalizedTriggerType = String(order.triggerType || '').toLowerCase();
  const qty = Number(order.qty);
  const triggerPrice = Number(order.triggerPrice);

  if (!order.symbol) return { ok: false, error: '缺少参数: symbol' };
  if (!VALID_ORDER_TYPES.has(normalizedType)) return { ok: false, error: 'type 必须为 buy 或 sell' };
  if (!VALID_TRIGGER_TYPES.has(normalizedTriggerType)) return { ok: false, error: 'triggerType 必须为 gte 或 lte' };
  if (!Number.isFinite(triggerPrice) || triggerPrice <= 0) return { ok: false, error: 'triggerPrice 必须大于 0' };
  if (!Number.isFinite(qty) || qty <= 0) return { ok: false, error: 'qty 必须大于 0' };

  return {
    ok: true,
    order: {
      symbol: String(order.symbol).trim(),
      name: order.name || String(order.symbol).trim(),
      type: normalizedType,
      triggerType: normalizedTriggerType,
      triggerPrice,
      qty,
      category: order.category || 'astocks',
    }
  };
}

async function createOrder(order) {
  const normalized = normalizeOrderInput(order);
  if (!normalized.ok) return { success: false, error: normalized.error };

  return withStateTransaction((state) => {
    const accountId = state.currentAccountId;
    const account = state.accounts[accountId];
    if (!isActiveAccount(account)) return { success: false, error: '当前账户不存在' };
    if (!account.pendingOrders) account.pendingOrders = [];

    const newOrder = {
      id: crypto.randomUUID(),
      ...normalized.order,
      status: 'pending',
      createdAt: new Date().toISOString(),
      failedReason: null,
      executedAt: null,
      executedPrice: null,
    };
    account.pendingOrders.push(newOrder);
    account.updatedAt = new Date().toISOString();
    return { success: true, order: newOrder, accountId };
  });
}

async function cancelOrder(orderId) {
  return withStateTransaction((state) => {
    const accountId = state.currentAccountId;
    const account = state.accounts[accountId];
    if (!isActiveAccount(account)) return { success: false, error: '当前账户不存在' };
    if (!account.pendingOrders) return { success: false, error: '无待执行订单' };

    const idx = account.pendingOrders.findIndex(o => o.id === orderId && o.status === 'pending');
    if (idx === -1) return { success: false, error: '订单不存在或已执行' };

    account.pendingOrders[idx].status = 'cancelled';
    account.pendingOrders[idx].updatedAt = new Date().toISOString();
    account.updatedAt = new Date().toISOString();
    return { success: true, message: '订单已取消', accountId };
  });
}

function getPendingOrders() {
  const state = loadState();
  const accountId = state.currentAccountId;
  const account = state.accounts[accountId];
  if (!isActiveAccount(account)) return [];
  return (account.pendingOrders || []).filter(o => o.status === 'pending');
}

function getAllOrders() {
  const state = loadState();
  const accountId = state.currentAccountId;
  const account = state.accounts[accountId];
  if (!isActiveAccount(account)) return [];
  return account.pendingOrders || [];
}

async function checkPendingOrders(prices) {
  return withStateTransaction((state) => {
    const executed = [];

    for (const [accountId, account] of Object.entries(state.accounts || {})) {
      if (!isActiveAccount(account) || !account.pendingOrders || account.pendingOrders.length === 0) continue;

      for (let i = 0; i < account.pendingOrders.length; i++) {
        const order = account.pendingOrders[i];
        if (order.status !== 'pending') continue;

        const currentPrice = prices[order.symbol] ?? prices[String(order.symbol).replace(/\.(SS|HK|US)$/i, '')];
        if (!currentPrice) continue;

        let triggered = false;
        if (order.triggerType === 'gte' && currentPrice >= order.triggerPrice) triggered = true;
        if (order.triggerType === 'lte' && currentPrice <= order.triggerPrice) triggered = true;
        if (!triggered) continue;

        const category = order.category || 'astocks';
        const qty = Number(order.qty);
        const total = currentPrice * qty;
        let ok = false;
        let msg = '';
        let failReason = null;

        if (order.type === 'buy') {
          if (total > account.balance) {
            failReason = '资金不足';
            msg = `[${account.accountName}] 买入 ${order.name} 失败: 资金不足`;
          } else {
            account.balance -= total;
            if (!account.holdings[order.symbol]) {
              account.holdings[order.symbol] = { qty: 0, avgCost: 0, name: order.name, category };
            }
            const h = account.holdings[order.symbol];
            h.avgCost = (h.avgCost * h.qty + currentPrice * qty) / (h.qty + qty);
            h.qty += qty;
            h.name = order.name;
            h.category = category;
            ok = true;
            msg = `[${account.accountName}] 买入 ${order.name} ${qty}${getUnit(category)} @ ¥${currentPrice.toFixed(2)}`;
          }
        } else if (order.type === 'sell') {
          const h = account.holdings[order.symbol];
          if (!h || h.qty < qty) {
            failReason = '持仓不足';
            msg = `[${account.accountName}] 卖出 ${order.name} 失败: 持仓不足`;
          } else {
            account.balance += total;
            h.qty -= qty;
            if (h.qty === 0) delete account.holdings[order.symbol];
            ok = true;
            msg = `[${account.accountName}] 卖出 ${order.name} ${qty}${getUnit(category)} @ ¥${currentPrice.toFixed(2)}`;
          }
        } else {
          failReason = '无效订单类型';
          msg = `[${account.accountName}] 订单 ${order.name} 失败: 无效订单类型`;
        }

        if (ok) {
          account.history.unshift({
            type: order.type, symbol: order.symbol, name: order.name,
            price: currentPrice, qty, total, time: new Date().toISOString(), category, unit: getUnit(category),
          });
          account.pendingOrders[i].status = 'executed';
          account.pendingOrders[i].executedAt = new Date().toISOString();
          account.pendingOrders[i].executedPrice = currentPrice;
          account.pendingOrders[i].failedReason = null;
        } else {
          account.pendingOrders[i].status = 'failed';
          account.pendingOrders[i].failedReason = failReason;
        }
        account.updatedAt = new Date().toISOString();

        executed.push({
          accountId, accountName: account.accountName,
          ...account.pendingOrders[i],
          result: { success: ok, message: msg, balance: account.balance }
        });
      }
    }

    return executed;
  });
}

module.exports = { createOrder, cancelOrder, getPendingOrders, getAllOrders, checkPendingOrders, normalizeOrderInput };
