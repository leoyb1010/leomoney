/**
 * Leomoney 市场/行情模块
 */
import { store } from './store.js';
import { apiGet } from './api.js';

export async function refreshMarketStatus() {
  const d = await apiGet('/api/market');
  if (d && d.success) {
    store.marketStatus = d;
    updateStatusUI();
  }
}

export function updateStatusUI() {
  const dot = document.getElementById('statusDot');
  const label = document.getElementById('marketLabel');
  const frozen = document.getElementById('frozenIndicator');
  if (!dot || !label) return;

  dot.className = 'status-dot';
  if (store.marketStatus.isOpen) {
    label.innerHTML = `${store.marketStatus.status} · <span class="market-closed-badge open">实时行情</span>`;
    if (frozen) frozen.style.display = 'none';
  } else {
    const s = store.marketStatus.status || '已收盘';
    const isPre = s.includes('盘前') || s.includes('午间');
    dot.classList.add(isPre ? 'premarket' : 'closed');
    label.innerHTML = `${s} · <span class="market-closed-badge ${isPre ? 'premarket' : 'closed'}">${isPre ? '等待开盘' : '行情冻结'}</span>`;
    if (frozen) {
      frozen.style.display = 'flex';
      frozen.querySelector('span').textContent = '市场已休，行情冻结在收盘价';
    }
  }

  if (store.lastQuoteTime) {
    const timeStr = new Date(store.lastQuoteTime).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const tsEl = document.getElementById('quoteTimestamp');
    if (tsEl) tsEl.textContent = '更新于 ' + timeStr;
  }

  // API 健康状态指示器
  const health = store.marketStatus?.apiHealth;
  if (health) {
    const sinaDot = document.getElementById('sinaApiDot');
    const eastDot = document.getElementById('eastmoneyApiDot');
    if (sinaDot) sinaDot.className = 'api-dot' + (health.sina?.ok ? '' : health.sina?.failCount > 0 ? ' warn' : ' error');
    if (eastDot) eastDot.className = 'api-dot' + (health.eastmoney?.ok ? '' : health.eastmoney?.failCount > 0 ? ' warn' : ' error');
  }
}

export async function refreshQuotes() {
  const d = await apiGet('/api/quotes');
  if (d && d.success) {
    store.quotesData = d;
    store.quoteStatus = d.quoteStatus || null;
    store.lastQuoteTime = d.ts || Date.now();
    if (d.rates) store.fxRates = d.rates;
    return true;
  }
  return false;
}

export function getAllStocks() {
  const all = [];
  const cats = ['astocks', 'hkstocks', 'usstocks', 'metals', 'crypto'];
  cats.forEach(cat => {
    (store.quotesData[cat] || []).forEach(s => all.push({ ...s, category: cat }));
  });
  return all;
}

export function getFilteredStocks() {
  const filter = store.searchFilter.toLowerCase();
  const cats = store.currentMarketCat === 'all'
    ? ['astocks', 'hkstocks', 'usstocks', 'metals', 'crypto']
    : [store.currentMarketCat];
  let all = [];
  cats.forEach(cat => {
    (store.quotesData[cat] || []).forEach(s => all.push({ ...s, category: cat }));
  });
  if (!filter) return all;
  return all.filter(s => s.name.toLowerCase().includes(filter) || s.symbol.toLowerCase().includes(filter));
}

export function getWatchlistStocks() {
  if (!store.watchlist.length) return [];
  const all = getAllStocks();
  return store.watchlist.map(w => {
    const q = all.find(s => s.symbol === w.symbol);
    return q
      ? { ...q, isFavorite: true }
      : { ...w, price: 0, prevClose: 0, change: 0, changePercent: 0, isFavorite: true, noQuote: true };
  }).filter(s => {
    if (store.currentMarketCat === 'all') return true;
    return s.category === store.currentMarketCat;
  });
}
