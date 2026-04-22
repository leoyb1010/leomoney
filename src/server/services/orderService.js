/**
 * Leomoney 条件单服务层
 * 创建、取消、查询、触发检查
 */

const { loadState, saveState } = require('../repositories/stateRepository');
const { getUnit } = require('../domain/models');

function createOrder(order) {
  const state = loadState();
  const accountId = state.currentAccountId;
  const account = state.accounts[accountId];
  if (!account) return { success: false, error: '当前账户不存在' };
  if (!account.pendingOrders) account.pendingOrders = [];

  const newOrder = {
    id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
    symbol: order.symbol, name: order.name, type: order.type,
    triggerType: order.triggerType, triggerPrice: order.triggerPrice,
    qty: order.qty, status: 'pending', createdAt: new Date().toISOString(),
  };
  account.pendingOrders.push(newOrder);
  account.updatedAt = new Date().toISOString();
  saveState(state);
  return { success: true, order: newOrder, accountId };
}

function cancelOrder(orderId) {
  const state = loadState();
  const accountId = state.currentAccountId;
  const account = state.accounts[accountId];
  if (!account) return { success: false, error: '当前账户不存在' };
  if (!account.pendingOrders) return { success: false, error: '无待执行订单' };

  const idx = account.pendingOrders.findIndex(o => o.id === orderId && o.status === 'pending');
  if (idx === -1) return { success: false, error: '订单不存在或已执行' };

  account.pendingOrders[idx].status = 'cancelled';
  account.updatedAt = new Date().toISOString();
  saveState(state);
  return { success: true, message: '订单已取消', accountId };
}

function getPendingOrders() {
  const state = loadState();
  const accountId = state.currentAccountId;
  const account = state.accounts[accountId];
  if (!account) return [];
  return (account.pendingOrders || []).filter(o => o.status === 'pending');
}

function getAllOrders() {
  const state = loadState();
  const accountId = state.currentAccountId;
  const account = state.accounts[accountId];
  if (!account) return [];
  return account.pendingOrders || [];
}

/**
 * 检查并执行条件单（多账户遍历）
 * @param {object} prices - { symbol: currentPrice }
 */
function checkPendingOrders(prices) {
  const state = loadState();
  const executed = [];

  for (const [accountId, account] of Object.entries(state.accounts)) {
    if (!account.pendingOrders || account.pendingOrders.length === 0) continue;

    for (let i = 0; i < account.pendingOrders.length; i++) {
      const order = account.pendingOrders[i];
      if (order.status !== 'pending') continue;
      const currentPrice = prices[order.symbol];
      if (!currentPrice) continue;

      let triggered = false;
      if (order.triggerType === 'gte' && currentPrice >= order.triggerPrice) triggered = true;
      if (order.triggerType === 'lte' && currentPrice <= order.triggerPrice) triggered = true;

      if (triggered) {
        const category = order.category || 'astocks';
        const qty = order.qty;
        const total = currentPrice * qty;
        let ok = false, msg = '', failReason = null;

        if (order.type === 'buy') {
          if (total > account.balance) { failReason = '资金不足'; msg = `[${account.accountName}] 买入 ${order.name} 失败: 资金不足`; }
          else {
            account.balance -= total;
            if (!account.holdings[order.symbol]) {
              account.holdings[order.symbol] = { qty: 0, avgCost: 0, name: order.name, category };
            }
            const h = account.holdings[order.symbol];
            h.avgCost = (h.avgCost * h.qty + currentPrice * qty) / (h.qty + qty);
            h.qty += qty; h.name = order.name; h.category = category;
            ok = true; msg = `[${account.accountName}] 买入 ${order.name} ${qty}${getUnit(category)} @ ¥${currentPrice.toFixed(2)}`;
          }
        } else {
          const h = account.holdings[order.symbol];
          if (!h || h.qty < qty) { failReason = '持仓不足'; msg = `[${account.accountName}] 卖出 ${order.name} 失败: 持仓不足`; }
          else {
            account.balance += total;
            h.qty -= qty;
            if (h.qty === 0) delete account.holdings[order.symbol];
            ok = true; msg = `[${account.accountName}] 卖出 ${order.name} ${qty}${getUnit(category)} @ ¥${currentPrice.toFixed(2)}`;
          }
        }

        if (ok) {
          account.history.unshift({
            type: order.type, symbol: order.symbol, name: order.name,
            price: currentPrice, qty, total, time: new Date().toISOString(), category, unit: getUnit(category),
          });
          account.pendingOrders[i].status = 'executed';
          account.pendingOrders[i].executedAt = new Date().toISOString();
          account.pendingOrders[i].executedPrice = currentPrice;
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
  }

  if (executed.length > 0) saveState(state);
  return executed;
}

module.exports = { createOrder, cancelOrder, getPendingOrders, getAllOrders, checkPendingOrders };
