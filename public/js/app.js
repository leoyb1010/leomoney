/* Leomoney Frontend v1.3.0 — 多市场 + 条件单 + 全市场搜索 + Agent适配 */
const API = '';
let marketStatus = { isOpen: false, status: '检测中' };
let quotesData = { indices: [], astocks: [], hkstocks: [], usstocks: [], metals: [], crypto: [], ts: 0 };
let accountData = { balance: 1000000, holdings: {}, history: [], pendingOrders: [] };
let accountSummary = null; // /api/account/summary 缓存
let currentView = 'quotes';
let currentMarketCat = 'all';
let selectedStock = null;
let selectedIndex = null;
let tradeType = 'buy';
let timeframe = 5;
let candles = {};
let searchFilter = '';
let searchResults = [];
let searchTimer = null;
let historyFilter = 'all'; // 成交筛选

function formatPrice(p){ return p!=null ? p.toFixed(2) : '--'; }
function formatMoney(m){ return '¥'+m.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,','); }
function formatQty(q){ return q.toLocaleString(); }

/* ===== API ===== */
async function apiGet(path){
  try{ const r=await fetch(API+path); if(!r.ok) throw new Error('HTTP '+r.status); return await r.json(); }
  catch(e){ console.warn('API '+path+' failed:',e.message); return null; }
}
async function apiPost(path,body){
  try{ const r=await fetch(API+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  return await r.json(); } catch(e){ return {success:false,error:e.message}; }
}

/* ===== MARKET STATUS ===== */
async function refreshMarketStatus(){
  const d=await apiGet('/api/market');
  if(d&&d.success){ marketStatus=d; updateStatusUI(); }
}
function updateStatusUI(){
  const dot=document.getElementById('statusDot'), label=document.getElementById('marketLabel');
  const frozen=document.getElementById('frozenIndicator');
  dot.className='status-dot';
  if(marketStatus.isOpen){
    label.innerHTML=`${marketStatus.status} · <span class="market-closed-badge open">实时行情</span>`;
    if(frozen) frozen.style.display='none';
  } else {
    const s = marketStatus.status || '已收盘';
    const isPre = s.includes('盘前') || s.includes('午间');
    dot.classList.add(isPre ? 'premarket' : 'closed');
    label.innerHTML=`${s} · <span class="market-closed-badge ${isPre?'premarket':'closed'}">${isPre?'等待开盘':'行情冻结'}</span>`;
    if(frozen){ frozen.style.display='flex'; frozen.querySelector('span').textContent='市场已休，行情冻结在收盘价'; }
  }
}

/* ===== VIEW SWITCHING ===== */
function switchView(view){
  currentView=view;
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  const target=document.getElementById('view-'+view);
  if(target) target.classList.add('active');
  document.querySelectorAll('.sidebar-item').forEach(i=>i.classList.remove('active'));
  const item=document.querySelector(`.sidebar-item[data-view="${view}"]`);
  if(item) item.classList.add('active');
  if(view==='portfolio') renderPortfolioView();
  if(view==='history') renderHistoryView();
  if(view==='analysis') loadAnalysis();
  if(view==='quotes'&&selectedStock) requestAnimationFrame(()=>{ resizeChartCanvas(); drawChart(); });
}

/* ===== MARKET CATEGORY ===== */
function setMarketCategory(cat){
  currentMarketCat=cat;
  document.querySelectorAll('.market-tab').forEach(t=>t.classList.remove('active'));
  document.querySelector(`.market-tab[data-cat="${cat}"]`)?.classList.add('active');
  searchFilter = '';
  searchResults = [];
  renderWatchlist();
}

/* ===== QUOTES ===== */
async function refreshQuotes(){
  const d=await apiGet('/api/quotes');
  if(d&&d.success){ quotesData=d; renderWatchlist(); renderIndices(); if(selectedStock) updateChartHeader(); if(selectedIndex) updateIndexChartHeader(); }
}
async function refreshAccount(){
  const d=await apiGet('/api/account');
  if(d&&d.success){ accountData=d; updateBalance(); renderOrderList(); }
}

/* ===== INDICES ===== */
function renderIndices(){
  const el=document.getElementById('indexBar');
  if(!quotesData.indices.length) return;
  el.innerHTML=quotesData.indices.map(idx=>{
    const change=idx.price-(idx.prevClose||idx.price);
    const pct=(change/(idx.prevClose||idx.price)*100)||0;
    const isUp=change>=0;
    const isActive=selectedIndex?.id===idx.id;
    return `<div class="index-card ${isActive?'active':''}" onclick="selectIndex('${idx.id}')">
      <div class="index-header"><span class="index-name">${idx.name}</span><span class="index-badge">${idx.code}</span></div>
      <div class="index-value" style="color:${isUp?'var(--green)':'var(--red)'}">${formatPrice(idx.price)}</div>
      <div class="index-change ${isUp?'up':'down'}">${isUp?'+':''}${change.toFixed(2)} (${isUp?'+':''}${pct.toFixed(2)}%)</div>
    </div>`;
  }).join('');
}
function selectIndex(id){
  selectedIndex=quotesData.indices.find(i=>i.id===id); selectedStock=null;
  generateCandles(id,40,true); renderIndices(); renderWatchlist(); updateIndexChartHeader(); drawChart();
  document.getElementById('tradeSymbol').value='--'; document.getElementById('tradePrice').value='';
  document.getElementById('tradeQty').value=''; calcTotal();
}
function updateIndexChartHeader(){
  const idx=selectedIndex; if(!idx) return;
  const change=idx.price-(idx.prevClose||idx.price);
  const pct=(change/(idx.prevClose||idx.price)*100)||0;
  const isUp=change>=0;
  document.getElementById('chartName').textContent=idx.name;
  document.getElementById('chartSymbol').textContent=idx.code+' · 大盘指数';
  document.getElementById('chartPrice').textContent=formatPrice(idx.price);
  document.getElementById('chartChange').textContent=`${isUp?'+':''}${change.toFixed(2)} (${isUp?'+':''}${pct.toFixed(2)}%)`;
  document.getElementById('chartChange').style.color=isUp?'var(--green)':'var(--red)';
  document.getElementById('statOpen').textContent=formatPrice(idx.prevClose);
  document.getElementById('statHigh').textContent=formatPrice(idx.high);
  document.getElementById('statLow').textContent=formatPrice(idx.low);
  document.getElementById('statPrev').textContent=formatPrice(idx.prevClose);
}

/* ===== WATCHLIST with categories + 全市场搜索 ===== */
function getFilteredStocks(){
  const filter=searchFilter.toLowerCase();
  let all=[];
  const cats = currentMarketCat==='all' ? ['astocks','hkstocks','usstocks','metals','crypto'] : [currentMarketCat];
  cats.forEach(cat=>{
    (quotesData[cat]||[]).forEach(s=>all.push({...s,category:cat}));
  });
  if(!filter) return all;
  return all.filter(s=>s.name.toLowerCase().includes(filter)||s.symbol.toLowerCase().includes(filter));
}

function renderWatchlist(){
  const el=document.getElementById('watchlist');
  // 如果有全市场搜索结果，优先展示
  if(searchResults.length > 0){
    el.innerHTML = searchResults.map(s => {
      const tagClass = s.category || 'a';
      const catLabel = s.category === 'astocks' ? 'A股' : s.category === 'hkstocks' ? '港股' : s.category === 'usstocks' ? '美股' : s.category === 'metals' ? '贵金属' : s.category === 'crypto' ? '加密' : (s.market||'');
      return `<div class="stock-item" onclick="selectStockFromSearch('${s.symbol}','${s.sinaCode||''}','${s.category||''}','${s.name}')">
        <div class="stock-info">
          <div class="stock-name-row"><span class="stock-name">${s.name}</span><span class="stock-tag ${tagClass}">${catLabel}</span></div>
          <div class="stock-symbol">${s.symbol} · ${s.sector||''}</div>
        </div>
        <div class="stock-price-area">
          <div class="stock-price" style="color:var(--text-secondary)">点击查看</div>
        </div>
      </div>`;
    }).join('');
    return;
  }
  const filtered=getFilteredStocks();
  el.innerHTML=filtered.map(s=>{
    const change=s.price-(s.prevClose||s.price);
    const pct=(change/(s.prevClose||s.price)*100)||0;
    const isUp=change>=0;
    const isActive=selectedStock?.symbol===s.symbol;
    const tagClass=s.category||'a';
    const cur=s.currency==='USD'?'$':'¥';
    return `<div class="stock-item ${isActive?'active':''}" onclick="selectStock('${s.symbol}')">
      <div class="stock-info">
        <div class="stock-name-row"><span class="stock-name">${s.name}</span><span class="stock-tag ${tagClass}">${tagClass.toUpperCase()}</span></div>
        <div class="stock-symbol">${s.symbol} · ${s.sector}</div>
      </div>
      <div class="stock-price-area">
        <div class="stock-price">${cur}${s.price>=1000?s.price.toFixed(0):s.price.toFixed(2)}</div>
        <div class="stock-change ${isUp?'up':'down'}">${isUp?'+':''}${pct.toFixed(2)}%</div>
      </div>
    </div>`;
  }).join('');
}

// 搜索框输入时调后端 API 搜索全市场
function filterStocks(val){
  searchFilter = val;
  if(searchTimer) clearTimeout(searchTimer);
  if(!val || val.length < 1){
    searchResults = [];
    renderWatchlist();
    return;
  }
  // 300ms 防抖
  searchTimer = setTimeout(async () => {
    const d = await apiGet('/api/search?q=' + encodeURIComponent(val));
    if(d && d.success){
      searchResults = d.results || [];
    } else {
      searchResults = [];
    }
    renderWatchlist();
  }, 300);
}

// 从搜索结果中选择股票 -> 先查实时行情再选中
async function selectStockFromSearch(symbol, sinaCode, category, name){
  const d = await apiGet('/api/quotes/' + encodeURIComponent(symbol));
  if(d && d.quote){
    const q = d.quote;
    selectedStock = {
      symbol: q.symbol, name: q.name || name, price: q.price, prevClose: q.prevClose,
      open: q.open, high: q.high, low: q.low, volume: q.volume,
      change: q.change, changePercent: q.changePercent,
      sector: q.sector || '', category: q.category || category,
      currency: q.currency || 'CNY',
    };
  } else {
    // 查不到行情，也加进去（用搜索结果的基本信息）
    selectedStock = {
      symbol, name, price: 0, prevClose: 0, open: 0, high: 0, low: 0,
      volume: 0, change: 0, changePercent: 0,
      sector: '', category: category || 'astocks', currency: 'CNY',
    };
  }
  searchResults = [];
  searchFilter = '';
  document.querySelector('.search-input').value = '';
  selectedIndex = null;
  generateCandles(symbol);
  renderWatchlist(); renderIndices(); updateChartHeader(); drawChart();
  document.getElementById('tradeSymbol').value=selectedStock.symbol+' '+selectedStock.name;
  document.getElementById('tradePrice').value=selectedStock.price.toFixed(2);
  document.getElementById('orderSymbol').value=selectedStock.symbol+' '+selectedStock.name;
  document.getElementById('tradeQty').value=''; calcTotal();
  updateCurrentSymbolPanel();
}
  selectedStock=getFilteredStocks().find(s=>s.symbol===symbol);
  if(!selectedStock) return;
  selectedIndex=null; generateCandles(symbol);
  renderWatchlist(); renderIndices(); updateChartHeader(); drawChart();
  document.getElementById('tradeSymbol').value=selectedStock.symbol+' '+selectedStock.name;
  document.getElementById('tradePrice').value=selectedStock.price.toFixed(2);
  document.getElementById('orderSymbol').value=selectedStock.symbol+' '+selectedStock.name;
  document.getElementById('tradeQty').value=''; calcTotal();
  updateCurrentSymbolPanel();
}

