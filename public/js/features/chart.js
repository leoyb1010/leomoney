/**
 * Leomoney K线图模块 — LightweightCharts v4
 * 替换原 Canvas 自绘，保留所有对外接口不变
 */
import { store } from './store.js';
import { getFilteredStocks } from './market.js';

let _chart = null;       // LightweightCharts 实例
let _candleSeries = null; // K线系列
let _volumeSeries = null; // 成交量系列

export function generateCandles(symbol, count = 40, isIndex = false) {
  const src = isIndex ? store.selectedIndex : (getFilteredStocks().find(s => s.symbol === symbol) || store.selectedStock);
  if (!src) return;
  const arr = [];
  let p = src.price || 100;
  const now = new Date();
  const isDaily = store.timeframe === 'D';
  for (let i = 0; i < count; i++) {
    let time;
    if (isDaily) {
      const d = new Date(now);
      d.setDate(d.getDate() - (count - 1 - i));
      // LightweightCharts 日线接受 'YYYY-MM-DD' 字符串
      time = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    } else {
      // 分钟线用 Unix timestamp (秒)
      const minsBack = (count - 1 - i) * (store.timeframe || 5);
      time = Math.floor((now.getTime() - minsBack * 60000) / 1000);
    }
    const open = p;
    const vol = p * 0.012;
    const change = (Math.random() - 0.48) * vol;
    const close = open + change;
    const high = Math.max(open, close) + Math.random() * vol * 0.5;
    const low = Math.min(open, close) - Math.random() * vol * 0.5;
    const volume = Math.floor(Math.random() * 50000 + 10000);
    arr.push({ open, high, low, close, volume, time });
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
  if (_chart) {
    const container = document.getElementById('chartCanvas');
    if (container && container.parentElement) {
      const h = Math.min(container.parentElement.clientHeight, window.innerHeight * 0.45);
      _chart.applyOptions({ width: container.parentElement.clientWidth, height: h });
    }
  }
}

export function drawChart() {
  // 确保图表实例已创建
  ensureChart();

  let sym;
  if (store.selectedStock) sym = store.selectedStock.symbol;
  else if (store.selectedIndex) sym = store.selectedIndex.id;
  else return;

  const c = store.candles[sym];
  if (!c || !c.length) return;

  // 转换为 LightweightCharts 数据格式
  const candleData = c.map(x => ({
    time: x.time,
    open: x.open,
    high: x.high,
    low: x.low,
    close: x.close,
  }));
  const volumeData = c.map(x => ({
    time: x.time,
    value: x.volume,
    color: x.close >= x.open ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)',
  }));

  _candleSeries.setData(candleData);
  _volumeSeries.setData(volumeData);
  _chart.timeScale().fitContent();
}

function ensureChart() {
  if (_chart) return;
  const container = document.getElementById('chartCanvas');
  if (!container || !container.parentElement) return;

  _chart = LightweightCharts.createChart(container.parentElement, {
    layout: {
      background: { color: '#0a0e17' },
      textColor: '#8892a4',
      fontSize: 11,
    },
    grid: {
      vertLines: { color: 'rgba(255,255,255,0.05)' },
      horzLines: { color: 'rgba(255,255,255,0.05)' },
    },
    crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
    rightPriceScale: {
      borderColor: 'rgba(255,255,255,0.08)',
      scaleMargins: { top: 0.05, bottom: 0.25 },
    },
    timeScale: {
      borderColor: 'rgba(255,255,255,0.08)',
      timeVisible: true,
      secondsVisible: false,
    },
    width: container.parentElement.clientWidth,
    height: container.parentElement.clientHeight,
  });

  _candleSeries = _chart.addCandlestickSeries({
    upColor: '#10b981',
    downColor: '#ef4444',
    borderUpColor: '#10b981',
    borderDownColor: '#ef4444',
    wickUpColor: '#10b981',
    wickDownColor: '#ef4444',
  });

  _volumeSeries = _chart.addHistogramSeries({
    priceFormat: { type: 'volume' },
    priceScaleId: 'volume',
  });

  _chart.priceScale('volume').applyOptions({
    scaleMargins: { top: 0.8, bottom: 0 },
  });

  // 隐藏原来的 canvas 元素（LightweightCharts 会创建自己的 canvas）
  container.style.display = 'none';
}

export function setupChartHover() {
  // LightweightCharts 自带 crosshair，无需手动绑定
  // 但保留此函数签名以兼容 main.js 的调用
}

export function setTimeframe(tf) {
  store.timeframe = tf;
  document.querySelectorAll('.tf-btn').forEach(b => b.classList.remove('active'));
  const btn = document.querySelector(`.tf-btn[data-tf="${tf}"]`);
  if (btn) btn.classList.add('active');
  const sym = store.selectedStock ? store.selectedStock.symbol : (store.selectedIndex ? store.selectedIndex.id : null);
  if (sym) { generateCandles(sym, tf === 'D' ? 60 : 40, !!store.selectedIndex); drawChart(); }
}
