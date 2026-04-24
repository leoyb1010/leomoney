/**
 * Leomoney 资产/持仓模块
 */
import { store } from './store.js';
import { formatMoney, formatQty, getCategoryRules, getCurrencySymbol } from './format.js';

export function renderPortfolioView() {
  const summary = document.getElementById('portfolioSummary');
  const list = document.getElementById('portfolioList');
  if (!summary || !list) return;

  // 先渲染持仓分布图表
  renderPortfolioCharts();

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

// ── 持仓分布可视化 ──
function renderPortfolioCharts() {
  renderHoldingPie();
  renderPnlBars();
}

function renderHoldingPie() {
  const container = document.getElementById('holdingPieContainer');
  if (!container) return;

  const holdings = store.accountSummary?.holdings || store.accountSummary?.positions || [];
  if (!holdings.length) {
    container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-muted);font-size:.85rem">暂无持仓数据</div>';
    return;
  }

  // 计算市值
  const data = holdings.map(h => ({
    name: h.name || h.symbol,
    value: Number(h.marketValueCNY || h.marketValue || 0),
  })).filter(d => d.value > 0);

  if (!data.length) return;

  const total = data.reduce((s, d) => s + d.value, 0);
  const colors = ['#f97316','#3b82f6','#10b981','#8b5cf6','#ef4444','#06b6d4','#f59e0b','#ec4899'];

  // Canvas 饼图
  const canvas = document.createElement('canvas');
  canvas.width = container.clientWidth * 2;
  canvas.height = container.clientHeight * 2;
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  container.innerHTML = '';
  container.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  ctx.scale(2, 2);
  const W = container.clientWidth;
  const H = container.clientHeight;

  const cx = W * 0.35;
  const cy = H / 2;
  const outerR = Math.min(cx - 20, cy - 20);
  const innerR = outerR * 0.6;

  let startAngle = -Math.PI / 2;
  data.forEach((d, i) => {
    const sliceAngle = (d.value / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, startAngle, startAngle + sliceAngle);
    ctx.arc(cx, cy, innerR, startAngle + sliceAngle, startAngle, true);
    ctx.closePath();
    ctx.fillStyle = colors[i % colors.length];
    ctx.fill();
    startAngle += sliceAngle;
  });

  // 中心文字
  ctx.fillStyle = '#e2e8f0';
  ctx.font = 'bold 14px "JetBrains Mono"';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(formatMoney(total), cx, cy - 6);
  ctx.font = '11px "Space Grotesk"';
  ctx.fillStyle = '#8892a4';
  ctx.fillText('总市值', cx, cy + 12);

  // 图例
  const legendX = W * 0.65;
  let legendY = 20;
  data.slice(0, 7).forEach((d, i) => {
    ctx.fillStyle = colors[i % colors.length];
    ctx.fillRect(legendX, legendY, 10, 10);
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '11px "Space Grotesk"';
    ctx.textAlign = 'left';
    const pct = ((d.value / total) * 100).toFixed(1);
    const label = d.name.length > 6 ? d.name.slice(0, 6) + '..' : d.name;
    ctx.fillText(`${label} ${pct}%`, legendX + 16, legendY + 9);
    legendY += 22;
  });
}

function renderPnlBars() {
  const container = document.getElementById('holdingPnlContainer');
  if (!container) return;

  const holdings = store.accountSummary?.holdings || store.accountSummary?.positions || [];
  if (!holdings.length) {
    container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-muted);font-size:.85rem">暂无持仓数据</div>';
    return;
  }

  // 提取盈亏数据并排序
  const data = holdings.map(h => ({
    name: h.name || h.symbol,
    pnl: Number(h.unrealizedPnL || 0),
    pct: Number(h.unrealizedPnLRatio || 0),
  })).sort((a, b) => b.pnl - a.pnl);

  const maxAbs = Math.max(...data.map(d => Math.abs(d.pnl)), 1);

  const canvas = document.createElement('canvas');
  canvas.width = container.clientWidth * 2;
  canvas.height = container.clientHeight * 2;
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  container.innerHTML = '';
  container.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  ctx.scale(2, 2);
  const W = container.clientWidth;
  const H = container.clientHeight;

  const barH = 18;
  const gap = 6;
  const labelW = 80;
  const barStartX = labelW + 10;
  const barMaxW = W - barStartX - 80;

  data.slice(0, 8).forEach((d, i) => {
    const y = i * (barH + gap) + 10;
    const barW = (Math.abs(d.pnl) / maxAbs) * barMaxW;
    const isUp = d.pnl >= 0;
    const color = isUp ? '#10b981' : '#ef4444';
    const barX = isUp ? barStartX + barMaxW * 0.05 : barStartX + barMaxW * 0.05 - barW;

    // 名称
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '11px "Space Grotesk"';
    ctx.textAlign = 'right';
    const label = d.name.length > 5 ? d.name.slice(0, 5) + '..' : d.name;
    ctx.fillText(label, labelW, y + barH / 2 + 4);

    // 进度条背景
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.fillRect(barStartX, y, barMaxW * 0.05 * 2, barH);

    // 盈亏条
    ctx.fillStyle = color;
    ctx.fillRect(barX, y + 2, barW, barH - 4);

    // 盈亏金额
    ctx.fillStyle = color;
    ctx.font = '10px "JetBrains Mono"';
    ctx.textAlign = 'left';
    ctx.fillText(`${isUp ? '+' : ''}${d.pnl.toFixed(0)}`, barStartX + barMaxW * 0.1 + barMaxW * 0.9 + 5, y + barH / 2 + 4);
  });
}
