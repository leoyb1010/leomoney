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

  // 确保数据就绪
  if (!store.accountSummary) {
    try {
      const { refreshAccountSummary } = await import('./account.js');
      await refreshAccountSummary();
    } catch {}
  }

  const summary = store.accountSummary || {};
  const acc = store.accountData || {};
  const totalAssets = Number(summary.totalAssets ?? acc.balance ?? 0);
  const cash = summary.cash && typeof summary.cash === 'object' ? Number(summary.cash.available ?? 0) : Number(summary.cash ?? acc.balance ?? 0);
  const cashFrozen = summary.cash && typeof summary.cash === 'object' ? Number(summary.cash.frozen ?? 0) : 0;
  const marketValue = Number(summary.holdingValue ?? summary.totalMarketValue ?? 0);
  const totalPnL = Number(summary.totalUnrealizedPnL ?? summary.totalPnL ?? 0);
  const todayPnL = Number(summary.todayRealizedPnL ?? 0);
  const costBasis = totalAssets - totalPnL;
  const pnlPct = costBasis > 0 ? (totalPnL / costBasis * 100) : 0;
  const holdings = summary.holdingCount ?? Object.keys(acc.positions || acc.holdings || {}).length;
  const pendingOrders = summary.pendingOrders || acc.pendingOrders || [];
  const pendingCount = pendingOrders.filter(o => o.status === 'pending').length;
  const executedCount = pendingOrders.filter(o => o.status === 'executed').length;

  setKPI('dkpiTotalAssets', fmtMoney(totalAssets), '');
  setKPI('dkpiCash', fmtMoney(cash), totalAssets > 0 ? `${((cash / totalAssets) * 100).toFixed(1)}% of total` : '0.0% of total');
  setKPI('dkpiMarketValue', fmtMoney(marketValue), totalAssets > 0 ? `${((marketValue / totalAssets) * 100).toFixed(1)}% of total` : '0.0% of total');
  const pnlColor = totalPnL >= 0 ? 'color:#10b981' : 'color:#ef4444';
  setKPI('dkpiPnL', fmtMoney(totalPnL), `${totalPnL >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%`, pnlColor);
  setKPI('dkpiHoldingCount', String(holdings), `待触发: ${pendingCount} · 已执行: ${executedCount}`);

  renderDashboardMarketList('astocks');
  renderDashboardWatchlist();
  renderDashboardRecentTrades();
  renderNavCurve('30');
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

// ── 资产净值曲线 ──────────────────────────────────────────
let _navChart = null;
let _navSeries = null;

export function renderNavCurve(range = '30') {
  const container = document.getElementById('navCurveContainer');
  if (!container) return;

  // 基于交易记录模拟净值曲线
  const history = store.accountData?.history || [];
  const initialAssets = 1000000;
  const now = new Date();
  let points = [];

  if (history.length === 0) {
    // 无交易记录时只显示初始点
    points.push({ time: Math.floor(now.getTime() / 1000) - 86400, value: initialAssets });
    points.push({ time: Math.floor(now.getTime() / 1000), value: initialAssets });
  } else {
    // 计算每笔交易后的资产净值
    let nav = initialAssets;
    points.push({ time: Math.floor(new Date(history[0].time || now).getTime() / 1000) - 3600, value: nav });

    history.forEach(t => {
      const tTime = t.time ? new Date(t.time) : now;
      const totalAmount = Number(t.totalAmount || (t.qty * t.price) || 0);
      if (t.type === 'buy') nav -= totalAmount;
      else if (t.type === 'sell') nav += totalAmount;
      points.push({ time: Math.floor(tTime.getTime() / 1000), value: nav });
    });

    // 最后加一个当前时刻的快照
    const totalAssets = Number(store.accountSummary?.totalAssets ?? initialAssets);
    points.push({ time: Math.floor(now.getTime() / 1000), value: totalAssets });
  }

  // 按 range 过滤
  if (range !== 'all') {
    const daysBack = parseInt(range) || 30;
    const cutoff = Math.floor(now.getTime() / 1000) - daysBack * 86400;
    const filtered = points.filter(p => p.time >= cutoff);
    // 确保至少有一个起始点
    if (filtered.length === 0 && points.length > 0) {
      filtered.unshift({ time: cutoff, value: points[0].value });
    }
    points = filtered;
  }

  // 确保 time 严格递增（去重）
  const seen = new Set();
  points = points.filter(p => {
    if (seen.has(p.time)) return false;
    seen.add(p.time);
    return true;
  });
  points.sort((a, b) => a.time - b.time);

  // 创建或复用 LightweightCharts 实例
  if (!_navChart) {
    _navChart = LightweightCharts.createChart(container, {
      layout: { background: { color: 'transparent' }, textColor: '#8892a4', fontSize: 11 },
      grid: { vertLines: { visible: false }, horzLines: { visible: false } },
      rightPriceScale: { borderColor: 'transparent', scaleMargins: { top: 0.1, bottom: 0.1 } },
      timeScale: { borderColor: 'transparent', timeVisible: true, rightOffset: 5 },
      crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
      width: container.clientWidth,
      height: container.clientHeight,
    });
    _navSeries = _navChart.addAreaSeries({
      topColor: 'rgba(249,115,22,0.3)',
      bottomColor: 'rgba(249,115,22,0)',
      lineColor: '#f97316',
      lineWidth: 2,
    });
  }

  _navSeries.setData(points);
  _chart_fitNavContent();
}

function _chart_fitNavContent() {
  if (_navChart) _navChart.timeScale().fitContent();
}

// 绑定净值曲线时间范围切换
document.addEventListener('click', (e) => {
  const tab = e.target.closest('.nav-curve-tab');
  if (!tab) return;
  document.querySelectorAll('.nav-curve-tab').forEach(t => t.classList.remove('active'));
  tab.classList.add('active');
  renderNavCurve(tab.dataset.range);
});