/* ===== CHART ===== */
function generateCandles(symbol,count=40,isIndex=false){
  const src=isIndex?selectedIndex:(getFilteredStocks().find(s=>s.symbol===symbol) || selectedStock);
  if(!src) return;
  const arr=[]; let p=src.price || 100;
  const now=new Date();
  for(let i=0;i<count;i++){
    const d=new Date(now); d.setDate(d.getDate()-(count-1-i));
    const dateStr=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    const open=p; const vol=p*0.012;
    const change=(Math.random()-0.48)*vol;
    const close=open+change;
    const high=Math.max(open,close)+Math.random()*vol*0.5;
    const low=Math.min(open,close)-Math.random()*vol*0.5;
    const volume=Math.floor(Math.random()*50000+10000);
    arr.push({open,high,low,close,volume,time:i,date:dateStr}); p=close;
  }
  candles[symbol]=arr;
}
function updateChartHeader(){
  const s=selectedStock; if(!s) return;
  const change=s.price-(s.prevClose||s.price);
  const pct=(change/(s.prevClose||s.price)*100)||0;
  const isUp=change>=0;
  const cur=s.currency==='USD'?'$':'¥';
  document.getElementById('chartName').textContent=s.name;
  document.getElementById('chartSymbol').textContent=s.symbol+' · '+(s.sector||'');
  document.getElementById('chartPrice').textContent=cur+s.price.toFixed(2);
  document.getElementById('chartChange').textContent=`${isUp?'+':''}${change.toFixed(2)} (${isUp?'+':''}${pct.toFixed(2)}%)`;
  document.getElementById('chartChange').style.color=isUp?'var(--green)':'var(--red)';
  document.getElementById('statOpen').textContent=formatPrice(s.open);
  document.getElementById('statHigh').textContent=formatPrice(s.high);
  document.getElementById('statLow').textContent=formatPrice(s.low);
  document.getElementById('statPrev').textContent=formatPrice(s.prevClose);
}

// 悬停状态
let chartHoverIndex = -1;
let _chartW = 0, _chartH = 0; // 缓存 canvas 逻辑尺寸

function resizeChartCanvas(){
  const canvas = document.getElementById('chartCanvas');
  if(!canvas) return;
  const container = canvas.parentElement;
  const dpr = window.devicePixelRatio || 1;
  const w = container.clientWidth;
  const h = container.clientHeight;
  if(w <= 0 || h <= 0) return;
  if(canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)){
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
  }
  _chartW = w;
  _chartH = h;
}

