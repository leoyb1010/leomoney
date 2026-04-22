/**
 * Leomoney 交易模块
 * 选股、交易面板、条件单
 */
import { store } from './store.js';
import { apiGet, apiPost } from './api.js';
import { getCategoryRules, toCNY, formatMoney, getCurrencySymbol } from './format.js';
import { getAllStocks, getFilteredStocks, getWatchlistStocks } from './market.js';
import { refreshAccount, refreshAccountSummary, notify } from './account.js';
import { renderStockList } from './stockList.js';

export async function selectStockFromSearch(symbol, sinaCode, category, name) {
  const d = await apiGet('/api/quotes/' + encodeURIComponent(symbol));
  if (d && d.quote) {
    const q = d.quote;
    store.selectedStock = {
      symbol: q.symbol, name: q.name || name, price: q.price, prevClose: q.prevClose,
      open: q.open, high: q.high, low: q.low, volume: q.volume,
      change: q.change, changePercent: q.changePercent,
      sector: q.sector || '', category: q.category || category, currency: q.currency || 'CNY',
    };
  } else {
    store.selectedStock = {
      symbol, name, price: 0, prevClose: 0, open: 0, high: 0, low: 0,
      volume: 0, change: 0, changePercent: 0, sector: '', category: category || 'astocks', currency: 'CNY',
    };
  }
  store.searchResults = [];
  store.searchFilter = '';
  const input = document.querySelector('.search-input');
  if (input) input.value = '';
  store.selectedIndex = null;
  finalizeStockSelection();
}

export function selectStock(symbol) {
  store.selectedStock = getFilteredStocks().find(s => s.symbol === symbol) || getWatchlistStocks().find(s => s.symbol === symbol);
  if (!store.selectedStock) return;
  store.selectedIndex = null;
  finalizeStockSelection();
}

function finalizeStockSelection() {
  import('./chart.js').then(m => {
    m.generateCandles(store.selectedStock.symbol);
    m.updateChartHeader();
    m.drawChart();
  });
  renderStockList();
  import('./indices.js').then(m => m.renderIndices());
  applyStockToTradePanel();
  updateCurrentSymbolPanel();
}

export function applyStockToTradePanel() {
  if (!store.selectedStock) return;
  const rules = getCategoryRules(store.selectedStock.category);
  const symInput = document.getElementById('tradeSymbol');
  const priceInput = document.getElementById('tradePrice');
  const orderSymInput = document.getElementById('orderSymbol');
  const qtyInput = document.getElementById('tradeQty');
  if (symInput) symInput.value = store.selectedStock.symbol + ' ' + store.selectedStock.name;
  if (priceInput) priceInput.value = store.selectedStock.price.toFixed(2);
  if (orderSymInput) orderSymInput.value = store.selectedStock.symbol + ' ' + store.selectedStock.name;
  if (qtyInput) {
    qtyInput.value = '';
    qtyInput.step = rules.step;
    qtyInput.min = rules.minQty;
    qtyInput.placeholder = rules.multiple ? `${rules.minQty}的整数倍` : `最小${rules.minQty}`;
  }
  const unitLabel = document.getElementById('qtyUnitLabel');
  const orderUnitLabel = document.getElementById('orderQtyUnitLabel');
  if (unitLabel) unitLabel.textContent = rules.unit;
  if (orderUnitLabel) orderUnitLabel.textContent = rules.unit;
  calcTotal();
}

export function setTradeType(type) {
  store.tradeType = type;
  document.querySelectorAll('.trade-tab').forEach(t => t.classList.remove('active'));
  const tab = document.querySelector(`.trade-tab.${type}`);
  if (tab) tab.classList.add('active');
  const spot = document.getElementById('tradeFormSpot');
  const order = document.getElementById('tradeFormOrder');
  const btn = document.getElementById('submitBtn');
  if (type === 'order') {
    if (spot) spot.style.display = 'none';
    if (order) order.style.display = 'flex';
  } else {
    if (spot) spot.style.display = 'flex';
    if (order) order.style.display = 'none';
    if (btn) {
      btn.className = `submit-btn ${type}-btn action-button ${type}`;
      btn.textContent = type === 'buy' ? '买入下单' : '卖出下单';
      btn.setAttribute('data-side', type);
      btn.setAttribute('aria-label', type === 'buy' ? '买入下单' : '卖出下单');
      btn.setAttribute('data-testid', type === 'buy' ? 'submit-buy-order' : 'submit-sell-order');
    }
  }
  calcTotal();
}

