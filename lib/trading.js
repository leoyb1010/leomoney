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

/**
 * 检测并迁移旧版单账户 state 到新版 accounts 容器
 * 旧格式：{ balance, holdings, history, pendingOrders, watchlist, createdAt, updatedAt }
 * 新格式：{ currentAccountId, accounts: { accountId: { balance, holdings, ... } } }
 */
function migrateIfNeeded(state) {
  // 已经是新版 accounts 容器格式
  if (state.accounts && typeof state.accounts === 'object') {
    // 确保有 currentAccountId
    if (!state.currentAccountId && Object.keys(state.accounts).length > 0) {
      state.currentAccountId = Object.keys(state.accounts)[0];
    }
    return state;
  }
  
  // 是旧版单账户格式，迁移为默认账户
  console.log('[Trading] 迁移旧版单账户数据到 accounts 容器');
  const accountId = 'acc_default';
  const now = new Date().toISOString();
  
  const migrated = {
    currentAccountId: accountId,
    accounts: {
      [accountId]: {
        accountId,
        accountName: '默认账户',
        avatar: null,
        color: '#3b82f6',
        balance: state.balance || DEFAULT_BALANCE,
        holdings: state.holdings || {},
        history: state.history || [],
        pendingOrders: state.pendingOrders || [],
        watchlist: state.watchlist || [],
        createdAt: state.createdAt || now,
        updatedAt: state.updatedAt || now,
        status: 'active'
      }
    }
  };
  
  return migrated;
}

function loadState() {
  ensureDataDir();
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = fs.readFileSync(STATE_FILE, 'utf-8');
      const state = JSON.parse(raw);
      // 迁移检测与自动升级
      return migrateIfNeeded(state);
    }
  } catch (e) {
    console.error('[Trading] State load failed:', e.message);
  }
  
  // 全新状态：accounts 容器格式
  const now = new Date().toISOString();
  const accountId = 'acc_default';
  return {
    currentAccountId: accountId,
    accounts: {
      [accountId]: {
        accountId,
        accountName: '默认账户',
        avatar: null,
        color: '#3b82f6',
        balance: DEFAULT_BALANCE,
        holdings: {},
        history: [],
        pendingOrders: [],
        watchlist: [],
        createdAt: now,
        updatedAt: now,
        status: 'active'
      }
    }
  };
}

function saveState(state) {
  ensureDataDir();
  state.updatedAt = new Date().toISOString();
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
}

/**
 * 获取当前账户数据
 */
function getAccount() {
  const state = loadState();
  const accountId = state.currentAccountId;
  if (!accountId || !state.accounts[accountId]) {
    // 兜底：返回第一个账户或空账户
    const firstAccountId = Object.keys(state.accounts)[0];
    if (firstAccountId) {
      state.currentAccountId = firstAccountId;
      return { ...state.accounts[firstAccountId], accountId: firstAccountId };
    }
    return {
      balance: DEFAULT_BALANCE,
      holdings: {},
      history: [],
      pendingOrders: [],
      watchlist: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      accountId: 'unknown'
    };
  }
  const account = state.accounts[accountId];
  return { ...account, accountId };
}

/**
 * 获取指定账户数据
 */
function getAccountById(accountId) {
  const state = loadState();
  const account = state.accounts[accountId];
  if (!account) return null;
  return { ...account, accountId };
}

/**
 * 获取所有账户列表
 */
function getAccounts() {
  const state = loadState();
  return Object.entries(state.accounts).map(([id, acc]) => ({
    accountId: id,
    accountName: acc.accountName,
    avatar: acc.avatar,
    color: acc.color,
    balance: acc.balance,
    holdingsCount: Object.keys(acc.holdings).length,
    historyCount: acc.history.length,
    watchlistCount: acc.watchlist.length,
    createdAt: acc.createdAt,
    updatedAt: acc.updatedAt,
    status: acc.status
  }));
}

/**
 * 创建新账户
 */
function createAccount(accountName = '新账户', initialBalance = DEFAULT_BALANCE, color = '#3b82f6') {
  const state = loadState();
  const accountId = 'acc_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
  const now = new Date().toISOString();
  
  const newAccount = {
    accountId,
    accountName,
    avatar: null,
    color: color, // 支持自定义颜色
    balance: initialBalance,
    holdings: {},
    history: [],
    pendingOrders: [],
    watchlist: [],
    createdAt: now,
    updatedAt: now,
    status: 'active'
  };
  
  state.accounts[accountId] = newAccount;
  state.currentAccountId = accountId;
  saveState(state);
  
  return { success: true, account: newAccount, accountId };
}

