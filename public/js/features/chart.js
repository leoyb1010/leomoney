/**
 * Leomoney K线图模块
 */
import { store } from './store.js';
import { getFilteredStocks } from './market.js';

let chartHoverIndex = -1;
let _chartW = 0, _chartH = 0;

export function generateCandles(symbol, count = 40, isIndex = false) {
  const src = isIndex ? store.selectedIndex : (getFilteredStocks().find(s => s.symbol === symbol) || store.selectedStock);
  if (!src) return;
  const arr = [];
  let p = src.price || 100;
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now); d.setDate(d.getDate() - (count - 1 - i));
    const dateStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const open = p;
    const vol = p * 0.012;
    const change = (Math.random() - 0.48) * vol;
    const close = open + change;
    const high = Math.max(open, close) + Math.random() * vol * 0.5;
    const low = Math.min(open, close) - Math.random() * vol * 0.5;
    const volume = Math.floor(Math.random() * 50000 + 10000);
    arr.push({ open, high, low, close, volume, time: i, date: dateStr });
    p = close;
  }
  store.candles[symbol] = arr;
}

export function updateChartHeader() {
  if (store.selectedIndex) { updateIndexChartHeader(); return; }
  const s = store.selectedStock;
  if (!s) return;
  const change = s.price - (s.prevClose || s.price);
  const pct = (change / (s.prevClose || s.price) * 100) || 0;
  const isUp = change >= 0;
  const cur = s.currency === 'USD' ? '$' : s.currency === 'HKD' ? 'HK$' : '¥';

  const nameEl = document.getElementById('chartName');
  const symEl = document.getElementById('chartSymbol');
  const priceEl = document.getElementById('chartPrice');
  const changeEl = document.getElementById('chartChange');

  if (nameEl) nameEl.textContent = s.name;
  if (symEl) symEl.textContent = s.symbol + ' · ' + (s.sector || '');
  if (priceEl) priceEl.textContent = cur + s.price.toFixed(2);
  if (changeEl) {
    changeEl.textContent = `${isUp ? '+' : ''}${change.toFixed(2)} (${isUp ? '+' : ''}${pct.toFixed(2)}%)`;
    changeEl.style.color = isUp ? 'var(--green)' : 'var(--red)';
  }

  const statOpen = document.getElementById('statOpen');
  const statHigh = document.getElementById('statHigh');
  const statLow = document.getElementById('statLow');
  const statPrev = document.getElementById('statPrev');
  if (statOpen) statOpen.textContent = formatPrice(s.open);
  if (statHigh) statHigh.textContent = formatPrice(s.high);
  if (statLow) statLow.textContent = formatPrice(s.low);
  if (statPrev) statPrev.textContent = formatPrice(s.prevClose);
}

function formatPrice(p) { return p != null ? Number(p).toFixed(2) : '--'; }

function updateIndexChartHeader() {
  if (!store.selectedIndex) return;
  const idx = store.selectedIndex;
  const change = idx.price - (idx.prevClose || idx.price);
  const pct = idx.changePercent || (idx.prevClose ? ((change / idx.prevClose) * 100) : 0);
  const isUp = change >= 0;

  const nameEl = document.getElementById('chartName');
  const symEl = document.getElementById('chartSymbol');
  const priceEl = document.getElementById('chartPrice');
  const changeEl = document.getElementById('chartChange');

  if (nameEl) nameEl.textContent = idx.name;
  if (symEl) symEl.textContent = idx.code || idx.id;
  if (priceEl) priceEl.textContent = idx.price >= 1000 ? idx.price.toFixed(0) : idx.price.toFixed(2);
  if (changeEl) {
    changeEl.textContent = `${isUp ? '+' : ''}${change.toFixed(2)} (${isUp ? '+' : ''}${pct.toFixed(2)}%)`;
    changeEl.style.color = isUp ? 'var(--green)' : 'var(--red)';
  }

  const statOpen = document.getElementById('statOpen');
  const statHigh = document.getElementById('statHigh');
  const statLow = document.getElementById('statLow');
  const statPrev = document.getElementById('statPrev');
  if (statOpen) statOpen.textContent = formatPrice(idx.open);
  if (statHigh) statHigh.textContent = formatPrice(idx.high);
  if (statLow) statLow.textContent = formatPrice(idx.low);
  if (statPrev) statPrev.textContent = formatPrice(idx.prevClose);
}