function drawChart(hoverIdx){
  const canvas=document.getElementById('chartCanvas');
  const ctx=canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // 重置变换再缩放
  const W = _chartW, H = _chartH;
  ctx.clearRect(0, 0, W, H);

  let sym,current;
  if(selectedStock){ sym=selectedStock.symbol; current=selectedStock.price; }
  else if(selectedIndex){ sym=selectedIndex.id; current=selectedIndex.price; }
  else { ctx.fillStyle='#4a5568'; ctx.font='16px Space Grotesk'; ctx.textAlign='center'; ctx.fillText('请从左侧选择股票或上方选择大盘指数',W/2,H/2); return; }
  const c=candles[sym]; if(!c||!c.length) return;
  const pad={top:20,right:60,bottom:30,left:10};
  const chartW=W-pad.left-pad.right; const chartH=H-pad.top-pad.bottom;
  const volH=chartH*0.2; const priceH=chartH*0.75;
  let minP=Infinity,maxP=-Infinity,maxVol=0;
  c.forEach(x=>{ if(x.low<minP)minP=x.low; if(x.high>maxP)maxP=x.high; if(x.volume>maxVol)maxVol=x.volume; });
  const pRange=maxP-minP||1; minP-=pRange*0.05; maxP+=pRange*0.05;
  const candleW=chartW/c.length; const bodyW=Math.max(1,candleW*0.65);

  // 网格线
  ctx.strokeStyle='#1e2d45'; ctx.lineWidth=0.5;
  for(let i=0;i<=5;i++){ const y=pad.top+(priceH/5)*i; ctx.beginPath(); ctx.moveTo(pad.left,y); ctx.lineTo(W-pad.right,y); ctx.stroke(); const price=maxP-((maxP-minP)/5)*i; ctx.fillStyle='#4a5568'; ctx.font='11px JetBrains Mono'; ctx.textAlign='right'; ctx.fillText(price.toFixed(2),W-5,y+4); }

  // K线
  c.forEach((x,i)=>{
    const cx=pad.left+i*candleW+candleW/2; const isUp=x.close>=x.open; const color=isUp?'#10b981':'#ef4444';
    const yHigh=pad.top+((maxP-x.high)/(maxP-minP))*priceH; const yLow=pad.top+((maxP-x.low)/(maxP-minP))*priceH;
    ctx.strokeStyle=color; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(cx,yHigh); ctx.lineTo(cx,yLow); ctx.stroke();
    const yOpen=pad.top+((maxP-x.open)/(maxP-minP))*priceH; const yClose=pad.top+((maxP-x.close)/(maxP-minP))*priceH;
    const bodyTop=Math.min(yOpen,yClose); const bodyHeight=Math.max(1,Math.abs(yClose-yOpen));
    ctx.fillStyle=color; ctx.fillRect(cx-bodyW/2,bodyTop,bodyW,bodyHeight);
    const volBarH=(x.volume/maxVol)*volH; const volY=pad.top+priceH+chartH*0.05+volH-volBarH;
    ctx.fillStyle=isUp?'rgba(16,185,129,0.3)':'rgba(239,68,68,0.3)'; ctx.fillRect(cx-bodyW/2,volY,bodyW,volBarH);
  });

  // 最新价虚线
  const last=c[c.length-1]; const lastY=pad.top+((maxP-last.close)/(maxP-minP))*priceH;
  const isUp=last.close>=last.open;
  ctx.setLineDash([4,4]); ctx.strokeStyle=isUp?'#10b981':'#ef4444'; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(pad.left,lastY); ctx.lineTo(W-pad.right,lastY); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle=isUp?'#10b981':'#ef4444'; ctx.fillRect(W-pad.right,lastY-10,58,20); ctx.fillStyle='#fff'; ctx.font='bold 11px JetBrains Mono'; ctx.textAlign='center'; ctx.fillText(last.close.toFixed(2),W-pad.right+29,lastY+4);

  // 悬停十字线和信息框
  const hi = (hoverIdx !== undefined && hoverIdx >= 0) ? hoverIdx : chartHoverIndex;
  if(hi >= 0 && hi < c.length){
    const x = c[hi];
    const cx = pad.left + hi * candleW + candleW / 2;

    // 垂直十字线
    ctx.setLineDash([3,3]); ctx.strokeStyle='rgba(255,255,255,0.3)'; ctx.lineWidth=0.8;
    ctx.beginPath(); ctx.moveTo(cx,pad.top); ctx.lineTo(cx,H-pad.bottom); ctx.stroke();
    ctx.setLineDash([]);

    // 水平十字线（跟随鼠标实际 Y 位置对应的价格）
    const hoverPriceY = pad.top + ((maxP - x.close)/(maxP-minP)) * priceH;
    ctx.setLineDash([3,3]); ctx.strokeStyle='rgba(255,255,255,0.3)'; ctx.lineWidth=0.8;
    ctx.beginPath(); ctx.moveTo(pad.left,hoverPriceY); ctx.lineTo(W-pad.right,hoverPriceY); ctx.stroke();
    ctx.setLineDash([]);

    // 价格标签
    ctx.fillStyle='#3b82f6'; ctx.fillRect(W-pad.right,hoverPriceY-10,58,20);
    ctx.fillStyle='#fff'; ctx.font='bold 10px JetBrains Mono'; ctx.textAlign='center';
    ctx.fillText(x.close.toFixed(2),W-pad.right+29,hoverPriceY+4);

    // 信息浮框
    const isUpK = x.close >= x.open;
    const chg = x.close - x.open;
    const chgPct = (chg / x.open * 100) || 0;
    const boxW = 155, boxH = 105;
    let boxX = cx + 15;
    let boxY = pad.top + 10;
    if(boxX + boxW > W - pad.right) boxX = cx - boxW - 15;
    if(boxY + boxH > H - pad.bottom) boxY = H - pad.bottom - boxH - 5;

    ctx.fillStyle = 'rgba(26,34,53,0.95)';
    ctx.strokeStyle = '#2a3f5f';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxW, boxH, 6);
    ctx.fill(); ctx.stroke();

    const lineH = 16;
    let ty = boxY + 16;
    ctx.font = 'bold 11px Space Grotesk';
    ctx.fillStyle = '#e2e8f0'; ctx.textAlign = 'left';
    ctx.fillText(x.date || 'Day '+x.time, boxX+10, ty); ty += lineH;
    ctx.font = '10px JetBrains Mono';
    ctx.fillStyle = isUpK ? '#10b981' : '#ef4444';
    ctx.fillText('开 '+x.open.toFixed(2)+'  高 '+x.high.toFixed(2), boxX+10, ty); ty += lineH;
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText('收 '+x.close.toFixed(2)+'  低 '+x.low.toFixed(2), boxX+10, ty); ty += lineH;
    ctx.fillStyle = isUpK ? '#10b981' : '#ef4444';
    ctx.fillText((isUpK?'+':'')+chg.toFixed(2)+' ('+(isUpK?'+':'')+chgPct.toFixed(2)+'%)', boxX+10, ty); ty += lineH;
    ctx.fillStyle = '#8892a4';
    ctx.fillText('量 '+x.volume.toLocaleString(), boxX+10, ty);
  }
}

