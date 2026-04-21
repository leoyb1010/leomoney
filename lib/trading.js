/**
 * Leomoney - 交易引擎模块
 * 支持现货交易 + 条件单（止盈止损自动触发）
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_BALANCE = 1000000;
const STATE_FILE = path.join(__dirname, '..', 'data', 'state.json');

function ensureDataDir() {
  const dir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadState() {
  ensureDataDir();
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = fs.readFileSync(STATE_FILE, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error('[Trading] State load failed:', e.message);
  }
  return {
    balance: DEFAULT_BALANCE,
    holdings: {},
    history: [],
    pendingOrders: [],
    createdAt: new Date().toISOString(),
  };
}

function saveState(state) {
  ensureDataDir();
  state.updatedAt = new Date().toISOString();
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
}

function getAccount() {
  const state = loadState();
  return {
    balance: state.balance,
    holdings: state.holdings,
    history: state.history.slice(0, 100),
    pendingOrders: (state.pendingOrders || []).filter(o => o.status === 'pending'),
    totalAssets: state.balance + Object.entries(state.holdings).reduce((sum, [sym, h]) => {
      return sum + h.qty * h.avgCost;
    }, 0),
  };
}

// ===== 现货交易 =====
function isStockLike(category) {
  return category === 'astocks' || category === 'hkstocks' || category === 'usstocks';
}

function getUnit(category) {
  if (category === 'crypto') return '枚';
  if (category === 'metals') return '盎司';
  return '股';
}

function validateQty(qty, category) {
  if (!qty || qty <= 0) return { ok: false, error: '数量必须大于0' };
  if (isStockLike(category) && qty % 100 !== 0) return { ok: false, error: '数量必须为100的整数倍' };
  return { ok: true };
}

function buy(stockQuote, qty, limitPrice = null) {
  const price = limitPrice || stockQuote.price;
  const category = stockQuote.category || 'astocks';
  if (!price || price <= 0) return { success: false, error: '无效价格' };

  const v = validateQty(qty, category);
  if (!v.ok) return { success: false, error: v.error };

  const total = price * qty;
  const state = loadState();

  if (total > state.balance) {
    return { success: false, error: `资金不足，可用: ¥${state.balance.toFixed(2)}` };
  }

  state.balance -= total;
  if (!state.holdings[stockQuote.symbol]) {
    state.holdings[stockQuote.symbol] = { qty: 0, avgCost: 0, name: stockQuote.name, category };
  }
  const h = state.holdings[stockQuote.symbol];
  h.avgCost = (h.avgCost * h.qty + price * qty) / (h.qty + qty);
  h.qty += qty;
  h.name = stockQuote.name;
  h.category = category;

  const unit = getUnit(category);
  state.history.unshift({
    type: 'buy', symbol: stockQuote.symbol, name: stockQuote.name,
    price, qty, total, time: new Date().toISOString(), category, unit,
  });

  saveState(state);
  return {
    success: true,
    message: `买入 ${stockQuote.name} ${qty}${unit} @ ¥${price.toFixed(2)}`,
    balance: state.balance,
    holding: state.holdings[stockQuote.symbol],
  };
}

function sell(stockQuote, qty, limitPrice = null) {
  const price = limitPrice || stockQuote.price;
  const category = stockQuote.category || 'astocks';
  if (!price || price <= 0) return { success: false, error: '无效价格' };

  const v = validateQty(qty, category);
  if (!v.ok) return { success: false, error: v.error };

  const state = loadState();
  const h = state.holdings[stockQuote.symbol];

  if (!h || h.qty < qty) {
    return { success: false, error: `持仓不足，可用: ${h ? h.qty : 0}${getUnit(category)}` };
  }

  const total = price * qty;
  state.balance += total;
  h.qty -= qty;
  if (h.qty === 0) delete state.holdings[stockQuote.symbol];

  const unit = getUnit(category);
  state.history.unshift({
    type: 'sell', symbol: stockQuote.symbol, name: stockQuote.name,
    price, qty, total, time: new Date().toISOString(), category, unit,
  });

  saveState(state);
  return {
    success: true,
    message: `卖出 ${stockQuote.name} ${qty}${unit} @ ¥${price.toFixed(2)}`,
    balance: state.balance,
    holding: h.qty > 0 ? state.holdings[stockQuote.symbol] : null,
  };
}

// ===== 条件单 =====
function createOrder(order) {
  const state = loadState();
  if (!state.pendingOrders) state.pendingOrders = [];

  const newOrder = {
    id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
    symbol: order.symbol,
    name: order.name,
    type: order.type,        // 'buy' | 'sell'
    triggerType: order.triggerType, // 'gte' (≥) | 'lte' (≤)
    triggerPrice: order.triggerPrice,
    qty: order.qty,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  state.pendingOrders.push(newOrder);
  saveState(state);
  return { success: true, order: newOrder };
}

function cancelOrder(orderId) {
  const state = loadState();
  if (!state.pendingOrders) return { success: false, error: '无待执行订单' };

  const idx = state.pendingOrders.findIndex(o => o.id === orderId && o.status === 'pending');
  if (idx === -1) return { success: false, error: '订单不存在或已执行' };

  state.pendingOrders[idx].status = 'cancelled';
  saveState(state);
  return { success: true, message: '订单已取消' };
}

function getPendingOrders() {
  const state = loadState();
  return (state.pendingOrders || []).filter(o => o.status === 'pending');
}

/**
 * 检查并执行条件单
 * @param {object} prices - { symbol: currentPrice }
 * @returns {array} 已执行的订单列表
 */
