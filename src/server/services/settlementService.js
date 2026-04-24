/**
 * Leomoney 结算服务
 * 职责：根据 fill 更新账本（cash/positions）
 * 不直接处理订单状态，只负责资金/持仓结算
 */

const { D, add, sub, mul, div, gt, gte, lt, lte, toMoney, toQty, calcAvgCost } = require('../domain/money');
const { freezeCash, releaseCash, freezePosition, releasePosition } = require('../domain/ledger');
const { EVENT_TYPES, eventBus } = require('../domain/events');

/**
 * 结算买入成交
 * @param {Object} account - 账户对象
 * @param {Object} fill - 成交记录
 * @returns {Object} 结算结果
 */
function settleBuy(account, fill) {
  const { symbol, name, price, qty, totalAmount, fee, orderId } = fill;

  // 确保结构
  if (!account.cash) account.cash = { available: toMoney(0), frozen: toMoney(0), total: toMoney(0) };
  if (!account.positions) account.positions = {};
  if (!account.positions[symbol]) {
    account.positions[symbol] = {
      symbol, name: name || symbol,
      totalQty: toQty(0), sellableQty: toQty(0), frozenQty: toQty(0),
      avgCost: toMoney(0), realizedPnl: toMoney(0), category: 'astocks',
    };
  }

  const pos = account.positions[symbol];
  const totalCost = D(totalAmount).plus(fee || 0);

  // 从冻结中扣除，冻结不够从可用中补
  if (gt(totalCost, account.cash.frozen)) {
    const shortfall = sub(totalCost, account.cash.frozen);
    account.cash.frozen = toMoney(0);
    account.cash.available = toMoney(sub(account.cash.available, shortfall));
  } else {
    account.cash.frozen = toMoney(sub(account.cash.frozen, totalCost));
  }
  account.cash.total = toMoney(add(account.cash.available, account.cash.frozen));

  // 更新持仓
  pos.avgCost = calcAvgCost(pos.avgCost, pos.totalQty, price, qty);
  pos.totalQty = toQty(add(pos.totalQty, qty));
  pos.sellableQty = toQty(add(pos.sellableQty, qty));
  pos.name = name || pos.name;

  // 历史记录
  if (!account.history) account.history = [];
  account.history.unshift({
    type: 'buy', symbol, name: pos.name, price: toMoney(price), qty: toQty(qty),
    total: toMoney(totalAmount), fee: toMoney(fee || 0), time: new Date().toISOString(),
    category: pos.category, orderId, settlementType: 'SETTLED',
  });

  account.updatedAt = new Date().toISOString();

  eventBus.emit(EVENT_TYPES.FILL_SETTLED, {
    accountId: account.id,
    orderId,
    symbol,
    side: 'buy',
    qty,
    price,
    totalCost: toMoney(totalCost),
  });

  return { success: true, totalCost: toMoney(totalCost), fee: toMoney(fee || 0) };
}

/**
 * 结算卖出成交
 * @param {Object} account - 账户对象
 * @param {Object} fill - 成交记录
 * @returns {Object} 结算结果
 */
function settleSell(account, fill) {
  const { symbol, name, price, qty, totalAmount, fee, orderId } = fill;

  if (!account.positions || !account.positions[symbol]) {
    return { success: false, error: `持仓不存在: ${symbol}` };
  }

  const pos = account.positions[symbol];
  const sellQty = D(qty);

  // 优先从冻结中扣
  let fromFrozen = D(pos.frozenQty);
  let fromSellable = D(0);
  if (gte(fromFrozen, sellQty)) {
    fromFrozen = sellQty;
  } else {
    fromSellable = sub(sellQty, fromFrozen);
  }

  // 检查可卖
  if (gt(fromSellable, pos.sellableQty)) {
    return { success: false, error: `可卖数量不足: ${pos.sellableQty} < ${fromSellable}` };
  }

  // 计算盈亏
  const netProceeds = sub(totalAmount, fee || 0);
  const costBasis = mul(pos.avgCost, qty);
  const realizedPnl = sub(netProceeds, costBasis);

  // 更新持仓
  pos.totalQty = toQty(sub(pos.totalQty, qty));
  pos.frozenQty = toQty(sub(pos.frozenQty, fromFrozen));
  pos.sellableQty = toQty(sub(pos.sellableQty, fromSellable));
  pos.realizedPnl = toMoney(add(pos.realizedPnl || 0, realizedPnl));

  // 清仓删除
  if (lte(pos.totalQty, 0)) {
    delete account.positions[symbol];
  }

  // 更新资金
  if (!account.cash) account.cash = { available: toMoney(0), frozen: toMoney(0), total: toMoney(0) };
  account.cash.available = toMoney(add(account.cash.available, netProceeds));
  account.cash.total = toMoney(add(account.cash.available, account.cash.frozen));

  // 历史记录
  if (!account.history) account.history = [];
  account.history.unshift({
    type: 'sell', symbol, name: name || symbol, price: toMoney(price), qty: toQty(qty),
    total: toMoney(totalAmount), fee: toMoney(fee || 0), realizedPnl: toMoney(realizedPnl),
    costBasis: toMoney(costBasis), time: new Date().toISOString(),
    category: pos.category, orderId, settlementType: 'SETTLED',
  });

  account.updatedAt = new Date().toISOString();

  eventBus.emit(EVENT_TYPES.FILL_SETTLED, {
    accountId: account.id,
    orderId,
    symbol,
    side: 'sell',
    qty,
    price,
    netProceeds: toMoney(netProceeds),
    realizedPnl: toMoney(realizedPnl),
  });

  return { success: true, netProceeds: toMoney(netProceeds), fee: toMoney(fee || 0), realizedPnl: toMoney(realizedPnl) };
}

module.exports = { settleBuy, settleSell };