// K线图鼠标交互
function setupChartHover(){
  const canvas = document.getElementById('chartCanvas');
  canvas.addEventListener('mousemove', function(e){
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    let sym;
    if(selectedStock) sym=selectedStock.symbol;
    else if(selectedIndex) sym=selectedIndex.id;
    else return;
    const c = candles[sym]; if(!c||!c.length) return;
    const pad = {top:20,right:60,bottom:30,left:10};
    const chartW = _chartW - pad.left - pad.right;
    const candleW = chartW / c.length;
    const idx = Math.floor((mx - pad.left) / candleW);
    if(idx >= 0 && idx < c.length){
      chartHoverIndex = idx;
    } else {
      chartHoverIndex = -1;
    }
    // hover 只重绘，不动 canvas 尺寸
    drawChart(idx);
  });
  canvas.addEventListener('mouseleave', function(){
    chartHoverIndex = -1;
    drawChart();
  });
}
function setTimeframe(tf){ timeframe=tf; document.querySelectorAll('.tf-btn').forEach(b=>b.classList.remove('active')); document.querySelector(`.tf-btn[data-tf="${tf}"]`)?.classList.add('active'); if(selectedStock){ generateCandles(selectedStock.symbol); drawChart(); } if(selectedIndex){ generateCandles(selectedIndex.id,40,true); drawChart(); }}

/* ===== TRADE ===== */
function setTradeType(type){
  tradeType=type;
  document.querySelectorAll('.trade-tab').forEach(t=>t.classList.remove('active'));
  document.querySelector(`.trade-tab.${type}`)?.classList.add('active');
  const spot=document.getElementById('tradeFormSpot');
  const order=document.getElementById('tradeFormOrder');
  const btn=document.getElementById('submitBtn');
  if(type==='order'){
    if(spot) spot.style.display='none';
    if(order) order.style.display='flex';
  } else {
    if(spot) spot.style.display='flex';
    if(order) order.style.display='none';
    if(btn){
      btn.className=`submit-btn ${type}-btn action-button ${type}`;
      btn.textContent=type==='buy'?'买入下单':'卖出下单';
      btn.setAttribute('data-side',type);
      btn.setAttribute('aria-label',type==='buy'?'买入下单':'卖出下单');
      btn.setAttribute('data-testid',type==='buy'?'submit-buy-order':'submit-sell-order');
    }
  }
  calcTotal();
}
function setQty(q){ document.getElementById('tradeQty').value=q; calcTotal(); }
function setQtyMax(){
  if(!selectedStock) return;
  if(tradeType==='buy'){ const max=Math.floor(accountData.balance/selectedStock.price/100)*100; document.getElementById('tradeQty').value=Math.max(0,max); }
  else { const h=accountData.holdings[selectedStock.symbol]; document.getElementById('tradeQty').value=h?h.qty:0; }
  calcTotal();
}
function calcTotal(){
  const price=parseFloat(document.getElementById('tradePrice').value)||0;
  const qty=parseInt(document.getElementById('tradeQty').value)||0;
  document.getElementById('tradeTotal').textContent=formatMoney(price*qty);
  const valid=price&&qty&&qty%100===0;
  document.getElementById('submitBtn').disabled=!valid;
  // 校验提示
  const validationEl=document.getElementById('tradeValidation');
  if(validationEl){
    if(!valid&&qty>0){
      if(qty%100!==0) validationEl.textContent='数量必须为100的整数倍';
      else if(!price) validationEl.textContent='请输入委托价格';
      validationEl.className='trade-validation error';
    } else if(valid){
      // 可买/可卖提示
      const total=price*qty;
      if(tradeType==='buy'){
        if(total>accountData.balance) validationEl.textContent=`资金不足，需 ${formatMoney(total)}，可用 ${formatMoney(accountData.balance)}`;
        else validationEl.textContent='';
        validationEl.className=total>accountData.balance?'trade-validation error':'trade-validation';
      } else {
        const h=accountData.holdings[selectedStock?.symbol];
        if(h&&qty>h.qty) validationEl.textContent=`可卖不足，持有 ${h?.qty||0} 股`;
        else validationEl.textContent='';
        validationEl.className=(h&&qty>h.qty)?'trade-validation error':'trade-validation';
      }
    } else { validationEl.textContent=''; validationEl.className='trade-validation'; }
  }
  // 可买/可卖数量提示
  const hintEl=document.getElementById('qtyHint');
  if(hintEl&&selectedStock){
    if(tradeType==='buy'){
      const maxBuy=Math.floor(accountData.balance/selectedStock.price/100)*100;
      hintEl.textContent=`可买 ${Math.max(0,maxBuy)} 股`;
    } else {
      const h=accountData.holdings[selectedStock?.symbol];
      hintEl.textContent=`可卖 ${h?h.qty:0} 股`;
    }
  }
}
async function submitOrder(){
  if(!selectedStock) return;
  const price=parseFloat(document.getElementById('tradePrice').value);
  const qty=parseInt(document.getElementById('tradeQty').value);
  // 校验
  const validationEl=document.getElementById('tradeValidation');
  if(!price||!qty||qty%100!==0){
    const msg='请输入有效价格和数量（100的整数倍）';
    if(validationEl){ validationEl.textContent=msg; validationEl.className='trade-validation error'; }
    notify(msg,'error'); return;
  }
  const result=await apiPost(`/api/trade/${tradeType}`,{symbol:selectedStock.symbol,qty,price});
  if(result&&result.success){
    const msg=tradeType==='buy'?'买入下单成功':'卖出下单成功';
    notify(msg,'success');
    if(validationEl){ validationEl.textContent=msg; validationEl.className='trade-validation success'; }
    await refreshAccount();
    await refreshAccountSummary();
    if(tradeType==='sell'){document.getElementById('tradeQty').value='';calcTotal();}
    // 刷新持仓和当前标的
    updateCurrentSymbolHolding();
    if(currentView==='portfolio') renderPortfolioView();
    if(currentView==='history') renderHistoryView();
  } else {
    const errMsg=result?.error||'下单失败：未知错误';
    notify(errMsg,'error');
    if(validationEl){ validationEl.textContent=errMsg; validationEl.className='trade-validation error'; }
    // 失败保留输入，不清空
  }
}