export function resizeChartCanvas() {
  const canvas = document.getElementById('chartCanvas');
  if (!canvas) return;
  const container = canvas.parentElement;
  const dpr = window.devicePixelRatio || 1;
  const w = container.clientWidth;
  const h = container.clientHeight;
  if (w <= 0 || h <= 0) return;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
  }
  _chartW = w;
  _chartH = h;
}

export function drawChart(hoverIdx) {
  const canvas = document.getElementById('chartCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const W = _chartW, H = _chartH;
  ctx.clearRect(0, 0, W, H);

  let sym, current;
  if (store.selectedStock) { sym = store.selectedStock.symbol; current = store.selectedStock.price; }
  else if (store.selectedIndex) { sym = store.selectedIndex.id; current = store.selectedIndex.price; }
  else {
    ctx.fillStyle = '#4a5568'; ctx.font = '16px Space Grotesk'; ctx.textAlign = 'center';
    ctx.fillText('请从左侧选择股票或上方选择大盘指数', W / 2, H / 2); return;
  }
  const c = store.candles[sym];
  if (!c || !c.length) return;

  const pad = { top: 20, right: 60, bottom: 30, left: 10 };
  const chartW = W - pad.left - pad.right;
  const chartH = H - pad.top - pad.bottom;
  const volH = chartH * 0.2;
  const priceH = chartH * 0.75;
  let minP = Infinity, maxP = -Infinity, maxVol = 0;
  c.forEach(x => { if (x.low < minP) minP = x.low; if (x.high > maxP) maxP = x.high; if (x.volume > maxVol) maxVol = x.volume; });
  const pRange = maxP - minP || 1;
  minP -= pRange * 0.05; maxP += pRange * 0.05;
  const candleW = chartW / c.length;
  const bodyW = Math.max(1, candleW * 0.65);

  ctx.strokeStyle = '#1e2d45'; ctx.lineWidth = 0.5;
  for (let i = 0; i <= 5; i++) {
    const y = pad.top + (priceH / 5) * i;
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
    const price = maxP - ((maxP - minP) / 5) * i;
    ctx.fillStyle = '#4a5568'; ctx.font = '11px JetBrains Mono'; ctx.textAlign = 'right';
    ctx.fillText(price.toFixed(2), W - 5, y + 4);
  }

  c.forEach((x, i) => {
    const cx = pad.left + i * candleW + candleW / 2;
    const isUp = x.close >= x.open;
    const color = isUp ? '#10b981' : '#ef4444';
    const yHigh = pad.top + ((maxP - x.high) / (maxP - minP)) * priceH;
    const yLow = pad.top + ((maxP - x.low) / (maxP - minP)) * priceH;
    ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx, yHigh); ctx.lineTo(cx, yLow); ctx.stroke();
    const yOpen = pad.top + ((maxP - x.open) / (maxP - minP)) * priceH;
    const yClose = pad.top + ((maxP - x.close) / (maxP - minP)) * priceH;
    const bodyTop = Math.min(yOpen, yClose);
    const bodyHeight = Math.max(1, Math.abs(yClose - yOpen));
    ctx.fillStyle = color; ctx.fillRect(cx - bodyW / 2, bodyTop, bodyW, bodyHeight);
    const volBarH = (x.volume / maxVol) * volH;
    const volY = pad.top + priceH + chartH * 0.05 + volH - volBarH;
    ctx.fillStyle = isUp ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)';
    ctx.fillRect(cx - bodyW / 2, volY, bodyW, volBarH);
  });

  const last = c[c.length - 1];
  const lastY = pad.top + ((maxP - last.close) / (maxP - minP)) * priceH;
  const isUpLast = last.close >= last.open;
  ctx.setLineDash([4, 4]); ctx.strokeStyle = isUpLast ? '#10b981' : '#ef4444'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(pad.left, lastY); ctx.lineTo(W - pad.right, lastY); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = isUpLast ? '#10b981' : '#ef4444'; ctx.fillRect(W - pad.right, lastY - 10, 58, 20);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 11px JetBrains Mono'; ctx.textAlign = 'center';
  ctx.fillText(last.close.toFixed(2), W - pad.right + 29, lastY + 4);

  const hi = (hoverIdx !== undefined && hoverIdx >= 0) ? hoverIdx : chartHoverIndex;
  if (hi >= 0 && hi < c.length) {
    const x = c[hi];
    const cx = pad.left + hi * candleW + candleW / 2;
    ctx.setLineDash([3, 3]); ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(cx, pad.top); ctx.lineTo(cx, H - pad.bottom); ctx.stroke(); ctx.setLineDash([]);
    const hoverPriceY = pad.top + ((maxP - x.close) / (maxP - minP)) * priceH;
    ctx.setLineDash([3, 3]); ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(pad.left, hoverPriceY); ctx.lineTo(W - pad.right, hoverPriceY); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#3b82f6'; ctx.fillRect(W - pad.right, hoverPriceY - 10, 58, 20);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 10px JetBrains Mono'; ctx.textAlign = 'center';
    ctx.fillText(x.close.toFixed(2), W - pad.right + 29, hoverPriceY + 4);
    const isUpK = x.close >= x.open;
    const chg = x.close - x.open;
    const chgPct = (chg / x.open * 100) || 0;
    const boxW = 155, boxH = 105;
    let boxX = cx + 15, boxY = pad.top + 10;
    if (boxX + boxW > W - pad.right) boxX = cx - boxW - 15;
    if (boxY + boxH > H - pad.bottom) boxY = H - pad.bottom - boxH - 5;
    ctx.fillStyle = 'rgba(26,34,53,0.95)'; ctx.strokeStyle = '#2a3f5f'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(boxX, boxY, boxW, boxH, 6); ctx.fill(); ctx.stroke();
    const lineH = 16; let ty = boxY + 16;
    ctx.font = 'bold 11px Space Grotesk'; ctx.fillStyle = '#e2e8f0'; ctx.textAlign = 'left';
    ctx.fillText(x.date || 'Day ' + x.time, boxX + 10, ty); ty += lineH;
    ctx.font = '10px JetBrains Mono'; ctx.fillStyle = isUpK ? '#10b981' : '#ef4444';
    ctx.fillText('开 ' + x.open.toFixed(2) + '  高 ' + x.high.toFixed(2), boxX + 10, ty); ty += lineH;
    ctx.fillStyle = '#e2e8f0'; ctx.fillText('收 ' + x.close.toFixed(2) + '  低 ' + x.low.toFixed(2), boxX + 10, ty); ty += lineH;
    ctx.fillStyle = isUpK ? '#10b981' : '#ef4444';
    ctx.fillText((isUpK ? '+' : '') + chg.toFixed(2) + ' (' + (isUpK ? '+' : '') + chgPct.toFixed(2) + '%)', boxX + 10, ty); ty += lineH;
    ctx.fillStyle = '#8892a4'; ctx.fillText('量 ' + x.volume.toLocaleString(), boxX + 10, ty);
  }
}