function checkPendingOrders(prices) {
  const state = loadState();
  if (!state.pendingOrders) return [];

  const executed = [];

  for (let i = 0; i < state.pendingOrders.length; i++) {
    const order = state.pendingOrders[i];
    if (order.status !== 'pending') continue;
    const currentPrice = prices[order.symbol];
    if (!currentPrice) continue;

    let triggered = false;
    if (order.triggerType === 'gte' && currentPrice >= order.triggerPrice) triggered = true;
    if (order.triggerType === 'lte' && currentPrice <= order.triggerPrice) triggered = true;

    if (triggered) {
      // 直接在同一 state 对象上执行交易，避免 buy/sell 内部重复 load/save 导致状态覆盖
      const category = order.category || 'astocks';
      const qty = order.qty;
      const total = currentPrice * qty;

      let ok = false, msg = '';
      if (order.type === 'buy') {
        if (total > state.balance) { msg = '资金不足'; }
        else {
          state.balance -= total;
          if (!state.holdings[order.symbol]) state.holdings[order.symbol] = { qty: 0, avgCost: 0, name: order.name, category };
          const h = state.holdings[order.symbol];
          h.avgCost = (h.avgCost * h.qty + currentPrice * qty) / (h.qty + qty);
          h.qty += qty; h.name = order.name; h.category = category;
          ok = true; msg = `买入 ${order.name} ${qty}${getUnit(category)} @ ¥${currentPrice.toFixed(2)}`;
        }
      } else {
        const h = state.holdings[order.symbol];
        if (!h || h.qty < qty) { msg = `持仓不足`; }
        else {
          state.balance += total;
          h.qty -= qty;
          if (h.qty === 0) delete state.holdings[order.symbol];
          ok = true; msg = `卖出 ${order.name} ${qty}${getUnit(category)} @ ¥${currentPrice.toFixed(2)}`;
        }
      }

      if (ok) {
        state.history.unshift({
          type: order.type, symbol: order.symbol, name: order.name,
          price: currentPrice, qty, total, time: new Date().toISOString(), category, unit: getUnit(category),
        });
        state.pendingOrders[i].status = 'executed';
        state.pendingOrders[i].executedAt = new Date().toISOString();
        state.pendingOrders[i].executedPrice = currentPrice;
        executed.push({ ...state.pendingOrders[i], result: { success: true, message: msg, balance: state.balance } });
      }
    }
  }

  if (executed.length > 0) saveState(state);
  return executed;
}

function reset() {
  const state = {
    balance: DEFAULT_BALANCE,
    holdings: {},
    history: [],
    pendingOrders: [],
    createdAt: new Date().toISOString(),
  };
  saveState(state);
  return { success: true, message: `账户已重置，初始资金 ¥${DEFAULT_BALANCE.toLocaleString()}` };
}

module.exports = {
  loadState, saveState, getAccount,
  buy, sell, reset,
  createOrder, cancelOrder, getPendingOrders, checkPendingOrders,
  DEFAULT_BALANCE,
};