/* ===== CONDITIONAL ORDERS ===== */
async function submitOrderCondition(){
  if(!selectedStock) return notify('请先选择股票','error');
  const triggerPrice=parseFloat(document.getElementById('orderTriggerPrice').value);
  const qty=parseInt(document.getElementById('orderQty').value);
  const triggerType=document.getElementById('orderTriggerType').value;
  const dir=document.getElementById('orderDir').value;
  if(!triggerPrice||!qty||qty%100!==0){ notify('请填写完整信息','error'); return; }
  const result=await apiPost('/api/orders',{symbol:selectedStock.symbol,name:selectedStock.name,type:dir,triggerType,triggerPrice,qty});
  if(result&&result.success){ notify('条件单创建成功','success'); document.getElementById('orderTriggerPrice').value=''; document.getElementById('orderQty').value=''; await refreshAccount(); }
  else notify(result?.error||'条件单创建失败','error');
}
function renderOrderList(){
  const el=document.getElementById('orderList');
  if(!el) return;
  const orders=accountData.pendingOrders||[];
  if(orders.length===0){ el.innerHTML=''; return; }
  el.innerHTML=orders.map(o=>{
    const sign=o.triggerType==='gte'?'≥':'≤';
    return `<div class="order-item">
      <span class="order-item-info">${o.name} ${o.type==='buy'?'买入':'卖出'} ${o.qty}股 触发:${sign}${o.triggerPrice}</span>
      <div class="order-item-actions"><button class="order-btn-delete" data-testid="cancel-order" data-role="cancel-order" aria-label="取消条件单" onclick="cancelOrder('${o.id}')">取消条件单</button></div>
    </div>`;
  }).join('');
}
async function cancelOrder(id){
  try{
    await fetch(`${API}/api/orders/${id}`,{method:'DELETE'});
    notify('条件单取消成功','info'); await refreshAccount();
  }catch(e){ notify('取消失败','error'); }
}

/* ===== QUICK TRADE ===== */
async function quickLookup(){
  const sym=document.getElementById('quickSymbol').value.trim().toUpperCase();
  const result=document.getElementById('quickQuoteResult');
  if(!sym||sym.length<2){ result.innerHTML='<div class="empty-state"><p>输入代码查看行情</p></div>'; return; }
  // 先查本地
  const local=getFilteredStocks().find(s=>s.symbol===sym);
  if(local){
    const change=local.price-(local.prevClose||local.price);
    const pct=(change/(local.prevClose||local.price)*100)||0;
    const isUp=change>=0;
    const cur=local.currency==='USD'?'$':'¥';
    result.innerHTML=`<div><div style="font-size:1.1rem;font-weight:700;margin-bottom:6px">${local.name} (${local.symbol})</div>
      <div style="font-family:var(--font-mono);font-size:1.3rem;color:${isUp?'var(--green)':'var(--red)'}">${cur}${local.price.toFixed(2)} ${isUp?'+':''}${change.toFixed(2)} (${isUp?'+':''}${pct.toFixed(2)}%)</div>
      <div style="color:var(--text-secondary);font-size:.85rem;margin-top:6px">${local.sector}${local.unit?' · '+local.unit:''}</div></div>`;
    document.getElementById('quickPrice').value=local.price.toFixed(2);
    return;
  }
  // 本地没有，调后端 API 查全市场
  const d = await apiGet('/api/quotes/' + encodeURIComponent(sym));
  if(d && d.quote){
    const q = d.quote;
    const change = q.change || (q.price - (q.prevClose||q.price));
    const pct = q.changePercent || (q.prevClose ? (change/q.prevClose*100) : 0);
    const isUp = change >= 0;
    const cur = q.currency==='USD'?'$':'¥';
    result.innerHTML=`<div><div style="font-size:1.1rem;font-weight:700;margin-bottom:6px">${q.name} (${q.symbol})</div>
      <div style="font-family:var(--font-mono);font-size:1.3rem;color:${isUp?'var(--green)':'var(--red)'}">${cur}${q.price.toFixed(2)} ${isUp?'+':''}${change.toFixed(2)} (${isUp?'+':''}${pct.toFixed(2)}%)</div>
      <div style="color:var(--text-secondary);font-size:.85rem;margin-top:6px">${q.market||''} ${q.category||''}</div></div>`;
    document.getElementById('quickPrice').value=q.price.toFixed(2);
  } else {
    result.innerHTML='<div class="empty-state"><p>未找到该资产</p></div>';
  }
}
async function quickTrade(type){
  const sym=document.getElementById('quickSymbol').value.trim().toUpperCase();
  const price=parseFloat(document.getElementById('quickPrice').value);
  const qty=parseInt(document.getElementById('quickQty').value);
  if(!sym||!qty||qty%100!==0){ notify('请填写完整信息','error'); return; }
  const result=await apiPost(`/api/trade/${type}`,{symbol:sym,qty,price});
  if(result&&result.success){
    notify(type==='buy'?'买入下单成功':'卖出下单成功','success');
    document.getElementById('quickQty').value='';
    await refreshAccount();
    await refreshAccountSummary();
  }
  else notify(result?.error||'下单失败','error');
}

