/**
 * Leomoney 股票列表渲染模块
 */
import { store } from './store.js';
import { getFilteredStocks, getWatchlistStocks } from './market.js';
import { getCategoryRules, getCurrencySymbol } from './format.js';
import { apiGet, apiDelete } from './api.js';
import { refreshWatchlist, notify } from './account.js';

export function renderStockList() {
  const el = document.getElementById('watchlist');
  if (!el) return;

  // 搜索结果优先
  if (store.searchResults.length > 0) {
    el.innerHTML = store.searchResults.map(s => {
      const tagClass = s.category || 'a';
      const catLabel = getCategoryRules(s.category).label;
      const isFav = store.watchlist.some(w => w.symbol === s.symbol);
      return `<div class="stock-item" data-search-symbol="${s.symbol}" data-sina-code="${s.sinaCode || ''}" data-category="${s.category || ''}" data-name="${s.name}">
        <div class="stock-info">
          <div class="stock-name-row"><span class="stock-name">${s.name}</span><span class="stock-tag ${tagClass}">${catLabel}</span></div>
          <div class="stock-symbol">${s.symbol} · ${s.sector || ''}</div>
        </div>
        <div class="stock-price-area">
          <button class="fav-btn ${isFav ? 'active' : ''}" data-fav-symbol="${s.symbol}" data-fav-name="${s.name}" data-fav-category="${s.category || ''}" data-fav-currency="${s.currency || 'CNY'}" title="${isFav ? '取消自选' : '加入自选'}">${isFav ? '★' : '☆'}</button>
          <div class="stock-price" style="color:var(--text-secondary)">点击查看</div>
        </div>
      </div>`;
    }).join('');
    bindStockListEvents(el);
    return;
  }

  // 自选模式
  if (store.currentListMode === 'fav') {
    const favStocks = getWatchlistStocks();
    if (favStocks.length === 0) {
      el.innerHTML = `<div class="empty-state" style="padding:30px 16px">
        <div style="font-size:2rem;margin-bottom:8px">☆</div>
        <div style="color:var(--text-secondary);font-size:.9rem">自选列表为空</div>
        <div style="color:var(--text-secondary);font-size:.8rem;margin-top:6px">搜索股票后点击 ☆ 加入自选</div>
      </div>`;
      return;
    }
    el.innerHTML = favStocks.map(s => renderStockItem(s, true)).join('');
    bindStockListEvents(el);
    return;
  }

  // 热门行情模式
  const filtered = getFilteredStocks();
  el.innerHTML = filtered.map(s => renderStockItem(s, false)).join('');
  bindStockListEvents(el);
}

function renderStockItem(s, isFavMode) {
  if (s.noQuote) {
    return `<div class="stock-item" data-symbol="${s.symbol}">
      <div class="stock-info">
        <div class="stock-name-row"><span class="stock-name">${s.name}</span><span class="stock-tag">${getCategoryRules(s.category).label}</span></div>
        <div class="stock-symbol">${s.symbol} · 休市无报价</div>
      </div>
      <div class="stock-price-area">
        <button class="fav-btn active" data-fav-symbol="${s.symbol}" title="取消自选">★</button>
      </div>
    </div>`;
  }
  const change = s.price - (s.prevClose || s.price);
  const pct = (change / (s.prevClose || s.price) * 100) || 0;
  const isUp = change >= 0;
  const isActive = store.selectedStock?.symbol === s.symbol;
  const cur = getCurrencySymbol(s.currency);
  const isFav = store.watchlist.some(w => w.symbol === s.symbol);

  return `<div class="stock-item ${isActive ? 'active' : ''}" data-symbol="${s.symbol}">
    <div class="stock-info">
      <div class="stock-name-row"><span class="stock-name">${s.name}</span><span class="stock-tag">${getCategoryRules(s.category).label}</span></div>
      <div class="stock-symbol">${s.symbol} · ${s.sector || ''}</div>
    </div>
    <div class="stock-price-area">
      <button class="fav-btn ${isFav ? 'active' : ''}" data-fav-symbol="${s.symbol}" data-fav-name="${s.name}" data-fav-category="${s.category || ''}" data-fav-currency="${s.currency || 'CNY'}" title="${isFav ? '取消自选' : '加入自选'}">${isFav ? '★' : '☆'}</button>
      <div class="stock-price">${cur}${s.price >= 1000 ? s.price.toFixed(0) : s.price.toFixed(2)}</div>
      <div class="stock-change ${isUp ? 'up' : 'down'}">${isUp ? '+' : ''}${pct.toFixed(2)}%</div>
    </div>
  </div>`;
}

function bindStockListEvents(el) {
  // 点击股票项
  el.querySelectorAll('.stock-item[data-symbol]').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.fav-btn')) return;
      const sym = item.dataset.symbol;
      if (sym) {
        import('./trade.js').then(m => m.selectStock(sym));
      }
    });
  });
  // 点击搜索结果项
  el.querySelectorAll('.stock-item[data-search-symbol]').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.fav-btn')) return;
      const sym = item.dataset.searchSymbol;
      const sinaCode = item.dataset.sinaCode;
      const category = item.dataset.category;
      const name = item.dataset.name;
      import('./trade.js').then(m => m.selectStockFromSearch(sym, sinaCode, category, name));
    });
  });
  // 自选按钮
  el.querySelectorAll('.fav-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFavorite(btn.dataset.favSymbol, btn.dataset.favName, btn.dataset.favCategory, btn.dataset.favCurrency);
    });
  });
}

export async function toggleFavorite(symbol, name, category, currency) {
  const isFav = store.watchlist.some(w => w.symbol === symbol);
  if (isFav) {
    const r = await apiDelete('/api/watchlist/' + encodeURIComponent(symbol));
    if (r && r.success) { await refreshWatchlist(); renderStockList(); notify('已从自选移除', 'info'); }
    else notify(r?.error || '移除失败', 'error');
  } else {
    const { apiPost } = await import('./api.js');
    const r = await apiPost('/api/watchlist', { symbol, name, category: category || 'astocks', currency: currency || 'CNY' });
    if (r && r.success) { await refreshWatchlist(); renderStockList(); notify('已加入自选', 'success'); }
    else notify(r?.error || '添加失败', 'error');
  }
  // 更新当前标的面板
  if (store.selectedStock && store.selectedStock.symbol === symbol) {
    import('./trade.js').then(m => m.updateCurrentSymbolPanel());
  }
}

export function filterStocks(val) {
  store.searchFilter = val;
  if (store.searchTimer) clearTimeout(store.searchTimer);
  if (!val || val.length < 1) {
    store.searchResults = [];
    renderStockList();
    return;
  }
  store.searchTimer = setTimeout(async () => {
    const d = await apiGet('/api/search?q=' + encodeURIComponent(val));
    store.searchResults = (d && d.success) ? (d.results || []) : [];
    renderStockList();
  }, 300);
}