export function setQty(q) {
  const el = document.getElementById('tradeQty');
  if (el) el.value = q;
  calcTotal();
}

export function setQtyMax() {
  if (!store.selectedStock) return;
  const rules = getCategoryRules(store.selectedStock.category);
  const qtyInput = document.getElementById('tradeQty');
  if (!qtyInput) return;
  if (store.tradeType === 'buy') {
    const priceInCNY = toCNY(store.selectedStock.price, store.selectedStock.currency, store.fxRates);
    let maxQty = rules.multiple
      ? Math.floor(store.accountData.balance / priceInCNY / rules.step) * rules.step
      : Math.floor(store.accountData.balance / priceInCNY / rules.step);
    qtyInput.value = Math.max(0, maxQty);
  } else {
    const h = store.accountData.holdings[store.selectedStock.symbol];
    qtyInput.value = h ? h.qty : 0;
  }
  calcTotal();
}

export function calcTotal() {
  const price = parseFloat(document.getElementById('tradePrice')?.value) || 0;
  const qty = parseFloat(document.getElementById('tradeQty')?.value) || 0;
  const rules = store.selectedStock ? getCategoryRules(store.selectedStock.category) : getCategoryRules('astocks');
  const cur = store.selectedStock?.currency || 'CNY';
  const totalOrig = price * qty;
  const totalCNY = toCNY(totalOrig, cur, store.fxRates);
  const totalEl = document.getElementById('tradeTotal');
  if (totalEl) {
    totalEl.textContent = cur !== 'CNY' ? `$${totalOrig.toFixed(2)} ≈ ${formatMoney(totalCNY)}` : formatMoney(totalOrig);
  }

  let qtyValid = qty >= rules.minQty;
  if (rules.multiple) qtyValid = qtyValid && qty % rules.step === 0;
  const valid = price && qtyValid;
  const submitBtn = document.getElementById('submitBtn');
  if (submitBtn) submitBtn.disabled = !valid;

  const validationEl = document.getElementById('tradeValidation');
  if (validationEl) {
    if (!valid && qty > 0) {
      if (rules.multiple && qty % rules.step !== 0) validationEl.textContent = `数量必须为${rules.step}的整数倍`;
      else if (qty < rules.minQty) validationEl.textContent = `最小数量为${rules.minQty}${rules.unit}`;
      else if (!price) validationEl.textContent = '请输入委托价格';
      validationEl.className = 'trade-validation error';
    } else if (valid) {
      const totalCNYForCheck = toCNY(price * qty, cur, store.fxRates);
      if (store.tradeType === 'buy') {
        if (totalCNYForCheck > store.accountData.balance) validationEl.textContent = `资金不足，需约 ${formatMoney(totalCNYForCheck)}，可用 ${formatMoney(store.accountData.balance)}`;
        else validationEl.textContent = '';
        validationEl.className = totalCNYForCheck > store.accountData.balance ? 'trade-validation error' : 'trade-validation';
      } else {
        const h = store.accountData.holdings[store.selectedStock?.symbol];
        if (h && qty > h.qty) validationEl.textContent = `可卖不足，持有 ${h?.qty || 0} ${rules.unit}`;
        else validationEl.textContent = '';
        validationEl.className = (h && qty > h.qty) ? 'trade-validation error' : 'trade-validation';
      }
    } else {
      validationEl.textContent = '';
      validationEl.className = 'trade-validation';
    }
  }

  const hintEl = document.getElementById('qtyHint');
  if (hintEl && store.selectedStock) {
    const rules2 = getCategoryRules(store.selectedStock.category);
    if (store.tradeType === 'buy') {
      const priceInCNY = toCNY(store.selectedStock.price, store.selectedStock.currency, store.fxRates);
      let maxQty = rules2.multiple
        ? Math.floor(store.accountData.balance / priceInCNY / rules2.step) * rules2.step
        : Math.floor(store.accountData.balance / priceInCNY / rules2.step);
      hintEl.textContent = `可买 ${Math.max(0, maxQty)} ${rules2.unit}`;
    } else {
      const h = store.accountData.holdings[store.selectedStock?.symbol];
      hintEl.textContent = `可卖 ${h ? h.qty : 0} ${rules2.unit}`;
    }
  }
}

