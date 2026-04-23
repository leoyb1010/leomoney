/**
 * Leomoney Dashboard 总览 + 条件单管理视图
 */
import { store } from './store.js';
import { apiGet } from './api.js';
import { fmtMoney, fmtPct, fmtQty } from './format.js';

const CAT_LABELS = { astocks:'A股', hkstocks:'港股', usstocks:'美股', metals:'贵金属', crypto:'加密' };

// ── Dashboard 总览 ──────────────────────────────────────────
export async function renderDashboard() {
  // 更新账户名
  const accNameEl = document.getElementById('dashboardAccountName');
  if (accNameEl) {
    accNameEl.textContent = store.currentAccountName || '默认账户';
  }

  const summary = store.accountSummary || {};
  const acc = store.accountData || {};
  const totalAssets = summary.totalAssets ?? acc.balance ?? 0;
  const cash = summary.cash ?? acc.balance ?? 0;
  const marketValue = summary.holdingValue ?? summary.totalMarketValue ?? 0;
  const totalPnL = summary.totalUnrealizedPnL ?? summary.totalPnL ?? 0;
  const costBasis = totalAssets - totalPnL;
  const pnlPct = costBasis > 0 ? (totalPnL / costBasis * 100) : 0;
  const holdings = summary.holdingCount ?? Object.keys(acc.holdings || {}).length;
  const pendingCount = (summary.pendingOrders || acc.pendingOrders || []).length;

  setKPI('dkpiTotalAssets', fmtMoney(totalAssets), '');
  setKPI('dkpiCash', fmtMoney(cash), totalAssets > 0 ? `${((cash / totalAssets) * 100).toFixed(1)}% of total` : '0.0% of total');
  setKPI('dkpiMarketValue', fmtMoney(marketValue), totalAssets > 0 ? `${((marketValue / totalAssets) * 100).toFixed(1)}% of total` : '0.0% of total');
  const pnlColor = totalPnL >= 0 ? 'color:#ef4444' : 'color:#22c55e';
  setKPI('dkpiPnL', fmtMoney(totalPnL), `${totalPnL >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%`, pnlColor);
  setKPI('dkpiHoldingCount', String(holdings), `Pending: ${pendingCount}`);

  renderDashboardMarketList('astocks');
  renderDashboardWatchlist();
  renderDashboardRecentTrades();
}

function setKPI(id, value, sub, valueStyle) {
  const valueEl = document.getElementById(id);
  if (!valueEl) return;
  valueEl.textContent = value;
  valueEl.style.cssText = valueStyle || '';

  const card = valueEl.closest('.kpi-card');
  const subEl = card ? card.querySelector('.kpi-sub') : null;
  if (subEl) subEl.textContent = sub || '';
}

export function renderDashboardStats() {
  renderDashboard();
}

export function renderDashboardMarketList(cat) {
  const el = document.getElementById('dashboardMarketList');
  if (!el) return;
  const quotes = store.quotesData?.[cat] || [];
  if (!quotes.length) {
    el.innerHTML = '<div class="empty-state"><p>暂无行情</p></div>';
    return;
  }
  el.innerHTML = quotes.slice(0, 8).map(s => {
    const chg = s.change || 0;
    const chgPct = s.changePercent || 0;
    const isUp = chg >= 0;
    return `<div class="dash-stock-item" data-symbol="${s.symbol}">
      <span class="dash-stock-cat">${CAT_LABELS[cat] || cat}</span>
      <span class="dash-stock-name">${s.name || s.symbol}</span>
      <span class="dash-stock-price">${fmtMoney(s.price)}</span>
      <span class="dash-stock-change" style="color:${isUp?'#ef4444':'#22c55e'}">${isUp?'+':''}${chg.toFixed(2)} ${fmtPct(chgPct)}</span>
    </div>`;
  }).join('');
}

function renderDashboardWatchlist() {
  const el = document.getElementById('dashboardWatchlist');
  if (!el) return;
  const wl = store.watchlistData || [];
  if (!wl.length) {
    el.innerHTML = '<div style="font-size:.82rem;color:var(--text-secondary);padding:8px 0">暂无自选</div>';
    return;
  }
  el.innerHTML = wl.slice(0, 5).map(item => {
    return `<div class="dash-stock-item" data-symbol="${item.symbol}">
      <span class="dash-stock-name">${item.name || item.symbol}</span>
      <span class="dash-stock-cat">${CAT_LABELS[item.category] || ''}</span>
    </div>`;
  }).join('');
}

function renderDashboardRecentTrades() {
  const el = document.getElementById('dashboardRecentTrades');
  if (!el) return;
  const history = store.accountData?.history || [];
  const recent = history.slice(-5).reverse();
  if (!recent.length) {
    el.innerHTML = '<div style="font-size:.82rem;color:var(--text-secondary);padding:8px 0">暂无成交</div>';
    return;
  }
  el.innerHTML = recent.map(t => {
    const isBuy = t.type === 'buy';
    const time = t.time ? new Date(t.time).toLocaleString('zh-CN', {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}) : '';
    return `<div class="dash-trade-item">
      <span class="dash-trade-side ${t.type}">${isBuy?'买':'卖'}</span>
      <div class="dash-trade-info">
        <div class="dash-trade-symbol">${t.symbol}</div>
        <div class="dash-trade-detail">${t.name||''} ${fmtQty(t.qty)} @ ${fmtMoney(t.price)}</div>
      </div>
      <span class="dash-trade-time">${time}</span>
    </div>`;
  }).join('');
}

