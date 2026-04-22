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
    summary.innerHTML = `
      <div class="summary-card" data-testid="metric-total-assets"><div class="summary-label">总资产(CNY)</div><div class="summary-value">${formatMoney(s.totalAssets)}</div></div>
      <div class="summary-card" data-testid="metric-cash"><div class="summary-label">可用资金</div><div class="summary-value" style="color:var(--green)">${formatMoney(s.cash)}</div></div>
      <div class="summary-card" data-testid="metric-market-value"><div class="summary-label">持仓市值(CNY)</div><div class="summary-value" style="color:var(--blue)">${formatMoney(s.holdingValue)}</div></div>
      <div class="summary-card" data-testid="metric-unrealized-pnl"><div class="summary-label">未实现盈亏</div><div class="summary-value" style="color:${s.totalUnrealizedPnL >= 0 ? 'var(--green)' : 'var(--red)'}">${s.totalUnrealizedPnL >= 0 ? '+' : ''}${s.totalUnrealizedPnL.toFixed(2)}</div></div>
      <div class="summary-card" data-testid="metric-today-pnl"><div class="summary-label">今日收益</div><div class="summary-value" style="color:${s.todayRealizedPnL >= 0 ? 'var(--green)' : 'var(--red)'}">${s.todayRealizedPnL >= 0 ? '+' : ''}${s.todayRealizedPnL.toFixed(2)}</div></div>
      <div class="summary-card" data-testid="metric-holding-count"><div class="summary-label">持仓数量</div><div class="summary-value">${s.holdingCount} 只</div></div>
      ${s.rates ? `<div style="font-size:.75rem;color:var(--text-secondary);padding:4px 8px;grid-column:1/-1">汇率：1 USD = ${s.rates.USD} CNY · 1 HKD = ${s.rates.HKD} CNY · 多币种资产已折算为CNY</div>` : ''}`;

    if (!s.holdings || s.holdings.length === 0) {
      list.innerHTML = '<div class="empty-state" data-role="empty-state"><div class="empty-state__icon">📭</div><div class="empty-state__text">暂无持仓</div></div>';
      return;
    }
    list.innerHTML = s.holdings.map(h => {
      const rules = getCategoryRules(h.category);
      const origCur = getCurrencySymbol(h.currency);
      return `<div class="holding-card" data-testid="holding-item" data-symbol="${h.symbol}"><div class="holding-left">
        <div class="holding-name">${h.name || h.symbol} (${h.symbol})</div>
        <div class="holding-detail">${formatQty(h.qty)}${rules.unit} · 成本 ${origCur}${h.avgCost.toFixed(2)} · 现价 ${origCur}${h.latestPrice.toFixed(2)}</div>
        <div class="holding-detail">市值 ${h.conversionHint || formatMoney(h.marketValueCNY)}</div>
      </div><div class="holding-right">
        <div class="holding-pnl ${h.isUp ? 'up' : 'down'}">${h.isUp ? '+' : ''}${h.unrealizedPnL.toFixed(2)}</div>
        <div class="holding-pct ${h.isUp ? 'up' : 'down'}">${h.isUp ? '+' : ''}${h.unrealizedPnLRatio.toFixed(2)}%</div>
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