export async function submitOrder() {
  if (!store.selectedStock) return;
  const price = parseFloat(document.getElementById('tradePrice')?.value);
  const qty = parseFloat(document.getElementById('tradeQty')?.value);
  const rules = getCategoryRules(store.selectedStock.category);
  let qtyValid = qty >= rules.minQty;
  if (rules.multiple) qtyValid = qtyValid && qty % rules.step === 0;
  const validationEl = document.getElementById('tradeValidation');
  if (!price || !qtyValid) {
    let msg = '请输入有效价格和数量';
    if (rules.multiple && qty % rules.step !== 0) msg = `数量必须为${rules.step}的整数倍`;
    else if (qty < rules.minQty) msg = `最小数量为${rules.minQty}${rules.unit}`;
    if (validationEl) { validationEl.textContent = msg; validationEl.className = 'trade-validation error'; }
    notify(msg, 'error'); return;
  }
  const result = await apiPost(`/api/trade/${store.tradeType}`, { symbol: store.selectedStock.symbol, qty, price });
  if (result && result.success) {
    const msg = store.tradeType === 'buy' ? '买入下单成功' : '卖出下单成功';
    notify(msg, 'success');
    if (validationEl) { validationEl.textContent = msg; validationEl.className = 'trade-validation success'; }
    await refreshAccount();
    await refreshAccountSummary();
    if (store.tradeType === 'sell') { document.getElementById('tradeQty').value = ''; calcTotal(); }
    updateCurrentSymbolHolding();
    if (store.currentView === 'portfolio') {
      const { renderPortfolioView } = await import('./portfolio.js');
      renderPortfolioView();
    }
    if (store.currentView === 'history') {
      const { renderHistoryView } = await import('./history.js');
      renderHistoryView();
    }
  } else {
    const errMsg = result?.error || '下单失败：未知错误';
    notify(errMsg, 'error');
    if (validationEl) { validationEl.textContent = errMsg; validationEl.className = 'trade-validation error'; }
  }
}

/* ===== 条件单 ===== */
export async function submitOrderCondition() {
  if (!store.selectedStock) return notify('请先选择股票', 'error');
  const rules = getCategoryRules(store.selectedStock.category);
  const triggerPrice = parseFloat(document.getElementById('orderTriggerPrice')?.value);
  const qty = parseFloat(document.getElementById('orderQty')?.value);
  const triggerType = document.getElementById('orderTriggerType')?.value;
  const dir = document.getElementById('orderDir')?.value;
  let qtyValid = qty >= rules.minQty;
  if (rules.multiple) qtyValid = qtyValid && qty % rules.step === 0;
  if (!triggerPrice || !qtyValid) { notify(`请填写完整信息（数量最小${rules.minQty}${rules.unit}）`, 'error'); return; }
  const result = await apiPost('/api/orders', {
    symbol: store.selectedStock.symbol, name: store.selectedStock.name,
    type: dir, triggerType, triggerPrice, qty, category: store.selectedStock.category
  });
  if (result && result.success) {
    notify('条件单创建成功', 'success');
    document.getElementById('orderTriggerPrice').value = '';
    document.getElementById('orderQty').value = '';
    await refreshAccount();
  } else notify(result?.error || '条件单创建失败', 'error');
}

export function renderOrderList() {
  const el = document.getElementById('orderList');
  if (!el) return;
  const orders = store.accountData.pendingOrders || [];
  if (orders.length === 0) { el.innerHTML = ''; return; }
  el.innerHTML = orders.map(o => {
    const sign = o.triggerType === 'gte' ? '≥' : '≤';
    const rules = getCategoryRules(o.category);
    return `<div class="order-item">
      <span class="order-item-info">${o.name} ${o.type === 'buy' ? '买入' : '卖出'} ${o.qty}${rules.unit} 触发:${sign}${o.triggerPrice}</span>
      <div class="order-item-actions"><button class="order-btn-delete" data-testid="cancel-order" data-role="cancel-order" aria-label="取消条件单" data-order-id="${o.id}">取消条件单</button></div>
    </div>`;
  }).join('');
  // 绑定取消事件
  el.querySelectorAll('.order-btn-delete').forEach(btn => {
    btn.addEventListener('click', () => cancelOrder(btn.dataset.orderId));
  });
}