/* ===== PORTFOLIO VIEW（使用 /api/account/summary 统一口径） ===== */
async function refreshAccountSummary(){
  const d=await apiGet('/api/account/summary');
  if(d&&d.success) accountSummary=d;
}
function renderPortfolioView(){
  const summary=document.getElementById('portfolioSummary');
  const list=document.getElementById('portfolioList');

  if(accountSummary){
    // 用统一汇总数据
    const s=accountSummary;
    summary.innerHTML=`
      <div class="summary-card" data-testid="metric-total-assets" data-role="account-metric" data-metric="total-assets">
        <div class="summary-label">总资产</div><div class="summary-value">${formatMoney(s.totalAssets)}</div>
      </div>
      <div class="summary-card" data-testid="metric-cash" data-role="account-metric" data-metric="cash">
        <div class="summary-label">可用资金</div><div class="summary-value" style="color:var(--颜色-买入)">${formatMoney(s.cash)}</div>
      </div>
      <div class="summary-card" data-testid="metric-market-value" data-role="account-metric" data-metric="market-value">
        <div class="summary-label">持仓市值</div><div class="summary-value" style="color:var(--颜色-信息)">${formatMoney(s.holdingValue)}</div>
      </div>
      <div class="summary-card" data-testid="metric-unrealized-pnl" data-role="account-metric" data-metric="unrealized-pnl">
        <div class="summary-label">未实现盈亏</div><div class="summary-value" style="color:${s.totalUnrealizedPnL>=0?'var(--颜色-买入)':'var(--颜色-卖出)'}">${s.totalUnrealizedPnL>=0?'+':''}${s.totalUnrealizedPnL.toFixed(2)}</div>
      </div>
      <div class="summary-card" data-testid="metric-today-pnl" data-role="account-metric" data-metric="today-pnl">
        <div class="summary-label">今日收益</div><div class="summary-value" style="color:${s.todayRealizedPnL>=0?'var(--颜色-买入)':'var(--颜色-卖出)'}">${s.todayRealizedPnL>=0?'+':''}${s.todayRealizedPnL.toFixed(2)}</div>
      </div>
      <div class="summary-card" data-testid="metric-holding-count" data-role="account-metric" data-metric="holding-count">
        <div class="summary-label">持仓数量</div><div class="summary-value">${s.holdingCount} 只</div>
      </div>`;

    if(!s.holdings||s.holdings.length===0){
      list.innerHTML='<div class="empty-state" data-role="empty-state"><div class="empty-state__icon">📭</div><div class="empty-state__text">暂无持仓</div></div>'; return;
    }
    list.innerHTML=s.holdings.map(h=>{
      return `<div class="holding-card" data-testid="holding-item" data-role="holding-item" data-symbol="${h.symbol}" onclick="jumpToStock('${h.symbol}')"><div class="holding-left">
        <div class="holding-name">${h.name||h.symbol} (${h.symbol})</div>
        <div class="holding-detail">${formatQty(h.qty)}股 · 成本 ${h.avgCost.toFixed(2)} · 现价 ${h.latestPrice.toFixed(2)}</div>
        <div class="holding-detail">市值 ${formatMoney(h.marketValue)}</div>
      </div><div class="holding-right">
        <div class="holding-pnl ${h.isUp?'up':'down'}">${h.isUp?'+':''}${h.unrealizedPnL.toFixed(2)}</div>
        <div class="holding-pct ${h.isUp?'up':'down'}">${h.isUp?'+':''}${h.unrealizedPnLRatio.toFixed(2)}%</div>
        <div style="font-size:var(--字号-极小);color:var(--文字-弱);margin-top:2px">${h.isUp?'上涨':'下跌'}</div>
      </div></div>`;
    }).join('');
    return;
  }

  // 兜底：如果 summary 还没加载，用旧逻辑
  const keys=Object.keys(accountData.holdings);
  let holdingValue=0;
  keys.forEach(sym=>{
    const h=accountData.holdings[sym];
    const stock=getFilteredStocks().find(s=>s.symbol===sym);
    holdingValue+=h.qty*(stock?stock.price:h.avgCost);
  });
  const totalAssets=accountData.balance+holdingValue;
  summary.innerHTML=`<div class="summary-card"><div class="summary-label">总资产</div><div class="summary-value">${formatMoney(totalAssets)}</div></div>
    <div class="summary-card"><div class="summary-label">可用资金</div><div class="summary-value" style="color:var(--颜色-买入)">${formatMoney(accountData.balance)}</div></div>
    <div class="summary-card"><div class="summary-label">持仓市值</div><div class="summary-value" style="color:var(--颜色-信息)">${formatMoney(holdingValue)}</div></div>`;
  if(keys.length===0){ list.innerHTML='<div class="empty-state"><div class="icon">📭</div><p>暂无持仓</p></div>'; return; }
  list.innerHTML=keys.map(sym=>{
    const h=accountData.holdings[sym]; const stock=getFilteredStocks().find(s=>s.symbol===sym);
    const current=stock?stock.price:h.avgCost;
    const pnl=(current-h.avgCost)*h.qty; const pnlPct=((current-h.avgCost)/h.avgCost*100)||0;
    const isUp=pnl>=0;
    return `<div class="holding-card" data-testid="holding-item" data-symbol="${sym}" onclick="jumpToStock('${sym}')"><div class="holding-left">
      <div class="holding-name">${h.name||sym} (${sym})</div>
      <div class="holding-detail">${formatQty(h.qty)}股 · 成本 ${h.avgCost.toFixed(2)} · 现价 ${current.toFixed(2)}</div>
    </div><div class="holding-right">
      <div class="holding-pnl ${isUp?'up':'down'}">${isUp?'+':''}${pnl.toFixed(2)}</div>
      <div class="holding-pct ${isUp?'up':'down'}">${isUp?'+':''}${pnlPct.toFixed(2)}%</div>
      <div style="font-size:var(--字号-极小);color:var(--文字-弱);margin-top:2px">${isUp?'上涨':'下跌'}</div>
    </div></div>`;
  }).join('');
}
function jumpToStock(sym){
  const stock=getFilteredStocks().find(s=>s.symbol===sym);
  if(stock){ selectStock(sym); switchView('quotes'); }
}

/* ===== HISTORY VIEW ===== */
function filterHistory(type){
  historyFilter=type;
  document.querySelectorAll('.history-filter .preset-btn').forEach(b=>{
    b.classList.toggle('active',b.getAttribute('data-filter')===type);
  });
  renderHistoryView();
}
function renderHistoryView(){
  const list=document.getElementById('historyList');
  let trades=accountData.history||[];
  // 筛选
  if(historyFilter!=='all') trades=trades.filter(t=>t.type===historyFilter);

  if(!trades.length){ list.innerHTML='<div class="empty-state" data-role="empty-state"><div class="empty-state__icon">📝</div><div class="empty-state__text">暂无成交记录</div></div>'; return; }
  list.innerHTML=trades.slice(0,100).map(h=>{
    const d=new Date(h.time);
    const timeStr=isNaN(d)?h.time:d.toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
    const unit = h.unit || '股';
    const dirText=h.type==='buy'?'买入':'卖出';
    return `<div class="history-item" data-testid="history-item" data-role="history-item" data-side="${h.type}" data-symbol="${h.symbol}" data-status="success">
      <span class="history-type ${h.type}">${dirText}</span>
      <span class="history-detail">${h.name} ${formatQty(h.qty)}${unit} @ ${h.price.toFixed(2)}</span>
      <div class="history-amount"><div class="history-amount-value">${formatMoney(h.total)}</div><div class="history-time">${timeStr}</div></div>
    </div>`;
  }).join('');
}

/* ===== UTILS ===== */
function updateBalance(){ document.getElementById('headerBalance').textContent=formatMoney(accountData.balance); }
async function resetAccount(){
  if(confirm('确定重置账户？所有持仓、记录和条件单将被清空。')){
    const r=await apiPost('/api/account/reset');
    if(r&&r.success){ notify(r.message,'info'); await refreshAccount(); }
  }
}
function notify(msg,type='info'){
  // 旧通知区（兼容）
  const el=document.getElementById('notification');
  el.textContent=msg; el.className=`notification ${type} show`;
  setTimeout(()=>el.classList.remove('show'),3000);
  // 新系统消息区（Agent 可读）
  const fb=document.getElementById('system-feedback');
  if(fb){
    fb.textContent=msg;
    fb.className=`system-feedback ${type} show`;
    setTimeout(()=>fb.classList.remove('show'),3500);
  }
}

/* ===== TICK ===== */
async function tick(){
  await refreshMarketStatus();
  await refreshQuotes();
  await refreshAccount();
  if(marketStatus.isOpen){
    await apiPost('/api/orders/check');
  }
  // 每30秒刷新一次汇总（避免太频繁）
  if(Date.now()%30000<6000) await refreshAccountSummary();
}

/* ===== ANALYSIS VIEW（新增，不改旧逻辑） ===== */
let analysisData = null;

async function loadAnalysis(){
  const d = await apiGet('/api/analysis');
  if(!d || !d.success){ document.getElementById('metricCards').innerHTML='<div class="empty-state"><p>加载分析数据失败</p></div>'; return; }
  analysisData = d;
  renderMetricCards(d.总结);
  renderInsights(d.总结.表现);
  renderEquityCurve(d.分析.盈亏明细);
  renderPnlDist(d.分析.盈亏明细);
  renderAnalysisTradeList(d.分析.盈亏明细);
}

