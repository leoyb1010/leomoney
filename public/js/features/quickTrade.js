/**
 * Leomoney 快捷交易模块
 */
import { store } from './store.js';
import { apiGet, apiPost } from './api.js';
import { toCNY, getCurrencySymbol } from './format.js';
import { getAllStocks } from './market.js';
import { refreshAccount, refreshAccountSummary, notify } from './account.js';

export async function quickLookup() {
  const symInput = document.getElementById('quickSymbol');
  const resultEl = document.getElementById('quickQuoteResult');
  if (!symInput || !resultEl) return;
  const sym = symInput.value.trim().toUpperCase();
  if (!sym || sym.length < 2) { resultEl.innerHTML = '<div class="empty-state"><p>输入代码查看行情</p></div>'; return; }

  const local = getAllStocks().find(s => s.symbol === sym);
  if (local) {
    renderQuickQuote(local, resultEl);
    const priceInput = document.getElementById('quickPrice');
    if (priceInput) priceInput.value = local.price.toFixed(2);
    return;
  }

  const d = await apiGet('/api/quotes/' + encodeURIComponent(sym));
  if (d && d.quote) {
    renderQuickQuote(d.quote, resultEl, true);
    const priceInput = document.getElementById('quickPrice');
    if (priceInput) priceInput.value = d.quote.price.toFixed(2);
  } else {
    resultEl.innerHTML = '<div class="empty-state"><p>未找到该资产</p></div>';
  }
}

function renderQuickQuote(q, el, isRemote = false) {
  const change = q.change || (q.price - (q.prevClose || q.price));
  const pct = q.changePercent || (q.prevClose ? (change / q.prevClose * 100) : 0);
  const isUp = change >= 0;
  const cur = getCurrencySymbol(q.currency);
  const cnyHint = q.currency !== 'CNY' ? ` ≈ ¥${toCNY(q.price, q.currency, store.fxRates).toFixed(2)}` : '';
  const sector = isRemote ? (q.market || '') + ' ' + (q.category || '') : (q.sector || '') + (q.unit ? ' · ' + q.unit : '');
  el.innerHTML = `<div><div style="font-size:1.1rem;font-weight:700;margin-bottom:6px">${q.name} (${q.symbol})</div>
    <div style="font-family:var(--font-mono);font-size:1.3rem;color:${isUp ? 'var(--green)' : 'var(--red)'}">${cur}${q.price.toFixed(2)}${cnyHint} ${isUp ? '+' : ''}${change.toFixed(2)} (${isUp ? '+' : ''}${pct.toFixed(2)}%)</div>
    <div style="color:var(--text-secondary);font-size:.85rem;margin-top:6px">${sector}</div></div>`;
}

export async function quickTrade(type) {
  const symInput = document.getElementById('quickSymbol');
  const priceInput = document.getElementById('quickPrice');
  const qtyInput = document.getElementById('quickQty');
  if (!symInput || !priceInput || !qtyInput) return;
  const sym = symInput.value.trim().toUpperCase();
  const price = parseFloat(priceInput.value);
  const qty = parseFloat(qtyInput.value);
  if (!sym || !price || !qty || qty <= 0) { notify('请填写完整信息', 'error'); return; }
  const result = await apiPost(`/api/trade/${type}`, { symbol: sym, qty, price });
  if (result && result.success) {
    notify(type === 'buy' ? '买入下单成功' : '卖出下单成功', 'success');
    qtyInput.value = '';
    await refreshAccount();
    await refreshAccountSummary();
  } else notify(result?.error || '下单失败', 'error');
}
