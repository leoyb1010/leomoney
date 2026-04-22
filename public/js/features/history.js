/**
 * Leomoney 成交记录模块
 */
import { store } from './store.js';
import { formatMoney, formatQty, getCategoryRules } from './format.js';

export function filterHistory(type) {
  store.historyFilter = type;
  document.querySelectorAll('.history-filter .preset-btn').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-filter') === type);
  });
  renderHistoryView();
}

export function renderHistoryView() {
  const list = document.getElementById('historyList');
  if (!list) return;
  let trades = store.accountData.history || [];
  if (store.historyFilter !== 'all') trades = trades.filter(t => t.type === store.historyFilter);
  if (!trades.length) {
    list.innerHTML = '<div class="empty-state" data-role="empty-state"><div class="empty-state__icon">📝</div><div class="empty-state__text">暂无成交记录</div></div>';
    return;
  }
  list.innerHTML = trades.slice(0, 100).map(h => {
    const d = new Date(h.time);
    const timeStr = isNaN(d) ? h.time : d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    const rules = getCategoryRules(h.category);
    const unit = h.unit || rules.unit;
    const dirText = h.type === 'buy' ? '买入' : '卖出';
    return `<div class="history-item" data-testid="history-item" data-role="history-item" data-side="${h.type}" data-symbol="${h.symbol}">
      <span class="history-type ${h.type}">${dirText}</span>
      <span class="history-detail">${h.name} ${formatQty(h.qty)}${unit} @ ${h.price.toFixed(2)}</span>
      <div class="history-amount"><div class="history-amount-value">${formatMoney(h.total)}</div><div class="history-time">${timeStr}</div></div>
    </div>`;
  }).join('');
}