/**
 * 切换当前账户
 */
function switchAccount(accountId) {
  const state = loadState();
  if (!state.accounts[accountId]) {
    return { success: false, error: '账户不存在' };
  }
  state.currentAccountId = accountId;
  saveState(state);
  return { success: true, accountId };
}

/**
 * 更新账户信息
 */
function updateAccount(accountId, updates) {
  const state = loadState();
  if (!state.accounts[accountId]) {
    return { success: false, error: '账户不存在' };
  }
  
  const allowedFields = ['accountName', 'avatar', 'color', 'status'];
  Object.keys(updates).forEach(key => {
    if (allowedFields.includes(key)) {
      state.accounts[accountId][key] = updates[key];
    }
  });
  state.accounts[accountId].updatedAt = new Date().toISOString();
  saveState(state);
  
  return { success: true, account: state.accounts[accountId] };
}

/**
 * 删除/归档账户
 */
function deleteAccount(accountId) {
  const state = loadState();
  if (!state.accounts[accountId]) {
    return { success: false, error: '账户不存在' };
  }
  
  // 不允许删除最后一个账户
  if (Object.keys(state.accounts).length <= 1) {
    return { success: false, error: '不能删除最后一个账户' };
  }
  
  // 标记为归档而非硬删除
  state.accounts[accountId].status = 'archived';
  state.accounts[accountId].updatedAt = new Date().toISOString();
  
  // 如果被删除的是当前账户，切换到另一个活跃账户
  if (state.currentAccountId === accountId) {
    const activeAccounts = Object.entries(state.accounts)
      .filter(([id, acc]) => acc.status === 'active' && id !== accountId);
    if (activeAccounts.length > 0) {
      state.currentAccountId = activeAccounts[0][0];
    } else {
      state.currentAccountId = Object.keys(state.accounts).filter(id => id !== accountId)[0];
    }
  }
  
  saveState(state);
  return { success: true, accountId };
}

/**
 * 重置当前账户
 */
function resetCurrentAccount() {
  const state = loadState();
  const accountId = state.currentAccountId;
  if (!accountId || !state.accounts[accountId]) {
    return { success: false, error: '当前账户不存在' };
  }
  
  const now = new Date().toISOString();
  state.accounts[accountId] = {
    ...state.accounts[accountId],
    balance: DEFAULT_BALANCE,
    holdings: {},
    history: [],
    pendingOrders: [],
    watchlist: [],
    updatedAt: now
  };
  
  saveState(state);
  return { success: true, accountId, message: '账户已重置' };
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
  const accountId = state.currentAccountId;
  const account = state.accounts[accountId];
  if (!account) return { success: false, error: '当前账户不存在' };

  if (total > account.balance) {
    return { success: false, error: `资金不足，可用: ¥${account.balance.toFixed(2)}` };
  }

  account.balance -= total;
  if (!account.holdings[stockQuote.symbol]) {
    account.holdings[stockQuote.symbol] = { qty: 0, avgCost: 0, name: stockQuote.name, category };
  }
  const h = account.holdings[stockQuote.symbol];
  h.avgCost = (h.avgCost * h.qty + price * qty) / (h.qty + qty);
  h.qty += qty;
  h.name = stockQuote.name;
  h.category = category;

  const unit = getUnit(category);
  account.history.unshift({
    type: 'buy', symbol: stockQuote.symbol, name: stockQuote.name,
    price, qty, total, time: new Date().toISOString(), category, unit,
    strategy: stockQuote.strategy || undefined,
  });

  account.updatedAt = new Date().toISOString();
  saveState(state);
  return {
    success: true,
    message: `买入 ${stockQuote.name} ${qty}${unit} @ ¥${price.toFixed(2)}`,
    balance: account.balance,
    holding: account.holdings[stockQuote.symbol],
    accountId,
  };
}

