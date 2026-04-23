/**
 * Leomoney 状态仓库（Repository 层）
 * 所有 state 读写统一走这里，业务层不再直接处理文件
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_BALANCE = 1000000;
const STATE_FILE = path.join(__dirname, '..', '..', '..', 'data', 'state.json');
let writeChain = Promise.resolve();

function ensureDataDir() {
  const dir = path.dirname(STATE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/**
 * 检测并迁移旧版单账户 state 到新版 accounts 容器
 */
function migrateIfNeeded(state) {
  if (state.accounts && typeof state.accounts === 'object') {
    if (!state.currentAccountId && Object.keys(state.accounts).length > 0) {
      state.currentAccountId = Object.keys(state.accounts)[0];
    }
    return state;
  }

  console.log('[StateRepository] 迁移旧版单账户数据到 accounts 容器');
  const accountId = 'acc_default';
  const now = new Date().toISOString();

  return {
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
