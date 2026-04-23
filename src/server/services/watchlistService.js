/**
 * Leomoney 自选服务层
 */

const { loadState, withStateTransaction } = require('../repositories/stateRepository');
const { isActiveAccount } = require('./accountService');

function getWatchlist() {
  const state = loadState();
  const accountId = state.currentAccountId;
  const account = state.accounts[accountId];
  if (!isActiveAccount(account)) return [];
  if (!account.watchlist) account.watchlist = [];
  return account.watchlist;
}

async function addToWatchlist(item) {
  return withStateTransaction((state) => {
    const accountId = state.currentAccountId;
    const account = state.accounts[accountId];
    if (!isActiveAccount(account)) return { success: false, error: '当前账户不存在' };
    if (!account.watchlist) account.watchlist = [];
    if (account.watchlist.some(w => w.symbol === item.symbol)) return { success: false, error: '已在自选中' };

    account.watchlist.push({
      symbol: item.symbol,
      name: item.name || item.symbol,
      category: item.category || 'astocks',
      currency: item.currency || 'CNY',
      addedAt: new Date().toISOString(),
    });
    account.updatedAt = new Date().toISOString();
    return { success: true, watchlist: account.watchlist, accountId };
  });
}

async function removeFromWatchlist(symbol) {
  return withStateTransaction((state) => {
    const accountId = state.currentAccountId;
    const account = state.accounts[accountId];
    if (!isActiveAccount(account)) return { success: false, error: '当前账户不存在' };
    if (!account.watchlist) account.watchlist = [];
    const before = account.watchlist.length;
    account.watchlist = account.watchlist.filter(w => w.symbol !== symbol);
    if (account.watchlist.length === before) return { success: false, error: '不在自选中' };
    account.updatedAt = new Date().toISOString();
    return { success: true, watchlist: account.watchlist, accountId };
  });
}

module.exports = { getWatchlist, addToWatchlist, removeFromWatchlist };
