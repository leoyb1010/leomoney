/**
 * Leomoney 复盘分析模块
 */
import { store } from './store.js';
import { apiGet } from './api.js';

export async function loadAnalysis() {
  const d = await apiGet('/api/analysis');
  if (!d || !d.success) {
    const el = document.getElementById('metricCards');
    if (el) el.innerHTML = '<div class="empty-state"><p>加载分析数据失败</p></div>';
    return;
  }
  store.analysisData = d;
  renderMetricCards(d.总结);
  renderInsights(d.总结.表现);
  renderEquityCurve(d.分析.盈亏明细);
  renderPnlDist(d.分析.盈亏明细);
  renderAnalysisTradeList(d.分析.盈亏明细);
}

function renderMetricCards(总结) {
  const el = document.getElementById('metricCards');
  if (!el) return;
  const p = 总结.表现;
  const e = 总结.评估;
  const 总收益 = p.总收益;
  const 胜率 = p.胜率;
  const 盈亏比 = p.盈亏比;
  const 最大回撤 = p.最大回撤;

  function valClass(v, positiveGood = true) {
    if (v === null || v === undefined) return 'neutral';
    if (positiveGood) return v > 0 ? 'positive' : v < 0 ? 'negative' : 'neutral';
    return v < 0 ? 'negative' : 'neutral';
  }
  function fmt(v, suffix = '', decimals = 2) {
    if (v === null || v === undefined) return '--';
    return (v > 0 ? '+' : '') + v.toFixed(decimals) + suffix;
  }

  el.innerHTML = `
    <div class="metric-card"><div class="metric-card-label">总收益</div><div class="metric-card-value ${valClass(总收益)}">${fmt(总收益, '')}</div><div class="metric-card-sub">${p.交易次数 || 0} 笔交易</div></div>
    <div class="metric-card"><div class="metric-card-label">胜率</div><div class="metric-card-value ${valClass(胜率, true)}">${胜率 !== null ? (胜率 * 100).toFixed(1) + '%' : '--'}</div><div class="metric-card-sub">${e.状态 || '--'}</div></div>
    <div class="metric-card"><div class="metric-card-label">盈亏比</div><div class="metric-card-value ${valClass(盈亏比, true)}">${fmt(盈亏比, '', 2)}</div><div class="metric-card-sub">风险: ${e.风险 || '--'}</div></div>
    <div class="metric-card"><div class="metric-card-label">最大回撤</div><div class="metric-card-value ${最大回撤 !== null ? 'negative' : 'neutral'}">${最大回撤 !== null ? (最大回撤 * 100).toFixed(1) + '%' : '--'}</div><div class="metric-card-sub">从峰值计算</div></div>`;
}

function renderInsights(metrics) {
  const panel = document.getElementById('insightsPanel');
  if (!panel) return;
  const insights = [];
  const trades = metrics.交易次数 || 0;
  const winRate = metrics.胜率;
  const pnlRatio = metrics.盈亏比;
  const maxDD = metrics.最大回撤;
  if (trades < 5) insights.push('当前交易样本较少，分析结论仅供参考。');
  if (winRate !== null && winRate >= 0.6 && pnlRatio !== null && pnlRatio < 1.2) insights.push('胜率较高，但盈亏比偏弱，可能存在赚小亏大的问题。');
  if (maxDD !== null && maxDD <= -0.15) insights.push('最大回撤偏高，建议降低仓位集中度并减少连续追单。');
  if (winRate !== null && winRate >= 0.5 && pnlRatio !== null && pnlRatio >= 1.5) insights.push('胜率和盈亏比均表现良好，当前策略框架有效。');
  if (!insights.length) insights.push('当前交易表现较均衡，建议继续关注仓位控制与交易节奏。');
  panel.style.display = 'block';
  panel.innerHTML = insights.map(i => `<div class="insight-item"><span class="insight-icon">💡</span><span>${i}</span></div>`).join('');
}

