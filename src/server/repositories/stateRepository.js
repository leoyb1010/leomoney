/**
 * Leomoney 状态仓库（Repository 层）v3
 * 支持 cash/positions 新版结构 + 旧版自动迁移
 * 所有 state 读写统一走这里
 *
 * v3.0 升级点：
 *   1. 原子写入增强（校验写入后文件大小）
 *   2. 3级自动备份 + 文件大小检查
 *   3. 启动完整性检查增强（JSON Schema 基本校验）
 *   4. 写入失败自动从备份恢复
 *   5. 并发写入队列增强（带错误传播）
 */

const fs = require('fs');
const path = require('path');
const { toMoney, toQty } = require('../domain/money');

const DEFAULT_BALANCE = 1000000;
const STATE_FILE = path.join(__dirname, '..', '..', '..', 'data', 'state.json');
const MIN_STATE_SIZE = 100; // 合法的 state.json 至少 100 字节
let writeChain = Promise.resolve();

function ensureDataDir() {
  const dir = path.dirname(STATE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/**
 * 启动时完整性检查
 * @returns {{ valid: boolean, message: string, recovered: boolean }}
 */
function startupIntegrityCheck() {
  ensureDataDir();

  if (!fs.existsSync(STATE_FILE)) {
    return { valid: true, message: '数据文件不存在，首次启动将自动创建', recovered: false };
  }

  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf-8');
    const stat = fs.statSync(STATE_FILE);

    // 大小检查
    if (stat.size < MIN_STATE_SIZE) {
      console.warn(`[StateRepository] state.json 文件过小 (${stat.size} bytes)，尝试从备份恢复`);
      const recovered = _recoverFromBackup();
      if (recovered) {
        return { valid: true, message: '从备份恢复成功（原文件过小）', recovered: true };
      }
      return { valid: false, message: `state.json 文件过小 (${stat.size} bytes)，且无可用备份`, recovered: false };
    }

    // JSON 解析检查
    const state = JSON.parse(raw);

    // 基础 Schema 检查
    if (!state.accounts || typeof state.accounts !== 'object') {
      console.warn('[StateRepository] state.json 缺少 accounts 字段，尝试迁移或恢复');
      // 尝试迁移
      try {
        const migrated = migrateIfNeeded(state);
        saveState(migrated);
        return { valid: true, message: '旧格式数据已迁移', recovered: true };
      } catch {
        const recovered = _recoverFromBackup();
        if (recovered) {
          return { valid: true, message: '迁移失败，从备份恢复', recovered: true };
        }
        return { valid: false, message: '数据格式异常且无可用备份', recovered: false };
      }
    }

    // 检查 currentAccountId 指向的账户是否存在
    if (state.currentAccountId && !state.accounts[state.currentAccountId]) {
      console.warn(`[StateRepository] currentAccountId ${state.currentAccountId} 不存在，自动修正`);
      const firstAccountId = Object.keys(state.accounts)[0];
      if (firstAccountId) {
        state.currentAccountId = firstAccountId;
        saveState(state);
      }
    }

    return { valid: true, message: '数据文件完整性检查通过', recovered: false };
  } catch (e) {
    console.error('[StateRepository] 完整性检查失败:', e.message);
    const recovered = _recoverFromBackup();
    if (recovered) {
      return { valid: true, message: `从备份恢复成功（原文件损坏: ${e.message}）`, recovered: true };
    }
    return { valid: false, message: `数据文件损坏且无可用备份: ${e.message}`, recovered: false };
  }
}

/**
 * 从备份恢复
 * @returns {boolean} 是否成功恢复
 */
function _recoverFromBackup() {
  for (let i = 1; i <= 3; i++) {
    const backupPath = STATE_FILE.replace('.json', `.backup.${i}.json`);
    try {
      if (!fs.existsSync(backupPath)) continue;
      const stat = fs.statSync(backupPath);
      if (stat.size < MIN_STATE_SIZE) continue;

      const raw = fs.readFileSync(backupPath, 'utf-8');
      const state = JSON.parse(raw);

      // 验证备份数据
      if (!state.accounts) continue;

      // 用备份覆盖主文件
      fs.copyFileSync(backupPath, STATE_FILE);
      console.log(`[StateRepository] ✅ 从备份 ${i} 恢复成功`);
      return true;
    } catch (be) {
      console.error(`[StateRepository] 备份 ${i} 也损坏:`, be.message);
    }
  }
  return false;
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
      const stat = fs.statSync(STATE_FILE);
      if (stat.size < MIN_STATE_SIZE) {
        throw new Error(`文件过小: ${stat.size} bytes`);
      }
      const raw = fs.readFileSync(STATE_FILE, 'utf-8');
      const state = JSON.parse(raw);
      return migrateIfNeeded(state);
    }
  } catch (e) {
    console.error('[StateRepository] Load failed:', e.message);
    if (_recoverFromBackup()) {
      try {
        const raw = fs.readFileSync(STATE_FILE, 'utf-8');
        return migrateIfNeeded(JSON.parse(raw));
      } catch { /* fallback to default below */ }
    }
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

/**
 * 原子写入增强：校验写入后文件大小
 * 同时维护最多 3 个备份文件
 */
function saveState(state) {
  ensureDataDir();
  state.updatedAt = new Date().toISOString();

  // 备份轮转（最多3份）
  try {
    if (fs.existsSync(STATE_FILE)) {
      const stat = fs.statSync(STATE_FILE);
      if (stat.size > MIN_STATE_SIZE) { // 只备份大于阈值的合法文件
        // 3→删除, 2→3, 1→2, current→1
        try { fs.unlinkSync(STATE_FILE.replace('.json', '.backup.3.json')); } catch {}
        try { fs.renameSync(STATE_FILE.replace('.json', '.backup.2.json'), STATE_FILE.replace('.json', '.backup.3.json')); } catch {}
        try { fs.renameSync(STATE_FILE.replace('.json', '.backup.1.json'), STATE_FILE.replace('.json', '.backup.2.json')); } catch {}
        try { fs.copyFileSync(STATE_FILE, STATE_FILE.replace('.json', '.backup.1.json')); } catch {}
      }
    }
  } catch (e) {
    console.warn('[StateRepository] Backup rotation failed:', e.message);
  }

  // 原子写入 + 校验
  const tmpPath = STATE_FILE + '.tmp.' + Date.now();
  try {
    const content = JSON.stringify(state, null, 2);
    fs.writeFileSync(tmpPath, content, 'utf-8');

    // 写入后校验文件大小
    const tmpStat = fs.statSync(tmpPath);
    if (tmpStat.size < MIN_STATE_SIZE) {
      throw new Error(`写入后文件过小 (${tmpStat.size} bytes)，可能是序列化异常`);
    }

    // 快速校验：重新读取并解析
    try {
      const verifyContent = fs.readFileSync(tmpPath, 'utf-8');
      JSON.parse(verifyContent); // 确保可以解析
    } catch (verifyErr) {
      throw new Error(`写入后校验失败: ${verifyErr.message}`);
    }

    fs.renameSync(tmpPath, STATE_FILE);
  } catch (err) {
    try { fs.unlinkSync(tmpPath); } catch {}
    console.error('[StateRepository] 写入失败:', err.message);
    throw err;
  }
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

module.exports = { loadState, saveState, withStateTransaction, migrateIfNeeded, startupIntegrityCheck, DEFAULT_BALANCE };
