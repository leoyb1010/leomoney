/**
 * Leomoney 交易服务层
 * 现货买卖、持仓管理
 */

const { loadState, saveState, DEFAULT_BALANCE } = require('../repositories/stateRepository');
const { getMarketConfig, getUnit } = require('../domain/models');

function validateQty(qty, category) {
  if (!qty || qty <= 0) return { ok: false, error: '数量必须大于0' };
  const cfg = getMarketConfig(category);
  if (cfg.multiple && qty % cfg.step !== 0) return { ok: false, error: `数量必须为${cfg.step}的整数倍` };
  return { ok: true };
}

function buy(stockQuote, qty, limitPrice = null) {
  const price = limitPrice || stockQuote.price;
  const category = stockQuote.category || 'astocks';
  if (!price || price <= 0) return { success: false, error: '无效价格' };

  const v = validateQty(qty, category);
  if (!v.ok) return { success: false, error: v.error };

  const total = price * qty;
  const state = loadState();
  const accountId = state.currentAccountId;
  const account = state.accounts[accountId];
  if (!account) return { success: false, error: '当前账户不存在' };
  if (total > account.balance) return { success: false, error: `资金不足，可用: ¥${account.balance.toFixed(2)}` };

  account.balance -= total;
  if (!account.holdings[stockQuote.symbol]) {
    account.holdings[stockQuote.symbol] = { qty: 0, avgCost: 0, name: stockQuote.name, category };
  }
  const h = account.holdings[stockQuote.symbol];
  h.avgCost = (h.avgCost * h.qty + price * qty) / (h.qty + qty);
  h.qty += qty;
  h.name = stockQuote.name;
  h.category = category;

  const unit = getUnit(category);
  account.history.unshift({
    type: 'buy', symbol: stockQuote.symbol, name: stockQuote.name,
    price, qty, total, time: new Date().toISOString(), category, unit,
    strategy: stockQuote.strategy || undefined,
  });
  account.updatedAt = new Date().toISOString();
  saveState(state);
  return { success: true, message: `买入 ${stockQuote.name} ${qty}${unit} @ ¥${price.toFixed(2)}`, balance: account.balance, holding: account.holdings[stockQuote.symbol], accountId };
}

function sell(stockQuote, qty, limitPrice = null) {
  const price = limitPrice || stockQuote.price;
  const category = stockQuote.category || 'astocks';
  if (!price || price <= 0) return { success: false, error: '无效价格' };

  const v = validateQty(qty, category);
  if (!v.ok) return { success: false, error: v.error };

  const state = loadState();
  const accountId = state.currentAccountId;
  const account = state.accounts[accountId];
  if (!account) return { success: false, error: '当前账户不存在' };

  const h = account.holdings[stockQuote.symbol];
  if (!h || h.qty < qty) return { success: false, error: `持仓不足，可用: ${h ? h.qty : 0}${getUnit(category)}` };

  const total = price * qty;
  account.balance += total;
  h.qty -= qty;
  if (h.qty === 0) delete account.holdings[stockQuote.symbol];

  const unit = getUnit(category);
  account.history.unshift({
    type: 'sell', symbol: stockQuote.symbol, name: stockQuote.name,
    price, qty, total, time: new Date().toISOString(), category, unit,
    strategy: stockQuote.strategy || undefined,
  });
  account.updatedAt = new Date().toISOString();
  saveState(state);
  return { success: true, message: `卖出 ${stockQuote.name} ${qty}${unit} @ ¥${price.toFixed(2)}`, balance: account.balance, holding: h.qty > 0 ? account.holdings[stockQuote.symbol] : null, accountId };
}

module.exports = { buy, sell, validateQty };