function renderMetricCards(总结){
  const el = document.getElementById('metricCards');
  const p = 总结.表现;
  const e = 总结.评估;
  const 总收益 = p.总收益;
  const 胜率 = p.胜率;
  const 盈亏比 = p.盈亏比;
  const 最大回撤 = p.最大回撤;

  function valClass(v, positiveGood=true){
    if(v === null || v === undefined) return 'neutral';
    if(positiveGood) return v > 0 ? 'positive' : v < 0 ? 'negative' : 'neutral';
    return v < 0 ? 'negative' : 'neutral';
  }
  function fmt(v, suffix='', decimals=2){
    if(v === null || v === undefined) return '--';
    return (v>0?'+':'')+v.toFixed(decimals)+suffix;
  }

  el.innerHTML = `
    <div class="metric-card">
      <div class="metric-card-label">总收益</div>
      <div class="metric-card-value ${valClass(总收益)}">${fmt(总收益,'')}</div>
      <div class="metric-card-sub">${p.交易次数||0} 笔交易</div>
    </div>
    <div class="metric-card">
      <div class="metric-card-label">胜率</div>
      <div class="metric-card-value ${valClass(胜率, true)}">${胜率!==null?(胜率*100).toFixed(1)+'%':'--'}</div>
      <div class="metric-card-sub">${e.状态||'--'}</div>
    </div>
    <div class="metric-card">
      <div class="metric-card-label">盈亏比</div>
      <div class="metric-card-value ${valClass(盈亏比, true)}">${fmt(盈亏比,'',2)}</div>
      <div class="metric-card-sub">风险: ${e.风险||'--'}</div>
    </div>
    <div class="metric-card">
      <div class="metric-card-label">最大回撤</div>
      <div class="metric-card-value ${最大回撤!==null?'negative':'neutral'}">${最大回撤!==null?(最大回撤*100).toFixed(1)+'%':'--'}</div>
      <div class="metric-card-sub">从峰值计算</div>
    </div>`;
}

