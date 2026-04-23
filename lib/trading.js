/**
 * Leomoney - 兼容层 Facade
 *
 * 说明：
 * - 保留旧版 lib/trading.js 导出，避免 CLI / 外部脚本失效
 * - 内部不再维护独立交易/账户/订单/自选状态逻辑
 * - 所有写操作统一转调 src/server/services/* 与 stateRepository
 */

const stateRepository = require('../src/server/repositories/stateRepository');
const accountService = require('../src/server/services/accountService');
const tradingService = require('../src/server/services/tradingService');
const orderService = require('../src/server/services/orderService');
const watchlistService = require('../src/server/services/watchlistService');

const { loadState, saveState, withStateTransaction, migrateIfNeeded, DEFAULT_BALANCE } = stateRepository;
const {
  getAccount,
  getAccountById,
  getAccounts,
  createAccount,
  switchAccount,
  updateAccount,
  deleteAccount,
  resetCurrentAccount,
} = accountService;
const { buy, sell, validateQty, buildTradeMeta } = tradingService;
const { createOrder, cancelOrder, getPendingOrders, getAllOrders, checkPendingOrders, normalizeOrderInput } = orderService;
const { getWatchlist, addToWatchlist, removeFromWatchlist } = watchlistService;

async function reset() {
  return resetCurrentAccount();
}

module.exports = {
  loadState,
  saveState,
  withStateTransaction,
  migrateIfNeeded,
  DEFAULT_BALANCE,

  getAccount,
  getAccountById,
  getAccounts,
  createAccount,
  switchAccount,
  updateAccount,
  deleteAccount,
  resetCurrentAccount,
  reset,

  buy,
  sell,
  validateQty,
  buildTradeMeta,

  createOrder,
  cancelOrder,
  getPendingOrders,
  getAllOrders,
  checkPendingOrders,
  normalizeOrderInput,

  getWatchlist,
  addToWatchlist,
  removeFromWatchlist,
};