export function setupChartHover() {
  const canvas = document.getElementById('chartCanvas');
  if (!canvas) return;
  canvas.addEventListener('mousemove', function (e) {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    let sym;
    if (store.selectedStock) sym = store.selectedStock.symbol;
    else if (store.selectedIndex) sym = store.selectedIndex.id;
    else return;
    const c = store.candles[sym]; if (!c || !c.length) return;
    const pad = { top: 20, right: 60, bottom: 30, left: 10 };
    const chartW = _chartW - pad.left - pad.right;
    const candleW = chartW / c.length;
    const idx = Math.floor((mx - pad.left) / candleW);
    if (idx >= 0 && idx < c.length) { chartHoverIndex = idx; } else { chartHoverIndex = -1; }
    drawChart(idx);
  });
  canvas.addEventListener('mouseleave', function () { chartHoverIndex = -1; drawChart(); });
}

export function setTimeframe(tf) {
  store.timeframe = tf;
  document.querySelectorAll('.tf-btn').forEach(b => b.classList.remove('active'));
  const btn = document.querySelector(`.tf-btn[data-tf="${tf}"]`);
  if (btn) btn.classList.add('active');
  if (store.selectedStock) { generateCandles(store.selectedStock.symbol); drawChart(); }
  if (store.selectedIndex) { generateCandles(store.selectedIndex.id, 40, true); drawChart(); }
}