function renderEquityCurve(盈亏明细){
  const canvas = document.getElementById('equityCanvas');
  if(!canvas) return;
  const container = canvas.parentElement;
  const dpr = window.devicePixelRatio || 1;
  const W = container.clientWidth, H = container.clientHeight;
  canvas.width = W * dpr; canvas.height = H * dpr;
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  if(!盈亏明细 || 盈亏明细.length === 0){
    ctx.fillStyle = '#4a5568'; ctx.font = '14px Space Grotesk'; ctx.textAlign = 'center';
    ctx.fillText('暂无数据', W/2, H/2); return;
  }

  // 累计收益曲线
  let cumPnl = [0];
  盈亏明细.forEach(t => { cumPnl.push(cumPnl[cumPnl.length-1] + (t.pnl||0)); });

  const pad = {top:10, right:10, bottom:20, left:50};
  const cW = W - pad.left - pad.right;
  const cH = H - pad.top - pad.bottom;
  const minV = Math.min(...cumPnl);
  const maxV = Math.max(...cumPnl);
  const range = maxV - minV || 1;
  const xStep = cW / (cumPnl.length - 1 || 1);

  // 零线
  const zeroY = pad.top + ((maxV - 0) / range) * cH;
  ctx.strokeStyle = '#2a3f5f'; ctx.lineWidth = 0.5; ctx.setLineDash([4,4]);
  ctx.beginPath(); ctx.moveTo(pad.left, zeroY); ctx.lineTo(W - pad.right, zeroY); ctx.stroke();
  ctx.setLineDash([]);

  // 填充
  ctx.beginPath();
  cumPnl.forEach((v, i) => {
    const x = pad.left + i * xStep;
    const y = pad.top + ((maxV - v) / range) * cH;
    if(i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  const lastX = pad.left + (cumPnl.length - 1) * xStep;
  ctx.lineTo(lastX, zeroY);
  ctx.lineTo(pad.left, zeroY);
  ctx.closePath();
  const isUp = cumPnl[cumPnl.length-1] >= 0;
  ctx.fillStyle = isUp ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)';
  ctx.fill();

  // 曲线
  ctx.beginPath();
  cumPnl.forEach((v, i) => {
    const x = pad.left + i * xStep;
    const y = pad.top + ((maxV - v) / range) * cH;
    if(i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = isUp ? '#10b981' : '#ef4444';
  ctx.lineWidth = 2; ctx.stroke();

  // Y轴标签
  ctx.fillStyle = '#4a5568'; ctx.font = '10px JetBrains Mono'; ctx.textAlign = 'right';
  for(let i = 0; i <= 4; i++){
    const val = maxV - (range / 4) * i;
    const y = pad.top + (cH / 4) * i;
    ctx.fillText(val.toFixed(0), pad.left - 6, y + 4);
  }
}

function renderPnlDist(盈亏明细){
  const canvas = document.getElementById('pnlDistCanvas');
  if(!canvas) return;
  const container = canvas.parentElement;
  const dpr = window.devicePixelRatio || 1;
  const W = container.clientWidth, H = container.clientHeight;
  canvas.width = W * dpr; canvas.height = H * dpr;
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  if(!盈亏明细 || 盈亏明细.length === 0){
    ctx.fillStyle = '#4a5568'; ctx.font = '14px Space Grotesk'; ctx.textAlign = 'center';
    ctx.fillText('暂无数据', W/2, H/2); return;
  }

  const pnls = 盈亏明细.map(t => t.pnl || 0);
  const maxPnl = Math.max(...pnls);
  const minPnl = Math.min(...pnls);
  const pad = {top:10, right:10, bottom:20, left:50};
  const cW = W - pad.left - pad.right;
  const cH = H - pad.top - pad.bottom;

  // 画柱状图
  const barW = Math.max(4, Math.min(30, cW / pnls.length - 2));
  const gap = (cW - barW * pnls.length) / (pnls.length + 1);
  const zeroY = pad.top + (maxPnl / (maxPnl - minPnl || 1)) * cH;

  // 零线
  ctx.strokeStyle = '#2a3f5f'; ctx.lineWidth = 0.5; ctx.setLineDash([4,4]);
  ctx.beginPath(); ctx.moveTo(pad.left, zeroY); ctx.lineTo(W - pad.right, zeroY); ctx.stroke();
  ctx.setLineDash([]);

  pnls.forEach((pnl, i) => {
    const x = pad.left + gap + i * (barW + gap);
    const isUp = pnl >= 0;
    const barH = Math.abs(pnl) / (maxPnl - minPnl || 1) * cH;
    const y = isUp ? zeroY - barH : zeroY;
    ctx.fillStyle = isUp ? 'rgba(16,185,129,0.6)' : 'rgba(239,68,68,0.6)';
    ctx.beginPath();
    ctx.roundRect(x, y, barW, Math.max(2, barH), 2);
    ctx.fill();
  });

  // Y轴标签
  ctx.fillStyle = '#4a5568'; ctx.font = '10px JetBrains Mono'; ctx.textAlign = 'right';
  for(let i = 0; i <= 4; i++){
    const val = maxPnl - ((maxPnl - minPnl) / 4) * i;
    const y = pad.top + (cH / 4) * i;
    ctx.fillText(val.toFixed(0), pad.left - 6, y + 4);
  }
}

function renderAnalysisTradeList(盈亏明细){
  const el = document.getElementById('analysisTradeList');
  if(!盈亏明细 || 盈亏明细.length === 0){
    el.innerHTML = '<div class="empty-state" style="padding:20px"><p>暂无已完成的卖出交易</p></div>'; return;
  }

  let html = `<div class="atl-row header">
    <span>方向</span><span>股票</span><span>价格</span><span>数量</span><span>盈亏</span><span>策略</span>
  </div>`;

  盈亏明细.slice(0, 50).forEach(t => {
    const pnl = t.pnl || 0;
    const isUp = pnl >= 0;
    html += `<div class="atl-row">
      <span class="atl-type ${t.type}">${t.type==='buy'?'买入':'卖出'}</span>
      <span class="atl-detail">${t.name||t.symbol}</span>
      <span class="atl-detail">${(t.price||0).toFixed(2)}</span>
      <span class="atl-detail">${t.qty||0}</span>
      <span class="atl-pnl ${isUp?'positive':'negative'}">${isUp?'+':''}${pnl.toFixed(2)}</span>
      <span>${t.strategy ? '<span class="atl-strategy">'+t.strategy+'</span>' : '--'}</span>
    </div>`;
  });

  el.innerHTML = html;
}

/* ===== DASHBOARD STATS（追加到行情视图顶部，不改旧结构） ===== */
function renderDashboardStats(){
  // 在行情视图 center 区顶部追加今日统计
  const center = document.querySelector('.quotes-center');
  if(!center) return;
  let dashEl = document.getElementById('dashStats');
  if(!dashEl){
    dashEl = document.createElement('div');
    dashEl.id = 'dashStats';
    dashEl.className = 'dashboard-stats';
    center.insertBefore(dashEl, center.firstChild);
  }

  // 今日收益
  const today = new Date().toISOString().slice(0, 10);
  const todayTrades = (accountData.history || []).filter(t => t.time && t.time.startsWith(today));
  let todayPnl = 0;
  // 简化：卖出交易的收入
  todayTrades.filter(t => t.type === 'sell').forEach(t => { todayPnl += t.total || 0; });

  // 当前仓位
  const holdingCount = Object.keys(accountData.holdings || {}).length;

  // 风险状态
  let riskLabel = '低', riskClass = 'positive';
  if(analysisData && analysisData.总结){
    const r = analysisData.总结.评估.风险;
    if(r === '高'){ riskLabel = '高'; riskClass = 'negative'; }
    else if(r === '中'){ riskLabel = '中'; riskClass = ''; }
  }

  dashEl.innerHTML = `
    <div class="dash-stat"><div class="dash-stat-label">今日收益</div><div class="dash-stat-value ${todayPnl>=0?'positive':'negative'}">${todayPnl>=0?'+':''}${todayPnl.toFixed(2)}</div></div>
    <div class="dash-stat"><div class="dash-stat-label">当前持仓</div><div class="dash-stat-value">${holdingCount} 只</div></div>
    <div class="dash-stat"><div class="dash-stat-label">风险状态</div><div class="dash-stat-value ${riskClass}">${riskLabel}</div></div>`;
}

/* ===== 当前标的强化区 ===== */
function updateCurrentSymbolPanel(){
  const panel=document.getElementById('currentSymbolPanel');
  if(!panel) return;
  if(!selectedStock){ panel.style.display='none'; return; }
  panel.style.display='block';
  panel.setAttribute('data-symbol',selectedStock.symbol);

  const change=selectedStock.price-(selectedStock.prevClose||selectedStock.price);
  const pct=(change/(selectedStock.prevClose||selectedStock.price)*100)||0;
  const isUp=change>=0;
  const cur=selectedStock.currency==='USD'?'$':'¥';
  const dirText=isUp?'上涨':'下跌';

  document.getElementById('csName').textContent=selectedStock.name;
  document.getElementById('csCode').textContent=selectedStock.symbol+' · '+(selectedStock.sector||'');
  document.getElementById('csPrice').textContent=cur+selectedStock.price.toFixed(2);
  document.getElementById('csPrice').style.color=isUp?'var(--颜色-买入)':'var(--颜色-卖出)';

  const changeEl=document.getElementById('csChange');
  changeEl.textContent=`${isUp?'+':''}${change.toFixed(2)} (${isUp?'+':''}${pct.toFixed(2)}%)`;
  changeEl.className=`current-symbol-change ${isUp?'up':'down'}`;

  const dirEl=document.getElementById('csDirection');
  dirEl.textContent=dirText;
  dirEl.className=`current-symbol-direction ${isUp?'up':'down'}`;

  updateCurrentSymbolHolding();
}

function updateCurrentSymbolHolding(){
  const el=document.getElementById('csHolding');
  if(!el||!selectedStock) return;
  const h=accountData.holdings[selectedStock.symbol];
  if(h){
    const cur=selectedStock.currency==='USD'?'$':'¥';
    const pnl=(selectedStock.price-h.avgCost)*h.qty;
    const isUp=pnl>=0;
    el.style.display='block';
    el.innerHTML=`持有 ${h.qty}股 · 成本 ${h.avgCost.toFixed(2)} · 浮盈 ${isUp?'+':''}${pnl.toFixed(2)}（${isUp?'+':''}${((selectedStock.price-h.avgCost)/h.avgCost*100).toFixed(2)}%）`;
    el.style.color=isUp?'var(--颜色-买入)':'var(--颜色-卖出)';
  } else {
    el.style.display='none';
  }
}

/* ===== 复盘解释层 ===== */
function renderInsights(metrics){
  const panel=document.getElementById('insightsPanel');
  if(!panel) return;
  const insights=[];
  const trades=metrics.交易次数||0;
  const winRate=metrics.胜率;
  const pnlRatio=metrics.盈亏比;
  const maxDD=metrics.最大回撤;

  if(trades<5) insights.push('当前交易样本较少，分析结论仅供参考。');
  if(winRate!==null&&winRate>=0.6&&pnlRatio!==null&&pnlRatio<1.2) insights.push('胜率较高，但盈亏比偏弱，可能存在赚小亏大的问题。');
  if(maxDD!==null&&maxDD<=-0.15) insights.push('最大回撤偏高，建议降低仓位集中度并减少连续追单。');
  if(winRate!==null&&winRate>=0.5&&pnlRatio!==null&&pnlRatio>=1.5) insights.push('胜率和盈亏比均表现良好，当前策略框架有效。');
  if(!insights.length) insights.push('当前交易表现较均衡，建议继续关注仓位控制与交易节奏。');

  panel.style.display='block';
  panel.innerHTML=insights.map(i=>`<div class="insight-item"><span class="insight-icon">💡</span><span>${i}</span></div>`).join('');
}

/* ===== INIT ===== */
async function init(){
  await refreshMarketStatus();
  await refreshQuotes();
  await refreshAccount();
  await refreshAccountSummary();
  resizeChartCanvas();
  setupChartHover();
  if(quotesData.astocks.length) selectStock(quotesData.astocks[0].symbol);
  // 后台静默加载分析数据
  loadAnalysis().then(() => renderDashboardStats());
  setInterval(tick,5000);
  window.addEventListener('resize',()=>{ resizeChartCanvas(); drawChart(); });
}
init();