function sell(stockQuote, qty, limitPrice = null) {
  const price = limitPrice || stockQuote.price;
  const category = stockQuote.category || 'astocks';
  if (!price || price <= 0) return { success: false, error: '无效价格' };

  const v = validateQty(qty, category);
  if (!v.ok) return { success: false, error: v.error };

  const state = loadState();
  const accountId = state.currentAccountId;
  const account = state.accounts[accountId];
  if (!account) return { success: false, error: '当前账户不存在' };

  const h = account.holdings[stockQuote.symbol];

  if (!h || h.qty < qty) {
    return { success: false, error: `持仓不足，可用: ${h ? h.qty : 0}${getUnit(category)}` };
  }

  const total = price * qty;
  account.balance += total;
  h.qty -= qty;
  if (h.qty === 0) delete account.holdings[stockQuote.symbol];

  const unit = getUnit(category);
  account.history.unshift({
    type: 'sell', symbol: stockQuote.symbol, name: stockQuote.name,
    price, qty, total, time: new Date().toISOString(), category, unit,
    strategy: stockQuote.strategy || undefined,
  });

  account.updatedAt = new Date().toISOString();
  saveState(state);
  return {
    success: true,
    message: `卖出 ${stockQuote.name} ${qty}${unit} @ ¥${price.toFixed(2)}`,
    balance: account.balance,
    holding: h.qty > 0 ? account.holdings[stockQuote.symbol] : null,
    accountId,
  };
}

// ===== 条件单 =====
function createOrder(order) {
  const state = loadState();
  const accountId = state.currentAccountId;
  const account = state.accounts[accountId];
  if (!account) return { success: false, error: '当前账户不存在' };

  if (!account.pendingOrders) account.pendingOrders = [];

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

/**
 * 检查并执行条件单
 * @param {object} prices - { symbol: currentPrice }
 * @returns {array} 已执行的订单列表
 */
function checkPendingOrders(prices) {
  const state = loadState();
  const executed = [];

  // 遍历所有账户
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
        // 直接在同一账户对象上执行交易
        const category = order.category || 'astocks';
        const qty = order.qty;
        const total = currentPrice * qty;

        let ok = false, msg = '';
        if (order.type === 'buy') {
          if (total > account.balance) { msg = '资金不足'; }
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
          if (!h || h.qty < qty) { msg = `持仓不足`; }
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
          account.updatedAt = new Date().toISOString();
          
          executed.push({ 
            accountId, 
            accountName: account.accountName,
            ...account.pendingOrders[i], 
            result: { success: true, message: msg, balance: account.balance } 
          });
        }
      }
    }
  }

  if (executed.length > 0) saveState(state);
  return executed;
}

/**
 * 旧版全局重置（兼容性保留，建议用 resetCurrentAccount 替代）
 */
function reset() {
  return resetCurrentAccount();
}

// ===== 自选列表 =====
function getWatchlist() {
  const state = loadState();
  const accountId = state.currentAccountId;
  const account = state.accounts[accountId];
  if (!account) return [];
  if (!account.watchlist) account.watchlist = [];
  return account.watchlist;
}

function addToWatchlist(item) {
  const state = loadState();
  const accountId = state.currentAccountId;
  const account = state.accounts[accountId];
  if (!account) return { success: false, error: '当前账户不存在' };
  
  if (!account.watchlist) account.watchlist = [];
  // 去重
  if (account.watchlist.some(w => w.symbol === item.symbol)) {
    return { success: false, error: '已在自选中' };
  }
  account.watchlist.push({
    symbol: item.symbol,
    name: item.name || item.symbol,
    category: item.category || 'astocks',
    currency: item.currency || 'CNY',
    addedAt: new Date().toISOString(),
  });
  account.updatedAt = new Date().toISOString();
  saveState(state);
  return { success: true, watchlist: account.watchlist, accountId };
}

function removeFromWatchlist(symbol) {
  const state = loadState();
  const accountId = state.currentAccountId;
  const account = state.accounts[accountId];
  if (!account) return { success: false, error: '当前账户不存在' };
  
  if (!account.watchlist) account.watchlist = [];
  const before = account.watchlist.length;
  account.watchlist = account.watchlist.filter(w => w.symbol !== symbol);
  if (account.watchlist.length === before) {
    return { success: false, error: '不在自选中' };
  }
  account.updatedAt = new Date().toISOString();
  saveState(state);
  return { success: true, watchlist: account.watchlist, accountId };
}

module.exports = {
  loadState, saveState, getAccount, getAccountById, getAccounts, createAccount, switchAccount, updateAccount, deleteAccount, resetCurrentAccount,
  buy, sell, reset,
  createOrder, cancelOrder, getPendingOrders, checkPendingOrders,
  getWatchlist, addToWatchlist, removeFromWatchlist,
  DEFAULT_BALANCE,
};
