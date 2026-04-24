/**
 * Leomoney 账户服务层 v2
 * 支持新 cash/positions 结构 + 旧版兼容
 */

const { loadState, withStateTransaction, DEFAULT_BALANCE } = require('../repositories/stateRepository');
const { migrateAccountIfNeeded } = require('../domain/ledger');
const { toMoney } = require('../domain/money');
const crypto = require('crypto');

function isActiveAccount(account) {
  return !!account && account.status !== 'archived';
}

function getActiveAccountEntries(state) {
  return Object.entries(state.accounts || {}).filter(([, acc]) => isActiveAccount(acc));
}

function getCurrentOrFirstActiveAccount(state) {
  const current = state.currentAccountId ? state.accounts[state.currentAccountId] : null;
  if (isActiveAccount(current)) return [state.currentAccountId, current];

  const firstActive = getActiveAccountEntries(state)[0];
  if (firstActive) {
    state.currentAccountId = firstActive[0];
    return firstActive;
  }
  return null;
}

function getFallbackAccount() {
  return {
    cash: { available: toMoney(DEFAULT_BALANCE), frozen: toMoney(0), total: toMoney(DEFAULT_BALANCE) },
    positions: {}, history: [], pendingOrders: [], watchlist: [],
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), accountId: 'unknown'
  };
}

/**
 * 获取当前账户 — 返回已迁移的结构
 */
function getAccount() {
  const state = loadState();
  const selected = getCurrentOrFirstActiveAccount(state);
  if (!selected) return getFallbackAccount();
  const [accountId, account] = selected;
  migrateAccountIfNeeded(account);
  return { ...account, accountId };
}

function getAccountById(accountId) {
  const state = loadState();
  const account = state.accounts[accountId];
  if (!isActiveAccount(account)) return null;
  migrateAccountIfNeeded(account);
  return { ...account, accountId };
}

function getAccounts() {
  const state = loadState();
  return getActiveAccountEntries(state).map(([id, acc]) => {
    migrateAccountIfNeeded(acc);
    return {
      accountId: id, accountName: acc.accountName, avatar: acc.avatar, color: acc.color,
      balance: acc.cash?.total || acc.balance || 0,
      cashAvailable: acc.cash?.available || 0,
      cashFrozen: acc.cash?.frozen || 0,
      holdingsCount: Object.keys(acc.positions || acc.holdings || {}).length,
      historyCount: (acc.history || []).length, watchlistCount: (acc.watchlist || []).length,
      createdAt: acc.createdAt, updatedAt: acc.updatedAt, status: acc.status
    };
  });
}

async function createAccount(accountName = '新账户', initialBalance = DEFAULT_BALANCE, color = '#3b82f6') {
  return withStateTransaction((state) => {
    const accountId = 'acc_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    const now = new Date().toISOString();
    const balance = toMoney(Number(initialBalance) || DEFAULT_BALANCE);
    const newAccount = {
      accountId, accountName, avatar: null, color,
      cash: { available: balance, frozen: toMoney(0), total: balance },
      positions: {},
      history: [], pendingOrders: [], watchlist: [],
      ledgerLog: [],
      createdAt: now, updatedAt: now, status: 'active'
    };
    state.accounts[accountId] = newAccount;
    state.currentAccountId = accountId;
    return { success: true, account: newAccount, accountId };
  });
}

async function switchAccount(accountId) {
  return withStateTransaction((state) => {
    if (!isActiveAccount(state.accounts[accountId])) return { success: false, error: '账户不存在' };
    state.currentAccountId = accountId;
    return { success: true, accountId };
  });
}

async function updateAccount(accountId, updates) {
  return withStateTransaction((state) => {
    if (!isActiveAccount(state.accounts[accountId])) return { success: false, error: '账户不存在' };
    const allowedFields = ['accountName', 'avatar', 'color'];
    Object.keys(updates || {}).forEach(key => {
      if (allowedFields.includes(key)) state.accounts[accountId][key] = updates[key];
    });
    state.accounts[accountId].updatedAt = new Date().toISOString();
    return { success: true, account: state.accounts[accountId] };
  });
}

async function deleteAccount(accountId) {
  return withStateTransaction((state) => {
    if (!isActiveAccount(state.accounts[accountId])) return { success: false, error: '账户不存在' };
    if (getActiveAccountEntries(state).length <= 1) return { success: false, error: '不能删除最后一个账户' };
    state.accounts[accountId].status = 'archived';
    state.accounts[accountId].updatedAt = new Date().toISOString();
    if (state.currentAccountId === accountId) {
      const nextAccount = getActiveAccountEntries(state).find(([id]) => id !== accountId);
      state.currentAccountId = nextAccount ? nextAccount[0] : null;
    }
    return { success: true, accountId };
  });
}

async function resetCurrentAccount() {
  return withStateTransaction((state) => {
    const selected = getCurrentOrFirstActiveAccount(state);
    if (!selected) return { success: false, error: '当前账户不存在' };
    const [accountId] = selected;
    const now = new Date().toISOString();
    const balance = toMoney(DEFAULT_BALANCE);
    state.accounts[accountId] = {
      ...state.accounts[accountId],
      balance: undefined, // 移除旧字段
      holdings: undefined,
      cash: { available: balance, frozen: toMoney(0), total: balance },
      positions: {},
      history: [], pendingOrders: [], watchlist: [], ledgerLog: [],
      updatedAt: now
    };
    return { success: true, accountId, message: '账户已重置' };
  });
}

module.exports = {
  getAccount, getAccountById, getAccounts,
  createAccount, switchAccount, updateAccount, deleteAccount, resetCurrentAccount,
  isActiveAccount,
};
