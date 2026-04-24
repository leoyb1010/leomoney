/**
 * Leomoney 状态仓库（Repository 层）v2
 * 支持 cash/positions 新版结构 + 旧版自动迁移
 * 所有 state 读写统一走这里
 */

const fs = require('fs');
const path = require('path');
const { toMoney, toQty } = require('../domain/money');

const DEFAULT_BALANCE = 1000000;
const STATE_FILE = path.join(__dirname, '..', '..', '..', 'data', 'state.json');
let writeChain = Promise.resolve();

function ensureDataDir() {
  const dir = path.dirname(STATE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/**
 * 检测并迁移旧版单账户 state 到新版 accounts 容器
 * 同时迁移 cash/positions 结构
 */
function migrateIfNeeded(state) {
  if (state.accounts && typeof state.accounts === 'object') {
    if (!state.currentAccountId && Object.keys(state.accounts).length > 0) {
      state.currentAccountId = Object.keys(state.accounts)[0];
    }
    // 逐账户迁移 cash/positions
    for (const account of Object.values(state.accounts)) {
      migrateAccountData(account);
    }
    return state;
  }

  console.log('[StateRepository] 迁移旧版单账户数据到 accounts 容器');
  const accountId = 'acc_default';
  const now = new Date().toISOString();

  const newAccount = {
    accountId,
    accountName: '默认账户',
    avatar: null,
    color: '#3b82f6',
    cash: { available: toMoney(state.balance || DEFAULT_BALANCE), frozen: toMoney(0), total: toMoney(state.balance || DEFAULT_BALANCE) },
    positions: {},
    history: state.history || [],
    pendingOrders: state.pendingOrders || [],
    watchlist: state.watchlist || [],
    ledgerLog: [],
    createdAt: state.createdAt || now,
    updatedAt: state.updatedAt || now,
    status: 'active'
  };

  // 迁移旧版 holdings
  if (state.holdings && typeof state.holdings === 'object') {
    for (const [symbol, h] of Object.entries(state.holdings)) {
      newAccount.positions[symbol] = {
        symbol,
        name: h.name || symbol,
        totalQty: toQty(h.qty || 0),
        sellableQty: toQty(h.qty || 0),
        frozenQty: toQty(0),
        avgCost: toMoney(h.avgCost || 0),
        realizedPnl: toMoney(0),
        category: h.category || 'astocks',
      };
    }
  }

  return {
    currentAccountId: accountId,
    accounts: { [accountId]: newAccount }
  };
}

/**
 * 迁移单个账户数据（balance → cash, holdings → positions）
 */
function migrateAccountData(account) {
  if (!account) return;

  // balance → cash
  if (!account.cash || typeof account.cash !== 'object') {
    const balance = Number(account.balance) || 0;
    account.cash = {
      available: toMoney(balance),
      frozen: toMoney(0),
      total: toMoney(balance),
    };
    delete account.balance;
  }

  // holdings → positions
  if (account.holdings && !account.positions) {
    account.positions = {};
    for (const [symbol, h] of Object.entries(account.holdings)) {
      account.positions[symbol] = {
        symbol,
        name: h.name || symbol,
        totalQty: toQty(h.qty || 0),
        sellableQty: toQty(h.qty || 0),
        frozenQty: toQty(0),
        avgCost: toMoney(h.avgCost || 0),
        realizedPnl: toMoney(0),
        category: h.category || 'astocks',
      };
    }
    delete account.holdings;
  } else if (!account.positions) {
    account.positions = {};
  }

  if (!account.ledgerLog) account.ledgerLog = [];
}

function loadState() {
  ensureDataDir();
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = fs.readFileSync(STATE_FILE, 'utf-8');
      const state = JSON.parse(raw);
      return migrateIfNeeded(state);
    }
  } catch (e) {
    console.error('[StateRepository] Load failed:', e.message);
  }

  const now = new Date().toISOString();
  const accountId = 'acc_default';
  const balance = toMoney(DEFAULT_BALANCE);
  return {
    currentAccountId: accountId,
    accounts: {
      [accountId]: {
        accountId,
        accountName: '默认账户',
        avatar: null,
        color: '#3b82f6',
        cash: { available: balance, frozen: toMoney(0), total: balance },
        positions: {},
        history: [],
        pendingOrders: [],
        watchlist: [],
        ledgerLog: [],
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

function withStateTransaction(mutator) {
  const run = async () => {
    const state = loadState();
    const result = await mutator(state);
    saveState(state);
    return result;
  };
  const next = writeChain.then(run, run);
  writeChain = next.then(() => undefined, () => undefined);
  return next;
}

module.exports = { loadState, saveState, withStateTransaction, migrateIfNeeded, DEFAULT_BALANCE };
