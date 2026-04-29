/**
 * Leomoney 冻结/解冻账本
 * 所有资金/持仓冻结操作统一收敛到本模块
 * 禁止在业务逻辑中直接修改 account.balance / holdings
 */

const { D, add, sub, mul, gt, gte, lt, lte, toMoney, toQty, calcAvgCost, calcBuyReserve, calcFee } = require('./money');

/**
 * 冻结现金（买单创建时调用）
 * @param {Object} account - 账户对象
 * @param {string|number} amount - 冻结金额
 * @param {string} reason - 冻结原因
 * @throws {Error} 可用资金不足
 */
function freezeCash(account, amount, reason = '') {
  const amt = D(amount);
  if (amt.lte(0)) throw new Error('冻结金额必须大于0');

  // 确保账户结构完整
  _ensureCashStructure(account);

  if (lt(account.cash.available, amt)) {
    throw new Error(`可用资金不足，可用=${account.cash.available}, 需冻结=${toMoney(amt)}`);
  }

  account.cash.available = toMoney(sub(account.cash.available, amt));
  account.cash.frozen = toMoney(add(account.cash.frozen, amt));
  account.cash.total = toMoney(add(account.cash.available, account.cash.frozen));
  account.updatedAt = new Date().toISOString();

  // 审计日志
  _appendLedgerLog(account, 'FREEZE_CASH', { amount: toMoney(amt), reason, after: { ...account.cash } });
}

/**
 * 释放现金（撤单/条件单过期时调用）
 * @param {Object} account - 账户对象
 * @param {string|number} amount - 释放金额
 * @param {string} reason - 释放原因
 */
function releaseCash(account, amount, reason = '') {
  const amt = D(amount);
  if (amt.lte(0)) return;

  _ensureCashStructure(account);

  // 释放不能超过冻结金额
  const actualRelease = D(amt).gt(account.cash.frozen) ? D(account.cash.frozen) : amt;

  account.cash.frozen = toMoney(sub(account.cash.frozen, actualRelease));
  account.cash.available = toMoney(add(account.cash.available, actualRelease));
  account.cash.total = toMoney(add(account.cash.available, account.cash.frozen));
  account.updatedAt = new Date().toISOString();

  _appendLedgerLog(account, 'RELEASE_CASH', { amount: toMoney(actualRelease), reason, after: { ...account.cash } });
}

/**
 * 冻结持仓（卖单创建时调用）
 * @param {Object} account - 账户对象
 * @param {string} symbol - 标的代码
 * @param {string|number} qty - 冻结数量
 * @param {string} reason - 冻结原因
 * @throws {Error} 可卖数量不足
 */
function freezePosition(account, symbol, qty, reason = '') {
  const q = D(qty);
  if (q.lte(0)) throw new Error('冻结数量必须大于0');

  _ensurePositionStructure(account, symbol);

  const pos = account.positions[symbol];
  if (lt(pos.sellableQty, q)) {
    throw new Error(`可卖数量不足: ${symbol}, 可卖=${pos.sellableQty}, 需冻结=${toQty(q)}`);
  }

  pos.sellableQty = toQty(sub(pos.sellableQty, q));
  pos.frozenQty = toQty(add(pos.frozenQty, q));
  account.updatedAt = new Date().toISOString();

  _appendLedgerLog(account, 'FREEZE_POSITION', { symbol, qty: toQty(q), reason, after: { sellableQty: pos.sellableQty, frozenQty: pos.frozenQty } });
}

/**
 * 释放持仓（撤单/条件单过期时调用）
 * @param {Object} account - 账户对象
 * @param {string} symbol - 标的代码
 * @param {string|number} qty - 释放数量
 * @param {string} reason - 释放原因
 */
function releasePosition(account, symbol, qty, reason = '') {
  const q = D(qty);
  if (q.lte(0)) return;

  if (!account.positions || !account.positions[symbol]) return;
  const pos = account.positions[symbol];

  const actualRelease = D(q).gt(pos.frozenQty) ? D(pos.frozenQty) : q;

  pos.frozenQty = toQty(sub(pos.frozenQty, actualRelease));
  pos.sellableQty = toQty(add(pos.sellableQty, actualRelease));
  account.updatedAt = new Date().toISOString();

  _appendLedgerLog(account, 'RELEASE_POSITION', { symbol, qty: toQty(actualRelease), reason, after: { sellableQty: pos.sellableQty, frozenQty: pos.frozenQty } });
}