function renderEquityCurve(盈亏明细) {
  const canvas = document.getElementById('equityCanvas');
  if (!canvas) return;
  const container = canvas.parentElement;
  const dpr = window.devicePixelRatio || 1;
  const W = container.clientWidth, H = container.clientHeight;
  canvas.width = W * dpr; canvas.height = H * dpr;
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr); ctx.clearRect(0, 0, W, H);
  if (!盈亏明细 || 盈亏明细.length === 0) { ctx.fillStyle = '#4a5568'; ctx.font = '14px Space Grotesk'; ctx.textAlign = 'center'; ctx.fillText('暂无数据', W / 2, H / 2); return; }
  let cumPnl = [0]; 盈亏明细.forEach(t => { cumPnl.push(cumPnl[cumPnl.length - 1] + (t.pnl || 0)); });
  const pad = { top: 10, right: 10, bottom: 20, left: 50 };
  const cW = W - pad.left - pad.right; const cH = H - pad.top - pad.bottom;
  const minV = Math.min(...cumPnl); const maxV = Math.max(...cumPnl); const range = maxV - minV || 1;
  const xStep = cW / (cumPnl.length - 1 || 1);
  const zeroY = pad.top + ((maxV - 0) / range) * cH;
  ctx.strokeStyle = '#2a3f5f'; ctx.lineWidth = 0.5; ctx.setLineDash([4, 4]);
  ctx.beginPath(); ctx.moveTo(pad.left, zeroY); ctx.lineTo(W - pad.right, zeroY); ctx.stroke(); ctx.setLineDash([]);
  ctx.beginPath(); cumPnl.forEach((v, i) => { const x = pad.left + i * xStep; const y = pad.top + ((maxV - v) / range) * cH; if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
  const lastX = pad.left + (cumPnl.length - 1) * xStep;
  ctx.lineTo(lastX, zeroY); ctx.lineTo(pad.left, zeroY); ctx.closePath();
  const isUp = cumPnl[cumPnl.length - 1] >= 0;
  ctx.fillStyle = isUp ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)'; ctx.fill();
  ctx.beginPath(); cumPnl.forEach((v, i) => { const x = pad.left + i * xStep; const y = pad.top + ((maxV - v) / range) * cH; if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
  ctx.strokeStyle = isUp ? '#10b981' : '#ef4444'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#4a5568'; ctx.font = '10px JetBrains Mono'; ctx.textAlign = 'right';
  for (let i = 0; i <= 4; i++) { const val = maxV - (range / 4) * i; const y = pad.top + (cH / 4) * i; ctx.fillText(val.toFixed(0), pad.left - 6, y + 4); }
}

function renderPnlDist(盈亏明细) {
  const canvas = document.getElementById('pnlDistCanvas');
  if (!canvas) return;
  const container = canvas.parentElement;
  const dpr = window.devicePixelRatio || 1;
  const W = container.clientWidth, H = container.clientHeight;
  canvas.width = W * dpr; canvas.height = H * dpr;
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr); ctx.clearRect(0, 0, W, H);
  if (!盈亏明细 || 盈亏明细.length === 0) { ctx.fillStyle = '#4a5568'; ctx.font = '14px Space Grotesk'; ctx.textAlign = 'center'; ctx.fillText('暂无数据', W / 2, H / 2); return; }
  const pnls = 盈亏明细.map(t => t.pnl || 0);
  const maxPnl = Math.max(...pnls); const minPnl = Math.min(...pnls);
  const pad = { top: 10, right: 10, bottom: 20, left: 50 };
  const cW = W - pad.left - pad.right; const cH = H - pad.top - pad.bottom;
  const barW = Math.max(4, Math.min(30, cW / pnls.length - 2));
  const gap = (cW - barW * pnls.length) / (pnls.length + 1);
  const zeroY = pad.top + (maxPnl / (maxPnl - minPnl || 1)) * cH;
  ctx.strokeStyle = '#2a3f5f'; ctx.lineWidth = 0.5; ctx.setLineDash([4, 4]);
  ctx.beginPath(); ctx.moveTo(pad.left, zeroY); ctx.lineTo(W - pad.right, zeroY); ctx.stroke(); ctx.setLineDash([]);
  pnls.forEach((pnl, i) => {
    const x = pad.left + gap + i * (barW + gap); const isUp = pnl >= 0;
    const barH = Math.abs(pnl) / (maxPnl - minPnl || 1) * cH; const y = isUp ? zeroY - barH : zeroY;
    ctx.fillStyle = isUp ? 'rgba(16,185,129,0.6)' : 'rgba(239,68,68,0.6)';
    ctx.beginPath(); ctx.roundRect(x, y, barW, Math.max(2, barH), 2); ctx.fill();
  });
  ctx.fillStyle = '#4a5568'; ctx.font = '10px JetBrains Mono'; ctx.textAlign = 'right';
  for (let i = 0; i <= 4; i++) { const val = maxPnl - ((maxPnl - minPnl) / 4) * i; const y = pad.top + (cH / 4) * i; ctx.fillText(val.toFixed(0), pad.left - 6, y + 4); }
}

function renderAnalysisTradeList(盈亏明细) {
  const el = document.getElementById('analysisTradeList');
  if (!盈亏明细 || 盈亏明细.length === 0) { if (el) el.innerHTML = '<div class="empty-state" style="padding:20px"><p>暂无已完成的卖出交易</p></div>'; return; }
  let html = `<div class="atl-row header"><span>方向</span><span>股票</span><span>价格</span><span>数量</span><span>盈亏</span><span>策略</span></div>`;
  盈亏明细.slice(0, 50).forEach(t => {
    const pnl = t.pnl || 0; const isUp = pnl >= 0;
    html += `<div class="atl-row">
      <span class="atl-type ${t.type}">${t.type === 'buy' ? '买入' : '卖出'}</span>
      <span class="atl-detail">${t.name || t.symbol}</span>
      <span class="atl-detail">${(t.price || 0).toFixed(2)}</span>
      <span class="atl-detail">${t.qty || 0}</span>
      <span class="atl-pnl ${isUp ? 'positive' : 'negative'}">${isUp ? '+' : ''}${pnl.toFixed(2)}</span>
      <span>${t.strategy ? '<span class="atl-strategy">' + t.strategy + '</span>' : '--'}</span>
    </div>`;
  });
  if (el) el.innerHTML = html;
}
