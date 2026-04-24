/**
 * Leomoney 资产/持仓模块
 */
import { store } from './store.js';
import { formatMoney, formatQty, getCategoryRules, getCurrencySymbol } from './format.js';

export function renderPortfolioView() {
  const summary = document.getElementById('portfolioSummary');
  const list = document.getElementById('portfolioList');
  if (!summary || !list) return;

  if (store.accountSummary) {
    const s = store.accountSummary;
    // 使用新 cash 结构
    const cash = s.cash || { available: s.cash || 0, frozen: 0, total: s.cash || 0 };
    summary.innerHTML = `
      <div class="summary-card" data-testid="metric-total-assets"><div class="summary-label">总资产(CNY)</div><div class="summary-value">${formatMoney(s.totalAssets)}</div></div>
      <div class="summary-card" data-testid="metric-cash-available"><div class="summary-label">可用资金</div><div class="summary-value" style="color:var(--green)">${formatMoney(cash.available)}</div></div>
      <div class="summary-card" data-testid="metric-cash-frozen"><div class="summary-label">冻结资金</div><div class="summary-value" style="color:var(--orange)">${formatMoney(cash.frozen)}</div></div>
      <div class="summary-card" data-testid="metric-market-value"><div class="summary-label">持仓市值(CNY)</div><div class="summary-value" style="color:var(--blue)">${formatMoney(s.holdingValue)}</div></div>
      <div class="summary-card" data-testid="metric-unrealized-pnl"><div class="summary-label">未实现盈亏</div><div class="summary-value" style="color:${Number(s.totalUnrealizedPnL) >= 0 ? 'var(--green)' : 'var(--red)'}">${Number(s.totalUnrealizedPnL) >= 0 ? '+' : ''}${Number(s.totalUnrealizedPnL).toFixed(2)}</div></div>
      <div class="summary-card" data-testid="metric-today-pnl"><div class="summary-label">今日收益</div><div class="summary-value" style="color:${Number(s.todayRealizedPnL) >= 0 ? 'var(--green)' : 'var(--red)'}">${Number(s.todayRealizedPnL) >= 0 ? '+' : ''}${Number(s.todayRealizedPnL).toFixed(2)}</div></div>
      <div class="summary-card" data-testid="metric-holding-count"><div class="summary-label">持仓数量</div><div class="summary-value">${s.holdingCount} 只</div></div>
      ${s.rates ? `<div style="font-size:.75rem;color:var(--text-secondary);padding:4px 8px;grid-column:1/-1">汇率：1 USD = ${s.rates.USD} CNY · 1 HKD = ${s.rates.HKD} CNY · 多币种资产已折算为CNY</div>` : ''}`;

    const holdings = s.holdings || s.positions || [];
    if (!holdings || holdings.length === 0) {
      list.innerHTML = '<div class="empty-state" data-role="empty-state"><div class="empty-state__icon">📭</div><div class="empty-state__text">暂无持仓</div></div>';
      return;
    }
    list.innerHTML = holdings.map(h => {
      const rules = getCategoryRules(h.category);
      const origCur = getCurrencySymbol(h.currency);
      // 新结构兼容
      const totalQty = h.totalQty !== undefined ? h.totalQty : h.qty;
      const sellableQty = h.sellableQty !== undefined ? h.sellableQty : h.qty;
      const frozenQty = h.frozenQty !== undefined ? h.frozenQty : 0;
      return `<div class="holding-card" data-testid="holding-item" data-symbol="${h.symbol}"><div class="holding-left">
        <div class="holding-name">${h.name || h.symbol} (${h.symbol})</div>
        <div class="holding-detail">总 ${formatQty(totalQty)}${rules.unit} · 可卖 ${formatQty(sellableQty)} · 冻结 ${formatQty(frozenQty)}</div>
        <div class="holding-detail">成本 ${origCur}${Number(h.avgCost || 0).toFixed(2)} · 现价 ${origCur}${Number(h.latestPrice || 0).toFixed(2)} · 市值 ${h.conversionHint || formatMoney(h.marketValueCNY)}</div>
      </div><div class="holding-right">
        <div class="holding-pnl ${h.isUp ? 'up' : 'down'}">${h.isUp ? '+' : ''}${Number(h.unrealizedPnL || 0).toFixed(2)}</div>
        <div class="holding-pct ${h.isUp ? 'up' : 'down'}">${h.isUp ? '+' : ''}${Number(h.unrealizedPnLRatio || 0).toFixed(2)}%</div>
        <div style="font-size:.7rem;color:var(--text-muted);margin-top:2px">${h.isUp ? '上涨' : '下跌'}</div>
      </div></div>`;
    }).join('');

    list.querySelectorAll('.holding-card').forEach(card => {
      card.addEventListener('click', () => {
        const sym = card.dataset.symbol;
        if (sym) {
          import('./trade.js').then(m => m.selectStock(sym));
          import('./views.js').then(m => m.switchView('quotes'));
        }
      });
    });
    return;
  }

  // 兜底
  summary.innerHTML = '<div class="empty-state"><p>加载中...</p></div>';
}