/**
 * 结算买入成交
 * @param {Object} account - 账户对象
 * @param {Object} fill - 成交对象 { symbol, name, price, qty, category, orderId }
 * @returns {Object} 结算结果
 */
function settleBuyFill(account, fill) {
  const { symbol, name, price, qty, category = 'astocks', orderId, meta = {} } = fill;

  _ensureCashStructure(account);
  _ensurePositionStructure(account, symbol);

  const totalAmount = mul(price, qty);
  const fee = calcFee(totalAmount);
  const totalCost = add(totalAmount, fee);

  // 从冻结资金中扣除
  if (gt(totalCost, account.cash.frozen)) {
    // 冻结不够覆盖（可能有其他冻结），先从可用中补
    const shortfall = sub(totalCost, account.cash.frozen);
    account.cash.frozen = toMoney(0);
    account.cash.available = toMoney(sub(account.cash.available, shortfall));
  } else {
    account.cash.frozen = toMoney(sub(account.cash.frozen, totalCost));
  }

  account.cash.total = toMoney(add(account.cash.available, account.cash.frozen));

  // 更新持仓
  const pos = account.positions[symbol];
  pos.avgCost = calcAvgCost(pos.avgCost, pos.totalQty, price, qty);
  pos.totalQty = toQty(add(pos.totalQty, qty));
  pos.sellableQty = toQty(add(pos.sellableQty, qty)); // 买入后即可卖
  pos.name = name || pos.name;
  pos.category = category || pos.category;

  // 写入历史
  const unit = _getUnit(category);
  account.history.unshift({
    type: 'buy',
    symbol, name, price: toMoney(price), qty: toQty(qty, _getQtyScale(category)),
    total: toMoney(totalAmount), fee, time: new Date().toISOString(),
    category, unit, orderId,
    settlementType: 'LEDGER_SETTLED',
    ...meta,
  });

  account.updatedAt = new Date().toISOString();

  _appendLedgerLog(account, 'SETTLE_BUY', { symbol, price: toMoney(price), qty, totalCost: toMoney(totalCost), fee, orderId });

  return { success: true, totalCost: toMoney(totalCost), fee, newBalance: account.cash };
}

/**
 * 结算卖出成交
 * @param {Object} account - 账户对象
 * @param {Object} fill - 成交对象 { symbol, name, price, qty, category, orderId }
 * @returns {Object} 结算结果
 */
function settleSellFill(account, fill) {
  const { symbol, name, price, qty, category = 'astocks', orderId, meta = {} } = fill;

  _ensureCashStructure(account);

  if (!account.positions || !account.positions[symbol]) {
    throw new Error(`持仓不存在: ${symbol}`);
  }

  const pos = account.positions[symbol];

  // 优先从冻结中扣，冻结不够从可卖中扣
  let fromFrozen = D(pos.frozenQty);
  let fromSellable = D(0);
  const sellQty = D(qty);

  if (gte(fromFrozen, sellQty)) {
    fromFrozen = sellQty;
  } else {
    fromSellable = sub(sellQty, fromFrozen);
  }

  // 检查可卖数量是否足够
  if (gt(fromSellable, pos.sellableQty)) {
    throw new Error(`可卖数量不足: ${symbol}, 可卖=${pos.sellableQty}, 需卖出=${toQty(sellQty)}`);
  }

  // 计算盈亏
  const totalAmount = mul(price, qty);
  const fee = calcFee(totalAmount);
  const netProceeds = sub(totalAmount, fee);
  const costBasis = mul(pos.avgCost, qty);
  const realizedPnl = sub(netProceeds, costBasis);

  // 更新持仓
  pos.totalQty = toQty(sub(pos.totalQty, qty));
  pos.frozenQty = toQty(sub(pos.frozenQty, fromFrozen));
  pos.sellableQty = toQty(sub(pos.sellableQty, fromSellable));
  pos.realizedPnl = toMoney(add(pos.realizedPnl || 0, realizedPnl));

  // 持仓归零则删除
  if (lte(pos.totalQty, 0)) {
    delete account.positions[symbol];
  }

  // 更新资金
  account.cash.available = toMoney(add(account.cash.available, netProceeds));
  account.cash.total = toMoney(add(account.cash.available, account.cash.frozen));

  // 写入历史
  const unit = _getUnit(category);
  account.history.unshift({
    type: 'sell',
    symbol, name, price: toMoney(price), qty: toQty(qty, _getQtyScale(category)),
    total: toMoney(totalAmount), fee, realizedPnl: toMoney(realizedPnl),
    costBasis: toMoney(costBasis), time: new Date().toISOString(),
    category, unit, orderId,
    settlementType: 'LEDGER_SETTLED',
    ...meta,
  });

  account.updatedAt = new Date().toISOString();

  _appendLedgerLog(account, 'SETTLE_SELL', {
    symbol, price: toMoney(price), qty, netProceeds: toMoney(netProceeds),
    fee, realizedPnl: toMoney(realizedPnl), orderId,
  });

  return { success: true, netProceeds: toMoney(netProceeds), fee, realizedPnl: toMoney(realizedPnl), newBalance: account.cash };
}

