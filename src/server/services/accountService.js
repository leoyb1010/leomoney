/**
 * Leomoney 账户服务层
 * 账户 CRUD、切换、重置
 */

const { loadState, saveState, DEFAULT_BALANCE } = require('../repositories/stateRepository');

function getAccount() {
  const state = loadState();
  const accountId = state.currentAccountId;
  if (!accountId || !state.accounts[accountId]) {
    const firstAccountId = Object.keys(state.accounts)[0];
    if (firstAccountId) {
      state.currentAccountId = firstAccountId;
      return { ...state.accounts[firstAccountId], accountId: firstAccountId };
    }
    return {
      balance: DEFAULT_BALANCE, holdings: {}, history: [], pendingOrders: [], watchlist: [],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), accountId: 'unknown'
    };
  }
  return { ...state.accounts[accountId], accountId };
}

function getAccountById(accountId) {
  const state = loadState();
  const account = state.accounts[accountId];
  if (!account) return null;
  return { ...account, accountId };
}

function getAccounts() {
  const state = loadState();
  return Object.entries(state.accounts).map(([id, acc]) => ({
    accountId: id, accountName: acc.accountName, avatar: acc.avatar, color: acc.color,
    balance: acc.balance, holdingsCount: Object.keys(acc.holdings).length,
    historyCount: acc.history.length, watchlistCount: acc.watchlist.length,
    createdAt: acc.createdAt, updatedAt: acc.updatedAt, status: acc.status
  }));
}

function createAccount(accountName = '新账户', initialBalance = DEFAULT_BALANCE, color = '#3b82f6') {
  const state = loadState();
  const accountId = 'acc_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
  const now = new Date().toISOString();
  const newAccount = {
    accountId, accountName, avatar: null, color,
    balance: initialBalance, holdings: {}, history: [], pendingOrders: [], watchlist: [],
    createdAt: now, updatedAt: now, status: 'active'
  };
  state.accounts[accountId] = newAccount;
  state.currentAccountId = accountId;
  saveState(state);
  return { success: true, account: newAccount, accountId };
}

function switchAccount(accountId) {
  const state = loadState();
  if (!state.accounts[accountId]) return { success: false, error: '账户不存在' };
  state.currentAccountId = accountId;
  saveState(state);
  return { success: true, accountId };
}

function updateAccount(accountId, updates) {
  const state = loadState();
  if (!state.accounts[accountId]) return { success: false, error: '账户不存在' };
  const allowedFields = ['accountName', 'avatar', 'color', 'status'];
  Object.keys(updates).forEach(key => {
    if (allowedFields.includes(key)) state.accounts[accountId][key] = updates[key];
  });
  state.accounts[accountId].updatedAt = new Date().toISOString();
  saveState(state);
  return { success: true, account: state.accounts[accountId] };
}

function deleteAccount(accountId) {
  const state = loadState();
  if (!state.accounts[accountId]) return { success: false, error: '账户不存在' };
  if (Object.keys(state.accounts).length <= 1) return { success: false, error: '不能删除最后一个账户' };
  state.accounts[accountId].status = 'archived';
  state.accounts[accountId].updatedAt = new Date().toISOString();
  if (state.currentAccountId === accountId) {
    const activeAccounts = Object.entries(state.accounts).filter(([id, acc]) => acc.status === 'active' && id !== accountId);
    state.currentAccountId = activeAccounts.length > 0 ? activeAccounts[0][0] : Object.keys(state.accounts).filter(id => id !== accountId)[0];
  }
  saveState(state);
  return { success: true, accountId };
}

function resetCurrentAccount() {
  const state = loadState();
  const accountId = state.currentAccountId;
  if (!accountId || !state.accounts[accountId]) return { success: false, error: '当前账户不存在' };
  const now = new Date().toISOString();
  state.accounts[accountId] = {
    ...state.accounts[accountId],
    balance: DEFAULT_BALANCE, holdings: {}, history: [], pendingOrders: [], watchlist: [], updatedAt: now
  };
  saveState(state);
  return { success: true, accountId, message: '账户已重置' };
}

module.exports = {
  getAccount, getAccountById, getAccounts,
  createAccount, switchAccount, updateAccount, deleteAccount, resetCurrentAccount,
};