export async function cancelOrder(id) {
  try {
    const { apiDelete } = await import('./api.js');
    await apiDelete(`/api/orders/${id}`);
    notify('条件单取消成功', 'info');
    await refreshAccount();
  } catch (e) { notify('取消失败', 'error'); }
}

/* ===== 当前标的强化区 ===== */
export function updateCurrentSymbolPanel() {
  const panel = document.getElementById('currentSymbolPanel');
  if (!panel) return;
  if (!store.selectedStock) { panel.style.display = 'none'; return; }
  panel.style.display = 'block';
  panel.setAttribute('data-symbol', store.selectedStock.symbol);
  const s = store.selectedStock;
  const change = s.price - (s.prevClose || s.price);
  const pct = (change / (s.prevClose || s.price) * 100) || 0;
  const isUp = change >= 0;
  const cur = getCurrencySymbol(s.currency);

  const nameEl = document.getElementById('csName');
  const codeEl = document.getElementById('csCode');
  const priceEl = document.getElementById('csPrice');
  const changeEl = document.getElementById('csChange');
  const dirEl = document.getElementById('csDirection');

  if (nameEl) nameEl.textContent = s.name;
  if (codeEl) codeEl.textContent = s.symbol + ' · ' + (s.sector || '');
  if (priceEl) { priceEl.textContent = cur + s.price.toFixed(2); priceEl.style.color = isUp ? 'var(--green)' : 'var(--red)'; }
  if (changeEl) { changeEl.textContent = `${isUp ? '+' : ''}${change.toFixed(2)} (${isUp ? '+' : ''}${pct.toFixed(2)}%)`; changeEl.className = `current-symbol-change ${isUp ? 'up' : 'down'}`; }
  if (dirEl) { dirEl.textContent = isUp ? '上涨' : '下跌'; dirEl.className = `current-symbol-direction ${isUp ? 'up' : 'down'}`; }

  const favEl = document.getElementById('csFavBtn');
  if (favEl) {
    const isFav = store.watchlist.some(w => w.symbol === s.symbol);
    favEl.textContent = isFav ? '★ 已自选' : '☆ 加自选';
    favEl.className = `fav-panel-btn ${isFav ? 'active' : ''}`;
    favEl.onclick = () => {
      import('./stockList.js').then(m => m.toggleFavorite(s.symbol, s.name, s.category, s.currency));
    };
  }

  const cnyEl = document.getElementById('csCNYHint');
  if (cnyEl) {
    if (s.currency && s.currency !== 'CNY') {
      cnyEl.textContent = `≈ ¥${toCNY(s.price, s.currency, store.fxRates).toFixed(2)}`;
      cnyEl.style.display = 'block';
    } else {
      cnyEl.style.display = 'none';
    }
  }

  updateCurrentSymbolHolding();
}

export function updateCurrentSymbolHolding() {
  const el = document.getElementById('csHolding');
  if (!el || !store.selectedStock) return;
  const h = store.accountData.holdings[store.selectedStock.symbol];
  const rules = getCategoryRules(store.selectedStock.category);
  if (h) {
    const pnl = toCNY((store.selectedStock.price - h.avgCost) * h.qty, store.selectedStock.currency, store.fxRates);
    const isUp = pnl >= 0;
    el.style.display = 'block';
    el.innerHTML = `持有 ${h.qty}${rules.unit} · 成本 ${h.avgCost.toFixed(2)} · 浮盈 ${isUp ? '+' : ''}${pnl.toFixed(2)}（${isUp ? '+' : ''}${((store.selectedStock.price - h.avgCost) / h.avgCost * 100).toFixed(2)}%）`;
    el.style.color = isUp ? 'var(--green)' : 'var(--red)';
  } else {
    el.style.display = 'none';
  }
}

export function updateSelectedStockPrice() {
  if (!store.selectedStock) return;
  const all = getAllStocks();
  const fresh = all.find(s => s.symbol === store.selectedStock.symbol);
  if (fresh) {
    store.selectedStock.price = fresh.price;
    store.selectedStock.prevClose = fresh.prevClose;
    store.selectedStock.open = fresh.open;
    store.selectedStock.high = fresh.high;
    store.selectedStock.low = fresh.low;
    store.selectedStock.change = fresh.change;
    store.selectedStock.changePercent = fresh.changePercent;
    import('./chart.js').then(m => m.updateChartHeader());
    updateCurrentSymbolPanel();
  }
}