// ── 账户结构迁移 ──

/**
 * 迁移旧版账户结构到新版（含 cash / positions）
 * 旧版: balance + holdings[{qty, avgCost}]
 * 新版: cash:{available, frozen, total} + positions:{totalQty, sellableQty, frozenQty, avgCost, realizedPnl}
 */
function migrateAccountIfNeeded(account) {
  if (!account) return;

  // 迁移 cash 结构
  if (!account.cash || typeof account.cash !== 'object') {
    const balance = D(account.balance || 0);
    account.cash = {
      available: toMoney(balance),
      frozen: toMoney(0),
      total: toMoney(balance),
    };
    // 保留旧字段兼容
    account._legacyBalance = account.balance;
    delete account.balance;
  }

  // 迁移 holdings → positions
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
    // 保留旧字段兼容
    account._legacyHoldings = account.holdings;
    delete account.holdings;
  } else if (!account.positions) {
    account.positions = {};
  }

  // 确保 pendingOrders 存在
  if (!account.pendingOrders) account.pendingOrders = [];

  // 确保 ledgerLog 存在
  if (!account.ledgerLog) account.ledgerLog = [];
}

// ── 内部工具 ──

function _ensureCashStructure(account) {
  if (!account.cash || typeof account.cash !== 'object') {
    migrateAccountIfNeeded(account);
  }
}

function _ensurePositionStructure(account, symbol) {
  if (!account.positions) {
    migrateAccountIfNeeded(account);
  }
  if (!account.positions[symbol]) {
    account.positions[symbol] = {
      symbol,
      name: symbol,
      totalQty: toQty(0),
      sellableQty: toQty(0),
      frozenQty: toQty(0),
      avgCost: toMoney(0),
      realizedPnl: toMoney(0),
      category: 'astocks',
    };
  }
}

function _appendLedgerLog(account, type, data) {
  if (!account.ledgerLog) account.ledgerLog = [];
  account.ledgerLog.unshift({
    type,
    data,
    timestamp: new Date().toISOString(),
  });
  // 最多保留 500 条审计日志
  if (account.ledgerLog.length > 500) account.ledgerLog.length = 500;
}

const MARKET_CONFIG = {
  astocks:   { unit: '股',   step: 100, qtyScale: 0 },
  hkstocks:  { unit: '股',   step: 100, qtyScale: 0 },
  usstocks:  { unit: '股',   step: 1,   qtyScale: 0 },
  metals:    { unit: '盎司', step: 1,   qtyScale: 0 },
  crypto:    { unit: '枚',   step: 0.01, qtyScale: 8 },
};

function _getUnit(category) {
  return (MARKET_CONFIG[category] || MARKET_CONFIG.astocks).unit;
}

function _getQtyScale(category) {
  return (MARKET_CONFIG[category] || MARKET_CONFIG.astocks).qtyScale;
}

module.exports = {
  freezeCash,
  releaseCash,
  freezePosition,
  releasePosition,
  settleBuyFill,
  settleSellFill,
  migrateAccountIfNeeded,
};
