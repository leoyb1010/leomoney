/**
 * Leomoney 自选服务层
 */

const { loadState, saveState } = require('../repositories/stateRepository');

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
  if (account.watchlist.some(w => w.symbol === item.symbol)) return { success: false, error: '已在自选中' };

  account.watchlist.push({
    symbol: item.symbol, name: item.name || item.symbol,
    category: item.category || 'astocks', currency: item.currency || 'CNY',
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
  if (account.watchlist.length === before) return { success: false, error: '不在自选中' };
  account.updatedAt = new Date().toISOString();
  saveState(state);
  return { success: true, watchlist: account.watchlist, accountId };
}

module.exports = { getWatchlist, addToWatchlist, removeFromWatchlist };