// ── 条件单管理 ──────────────────────────────────────────────
let currentOrderFilter = 'pending';

export async function renderOrders(filter) {
  if (filter) currentOrderFilter = filter;
  const el = document.getElementById('ordersList');
  if (!el) return;

  const pending = store.accountData?.pendingOrders || [];
  const history = store.accountData?.history || [];

  // 更新统计
  const pEl = document.getElementById('ostatPending');
  const eEl = document.getElementById('ostatExecuted');
  const fEl = document.getElementById('ostatFailed');
  const executedOrders = pending.filter(o => o.status === 'executed');
  const failedOrders = pending.filter(o => o.status === 'failed');
  const pendingOnly = pending.filter(o => o.status === 'pending');

  if (pEl) pEl.textContent = pendingOnly.length;
  if (eEl) eEl.textContent = executedOrders.length;
  if (fEl) fEl.textContent = failedOrders.length;

  if (currentOrderFilter === 'pending') {
    if (!pendingOnly.length) {
      el.innerHTML = '<div class="empty-state"><p>暂无待触发条件单</p><p style="font-size:.8rem;margin-top:4px">在交易面板创建价格触发单</p></div>';
      return;
    }
    el.innerHTML = pendingOnly.map(o => orderCardHTML(o)).join('');
  } else if (currentOrderFilter === 'executed') {
    if (!executedOrders.length) {
      el.innerHTML = '<div class="empty-state"><p>暂无已执行条件单</p></div>';
      return;
    }
    el.innerHTML = executedOrders.map(o => orderCardHTML(o)).join('');
  } else if (currentOrderFilter === 'failed') {
    if (!failedOrders.length) {
      el.innerHTML = '<div class="empty-state"><p>暂无失败条件单</p></div>';
      return;
    }
    el.innerHTML = failedOrders.map(o => orderCardHTML(o)).join('');
  } else if (currentOrderFilter === 'history') {
    if (!history.length) {
      el.innerHTML = '<div class="empty-state"><p>暂无成交记录</p></div>';
      return;
    }
    el.innerHTML = history.slice(-20).reverse().map(h => tradeCardHTML(h)).join('');
  } else {
    el.innerHTML = [...pending.map(o => orderCardHTML(o)), ...history.slice(-10).reverse().map(h => tradeCardHTML(h))].join('');
  }
}

function orderCardHTML(o) {
  const label = o.triggerType === 'gte' ? '≥' : '≤';
  const triggered = o.status === 'executed';
  const failed = o.status === 'failed';
  const sc = failed ? '#ef4444' : triggered ? '#22c55e' : '#f59e0b';
  const st = failed ? '失败' : triggered ? '已执行' : '待触发';
  const time = o.createdAt ? new Date(o.createdAt).toLocaleString('zh-CN') : '';
  return `<div class="order-item">
    <div class="order-item-left">
      <div class="order-item-symbol">${o.symbol}</div>
      <div class="order-item-meta">${o.name||''} · ${label} ¥${o.triggerPrice} × ${fmtQty(o.qty)}</div>
      <div class="order-item-time">${time}</div>
    </div>
    <div class="order-item-right">
      <div class="order-item-status" style="color:${sc}">${st}</div>
      ${!triggered && !failed ? `<button class="order-cancel-btn" data-id="${o.id}">取消</button>` : ''}
    </div>
  </div>`;
}

function tradeCardHTML(h) {
  const isBuy = h.type === 'buy';
  const time = h.time ? new Date(h.time).toLocaleString('zh-CN',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}) : '';
  return `<div class="order-item">
    <div class="order-item-left">
      <div class="order-item-symbol">${h.symbol}</div>
      <div class="order-item-meta">${h.name||''} ${fmtQty(h.qty)} @ ${fmtMoney(h.price)}</div>
      <div class="order-item-time">${time}</div>
    </div>
    <div class="order-item-right">
      <span class="dash-trade-side ${h.type}">${isBuy?'买':'卖'}</span>
    </div>
  </div>`;
}

export function filterOrders(filter) {
  document.querySelectorAll('.orders-filter .preset-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.ofilter === filter);
  });
  renderOrders(filter);
}

// 条件单取消（事件委托）
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('.order-cancel-btn');
  if (!btn) return;
  const id = btn.dataset.id;
  if (!id) return;
  try {
    const { apiDelete } = await import('./api.js');
    await apiDelete('/api/orders/' + encodeURIComponent(id));
    const acc = await apiGet('/api/account');
    if (acc) store.accountData = acc;
    renderOrders(currentOrderFilter);
  } catch(err) { console.error('cancel order failed', err); }
});
