/**
 * Leomoney 指数栏模块
 */
import { store } from './store.js';

export function renderIndices() {
  const bar = document.getElementById('indexBar');
  if (!bar) return;
  const indices = store.quotesData.indices || [];
  if (!indices.length) { bar.innerHTML = ''; return; }
  bar.innerHTML = indices.map(idx => {
    const change = idx.price - (idx.prevClose || idx.price);
    const pct = idx.changePercent || (idx.prevClose ? ((change / idx.prevClose) * 100) : 0);
    const isUp = change >= 0;
    const color = isUp ? 'var(--green)' : 'var(--red)';
    return `<div class="index-item" data-index-id="${idx.id}" style="cursor:pointer">
      <div class="index-name">${idx.name}</div>
      <div class="index-value" style="color:${color}">${idx.price >= 1000 ? idx.price.toFixed(0) : idx.price.toFixed(2)}</div>
      <div class="index-change ${isUp ? 'up' : 'down'}">${isUp ? '+' : ''}${pct.toFixed(2)}%</div>
    </div>`;
  }).join('');

  bar.querySelectorAll('.index-item').forEach(item => {
    item.addEventListener('click', () => selectIndex(item.dataset.indexId));
  });
}

export function selectIndex(id) {
  const idx = store.quotesData.indices?.find(i => i.id === id);
  if (!idx) return;
  store.selectedIndex = { ...idx };
  store.selectedStock = null;
  import('./chart.js').then(m => {
    m.generateCandles(id, 40, true);
    m.updateChartHeader();
    m.drawChart();
  });
  import('./stockList.js').then(m => m.renderStockList());
}
