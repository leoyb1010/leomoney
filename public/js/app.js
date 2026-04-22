/* Leomoney Frontend v1.4.0 — 自选系统 + 行情状态 + 交易规则 + 汇率感知 + 命名修正 */
const API = '';
let marketStatus = { isOpen: false, status: '检测中' };
let quotesData = { indices: [], astocks: [], hkstocks: [], usstocks: [], metals: [], crypto: [], ts: 0 };
let quoteStatus = null; // 行情刷新状态
let accountData = { balance: 1000000, holdings: {}, history: [], pendingOrders: [] };
let accountSummary = null;
let watchlist = []; // 自选列表
let fxRates = { CNY: 1, USD: 7.25, HKD: 0.93 }; // 汇率缓存
let currentView = 'quotes';
let currentListMode = 'hot'; // 'hot' = 热门行情, 'fav' = 我的自选
let currentMarketCat = 'all';
let selectedStock = null;
let selectedIndex = null;
let tradeType = 'buy';
let timeframe = 5;
let candles = {};
let searchFilter = '';
let searchResults = [];
let searchTimer = null;
let historyFilter = 'all';
let lastQuoteTime = null; // 上次行情刷新时间

function formatPrice(p){ return p!=null ? p.toFixed(2) : '--'; }
function formatMoney(m){ return '¥'+m.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,','); }
function formatQty(q){ return q.toLocaleString(); }

// 汇率折算
function toCNY(amount, currency) {
  if (currency === 'CNY' || !currency) return amount;
  const rate = fxRates[currency] || 1;
  return amount * rate;
}
function formatMoneyCNY(amount, currency) {
  if (currency === 'CNY' || !currency) return formatMoney(amount);
  return formatMoney(toCNY(amount, currency));
}

// ===== 资产类别规则 =====
function getCategoryRules(category) {
  switch(category) {
    case 'crypto': return { unit: '枚', step: 0.01, minQty: 0.01, multiple: false, label: '加密' };
    case 'metals': return { unit: '盎司', step: 1, minQty: 1, multiple: false, label: '贵金属' };
    case 'hkstocks': return { unit: '股', step: 100, minQty: 100, multiple: true, label: '港股' };
    case 'usstocks': return { unit: '股', step: 1, minQty: 1, multiple: false, label: '美股' };
    default: return { unit: '股', step: 100, minQty: 100, multiple: true, label: 'A股' }; // astocks
  }
}

/* ===== API ===== */
async function apiGet(path){
  try{ const r=await fetch(API+path); if(!r.ok) throw new Error('HTTP '+r.status); return await r.json(); }
  catch(e){ console.warn('API '+path+' failed:',e.message); return null; }
}
async function apiPost(path,body){
  try{ const r=await fetch(API+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  return await r.json(); } catch(e){ return {success:false,error:e.message}; }
}
async function apiDelete(path){
  try{ const r=await fetch(API+path,{method:'DELETE'}); return await r.json(); }
  catch(e){ return {success:false,error:e.message}; }
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
  // 更新行情刷新时间
  if(lastQuoteTime){
    const timeStr = new Date(lastQuoteTime).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
    const tsEl = document.getElementById('quoteTimestamp');
    if(tsEl) tsEl.textContent = '更新于 ' + timeStr;
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
  document.querySelector('.search-input').value = '';
  renderStockList();
}

/* ===== LIST MODE: 热门 vs 自选 ===== */
function setListMode(mode){
  currentListMode = mode;
  document.querySelectorAll('.list-mode-tab').forEach(t => t.classList.remove('active'));
  document.querySelector(`.list-mode-tab[data-mode="${mode}"]`)?.classList.add('active');
  searchFilter = '';
  searchResults = [];
  document.querySelector('.search-input').value = '';
  renderStockList();
}

/* ===== QUOTES ===== */
async function refreshQuotes(){
  const d=await apiGet('/api/quotes');
  if(d&&d.success){
    quotesData=d;
    quoteStatus=d.quoteStatus||null;
    lastQuoteTime=d.ts||Date.now();
    // 更新汇率缓存
    if(d.rates) fxRates = d.rates;
    renderStockList(); renderIndices();
    if(selectedStock) updateSelectedStockPrice();
    if(selectedIndex) updateIndexChartHeader();
    updateStatusUI();
  }
}
async function refreshAccount(){
  const d=await apiGet('/api/account');
  if(d&&d.success){ accountData=d; updateBalance(); renderOrderList(); }
}
async function refreshWatchlist(){
  const d=await apiGet('/api/watchlist');
  if(d&&d.success) watchlist=d.watchlist||[];
}
async function refreshFx(){
  const d=await apiGet('/api/fx');
  if(d&&d.success) fxRates=d.rates;
}

// 刷新已选标的的价格（行情刷新时不重新选中，只更新价格）
function updateSelectedStockPrice(){
  if(!selectedStock) return;
  const all = getAllStocks();
  const fresh = all.find(s=>s.symbol===selectedStock.symbol);
  if(fresh){
    selectedStock.price = fresh.price;
    selectedStock.prevClose = fresh.prevClose;
    selectedStock.open = fresh.open;
    selectedStock.high = fresh.high;
    selectedStock.low = fresh.low;
    selectedStock.change = fresh.change;
    selectedStock.changePercent = fresh.changePercent;
    updateChartHeader();
    updateCurrentSymbolPanel();
  }
}

function getAllStocks(){
  let all=[];
  const cats = ['astocks','hkstocks','usstocks','metals','crypto'];
  cats.forEach(cat=>{
    (quotesData[cat]||[]).forEach(s=>all.push({...s,category:cat}));
  });
  return all;
}

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

// 获取自选中的实时行情数据
function getWatchlistStocks(){
  if(!watchlist.length) return [];
  const all = getAllStocks();
  return watchlist.map(w => {
    const q = all.find(s=>s.symbol===w.symbol);
    return q ? {...q, isFavorite: true} : {...w, price: 0, prevClose: 0, change: 0, changePercent: 0, isFavorite: true, noQuote: true};
  }).filter(s => {
    // 按市场分类过滤
    if(currentMarketCat === 'all') return true;
    return s.category === currentMarketCat;
  });
}

/* ===== 渲染股票列表（自选/热门分离） ===== */
function renderStockList(){
  const el=document.getElementById('watchlist');
  // 搜索结果优先
  if(searchResults.length > 0){
    el.innerHTML = searchResults.map(s => {
      const tagClass = s.category || 'a';
      const catLabel = getCategoryRules(s.category).label;
      const isFav = watchlist.some(w=>w.symbol===s.symbol);
      return `<div class="stock-item" onclick="selectStockFromSearch('${s.symbol}','${s.sinaCode||''}','${s.category||''}','${s.name}')">
        <div class="stock-info">
          <div class="stock-name-row"><span class="stock-name">${s.name}</span><span class="stock-tag ${tagClass}">${catLabel}</span></div>
          <div class="stock-symbol">${s.symbol} · ${s.sector||''}</div>
        </div>
        <div class="stock-price-area">
          <button class="fav-btn ${isFav?'active':''}" onclick="event.stopPropagation();toggleFavorite('${s.symbol}','${s.name}','${s.category||''}','${s.currency||'CNY'}')" title="${isFav?'取消自选':'加入自选'}">${isFav?'★':'☆'}</button>
          <div class="stock-price" style="color:var(--text-secondary)">点击查看</div>
        </div>
      </div>`;
    }).join('');
    return;
  }

  // 自选模式
  if(currentListMode === 'fav'){
    const favStocks = getWatchlistStocks();
    if(favStocks.length === 0){
      el.innerHTML = `<div class="empty-state" style="padding:30px 16px">
        <div style="font-size:2rem;margin-bottom:8px">☆</div>
        <div style="color:var(--text-secondary);font-size:.9rem">自选列表为空</div>
        <div style="color:var(--text-secondary);font-size:.8rem;margin-top:6px">搜索股票后点击 ☆ 加入自选</div>
      </div>`;
      return;
    }
    el.innerHTML = favStocks.map(s => {
      if(s.noQuote){
        return `<div class="stock-item" onclick="selectStockFromSearch('${s.symbol}','','${s.category||''}','${s.name}')">
          <div class="stock-info">
            <div class="stock-name-row"><span class="stock-name">${s.name}</span><span class="stock-tag">${getCategoryRules(s.category).label}</span></div>
            <div class="stock-symbol">${s.symbol} · 休市无报价</div>
          </div>
          <div class="stock-price-area">
            <button class="fav-btn active" onclick="event.stopPropagation();toggleFavorite('${s.symbol}')" title="取消自选">★</button>
          </div>
        </div>`;
      }
      const change=s.price-(s.prevClose||s.price);
      const pct=(change/(s.prevClose||s.price)*100)||0;
      const isUp=change>=0;
      const isActive=selectedStock?.symbol===s.symbol;
      const cur=s.currency==='USD'?'$':s.currency==='HKD'?'HK$':'¥';
      return `<div class="stock-item ${isActive?'active':''}" onclick="selectStock('${s.symbol}')">
        <div class="stock-info">
          <div class="stock-name-row"><span class="stock-name">${s.name}</span><span class="stock-tag">${getCategoryRules(s.category).label}</span></div>
          <div class="stock-symbol">${s.symbol} · ${s.sector||''}</div>
        </div>
        <div class="stock-price-area">
          <button class="fav-btn active" onclick="event.stopPropagation();toggleFavorite('${s.symbol}')" title="取消自选">★</button>
          <div class="stock-price">${cur}${s.price>=1000?s.price.toFixed(0):s.price.toFixed(2)}</div>
          <div class="stock-change ${isUp?'up':'down'}">${isUp?'+':''}${pct.toFixed(2)}%</div>
        </div>
      </div>`;
    }).join('');
    return;
  }

  // 热门行情模式
  const filtered=getFilteredStocks();
  el.innerHTML=filtered.map(s=>{
    const change=s.price-(s.prevClose||s.price);
    const pct=(change/(s.prevClose||s.price)*100)||0;
    const isUp=change>=0;
    const isActive=selectedStock?.symbol===s.symbol;
    const isFav=watchlist.some(w=>w.symbol===s.symbol);
    const cur=s.currency==='USD'?'$':s.currency==='HKD'?'HK$':'¥';
    return `<div class="stock-item ${isActive?'active':''}" onclick="selectStock('${s.symbol}')">
      <div class="stock-info">
        <div class="stock-name-row"><span class="stock-name">${s.name}</span><span class="stock-tag">${getCategoryRules(s.category).label}</span></div>
        <div class="stock-symbol">${s.symbol} · ${s.sector||''}</div>
      </div>
      <div class="stock-price-area">
        <button class="fav-btn ${isFav?'active':''}" onclick="event.stopPropagation();toggleFavorite('${s.symbol}','${s.name}','${s.category||''}','${s.currency||'CNY'}')" title="${isFav?'取消自选':'加入自选'}">${isFav?'★':'☆'}</button>
        <div class="stock-price">${cur}${s.price>=1000?s.price.toFixed(0):s.price.toFixed(2)}</div>
        <div class="stock-change ${isUp?'up':'down'}">${isUp?'+':''}${pct.toFixed(2)}%</div>
      </div>
    </div>`;
  }).join('');
}

// 自选操作
async function toggleFavorite(symbol, name, category, currency){
  const isFav = watchlist.some(w=>w.symbol===symbol);
  if(isFav){
    const r = await apiDelete('/api/watchlist/'+encodeURIComponent(symbol));
    if(r&&r.success){ await refreshWatchlist(); renderStockList(); notify('已从自选移除','info'); }
    else notify(r?.error||'移除失败','error');
  } else {
    const r = await apiPost('/api/watchlist',{symbol,name,category:category||'astocks',currency:currency||'CNY'});
    if(r&&r.success){ await refreshWatchlist(); renderStockList(); notify('已加入自选','success'); }
    else notify(r?.error||'添加失败','error');
  }
  // 更新当前标的面板的自选状态
  if(selectedStock && selectedStock.symbol === symbol) updateCurrentSymbolPanel();
}

// 搜索框输入时调后端 API 搜索全市场
function filterStocks(val){
  searchFilter = val;
  if(searchTimer) clearTimeout(searchTimer);
  if(!val || val.length < 1){
    searchResults = [];
    renderStockList();
    return;
  }
  searchTimer = setTimeout(async () => {
    const d = await apiGet('/api/search?q=' + encodeURIComponent(val));
    if(d && d.success){
      searchResults = d.results || [];
    } else {
      searchResults = [];
    }
    renderStockList();
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
  renderStockList(); renderIndices(); updateChartHeader(); drawChart();
  applyStockToTradePanel();
  updateCurrentSymbolPanel();
}

function selectStock(symbol){
  selectedStock=getFilteredStocks().find(s=>s.symbol===symbol) || getWatchlistStocks().find(s=>s.symbol===symbol);
  if(!selectedStock) return;
  selectedIndex=null; generateCandles(symbol);
  renderStockList(); renderIndices(); updateChartHeader(); drawChart();
  applyStockToTradePanel();
  updateCurrentSymbolPanel();
}

// 选中股票后更新交易面板
function applyStockToTradePanel(){
  if(!selectedStock) return;
  const rules = getCategoryRules(selectedStock.category);
  document.getElementById('tradeSymbol').value=selectedStock.symbol+' '+selectedStock.name;
  document.getElementById('tradePrice').value=selectedStock.price.toFixed(2);
  document.getElementById('orderSymbol').value=selectedStock.symbol+' '+selectedStock.name;
  document.getElementById('tradeQty').value='';
  // 按资产类别调整数量输入
  const qtyInput = document.getElementById('tradeQty');
  qtyInput.step = rules.step;
  qtyInput.min = rules.minQty;
  qtyInput.placeholder = rules.multiple ? `${rules.minQty}的整数倍` : `最小${rules.minQty}`;
  // 更新单位标签
  const unitLabel = document.getElementById('qtyUnitLabel');
  if(unitLabel) unitLabel.textContent = rules.unit;
  const orderUnitLabel = document.getElementById('orderQtyUnitLabel');
  if(orderUnitLabel) orderUnitLabel.textContent = rules.unit;
  calcTotal();
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
  const cur=s.currency==='USD'?'$':s.currency==='HKD'?'HK$':'¥';
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
let _chartW = 0, _chartH = 0;

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
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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

  ctx.strokeStyle='#1e2d45'; ctx.lineWidth=0.5;
  for(let i=0;i<=5;i++){ const y=pad.top+(priceH/5)*i; ctx.beginPath(); ctx.moveTo(pad.left,y); ctx.lineTo(W-pad.right,y); ctx.stroke(); const price=maxP-((maxP-minP)/5)*i; ctx.fillStyle='#4a5568'; ctx.font='11px JetBrains Mono'; ctx.textAlign='right'; ctx.fillText(price.toFixed(2),W-5,y+4); }

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

  const last=c[c.length-1]; const lastY=pad.top+((maxP-last.close)/(maxP-minP))*priceH;
  const isUp=last.close>=last.open;
  ctx.setLineDash([4,4]); ctx.strokeStyle=isUp?'#10b981':'#ef4444'; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(pad.left,lastY); ctx.lineTo(W-pad.right,lastY); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle=isUp?'#10b981':'#ef4444'; ctx.fillRect(W-pad.right,lastY-10,58,20); ctx.fillStyle='#fff'; ctx.font='bold 11px JetBrains Mono'; ctx.textAlign='center'; ctx.fillText(last.close.toFixed(2),W-pad.right+29,lastY+4);

  const hi = (hoverIdx !== undefined && hoverIdx >= 0) ? hoverIdx : chartHoverIndex;
  if(hi >= 0 && hi < c.length){
    const x = c[hi];
    const cx = pad.left + hi * candleW + candleW / 2;
    ctx.setLineDash([3,3]); ctx.strokeStyle='rgba(255,255,255,0.3)'; ctx.lineWidth=0.8;
    ctx.beginPath(); ctx.moveTo(cx,pad.top); ctx.lineTo(cx,H-pad.bottom); ctx.stroke();
    ctx.setLineDash([]);
    const hoverPriceY = pad.top + ((maxP - x.close)/(maxP-minP)) * priceH;
    ctx.setLineDash([3,3]); ctx.strokeStyle='rgba(255,255,255,0.3)'; ctx.lineWidth=0.8;
    ctx.beginPath(); ctx.moveTo(pad.left,hoverPriceY); ctx.lineTo(W-pad.right,hoverPriceY); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle='#3b82f6'; ctx.fillRect(W-pad.right,hoverPriceY-10,58,20);
    ctx.fillStyle='#fff'; ctx.font='bold 10px JetBrains Mono'; ctx.textAlign='center';
    ctx.fillText(x.close.toFixed(2),W-pad.right+29,hoverPriceY+4);
    const isUpK = x.close >= x.open;
    const chg = x.close - x.open;
    const chgPct = (chg / x.open * 100) || 0;
    const boxW = 155, boxH = 105;
    let boxX = cx + 15; let boxY = pad.top + 10;
    if(boxX + boxW > W - pad.right) boxX = cx - boxW - 15;
    if(boxY + boxH > H - pad.bottom) boxY = H - pad.bottom - boxH - 5;
    ctx.fillStyle = 'rgba(26,34,53,0.95)'; ctx.strokeStyle = '#2a3f5f'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(boxX, boxY, boxW, boxH, 6); ctx.fill(); ctx.stroke();
    const lineH = 16; let ty = boxY + 16;
    ctx.font = 'bold 11px Space Grotesk'; ctx.fillStyle = '#e2e8f0'; ctx.textAlign = 'left';
    ctx.fillText(x.date || 'Day '+x.time, boxX+10, ty); ty += lineH;
    ctx.font = '10px JetBrains Mono'; ctx.fillStyle = isUpK ? '#10b981' : '#ef4444';
    ctx.fillText('开 '+x.open.toFixed(2)+'  高 '+x.high.toFixed(2), boxX+10, ty); ty += lineH;
    ctx.fillStyle = '#e2e8f0'; ctx.fillText('收 '+x.close.toFixed(2)+'  低 '+x.low.toFixed(2), boxX+10, ty); ty += lineH;
    ctx.fillStyle = isUpK ? '#10b981' : '#ef4444';
    ctx.fillText((isUpK?'+':'')+chg.toFixed(2)+' ('+(isUpK?'+':'')+chgPct.toFixed(2)+'%)', boxX+10, ty); ty += lineH;
    ctx.fillStyle = '#8892a4'; ctx.fillText('量 '+x.volume.toLocaleString(), boxX+10, ty);
  }
}

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
    if(idx >= 0 && idx < c.length){ chartHoverIndex = idx; } else { chartHoverIndex = -1; }
    drawChart(idx);
  });
  canvas.addEventListener('mouseleave', function(){ chartHoverIndex = -1; drawChart(); });
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
  const rules = getCategoryRules(selectedStock.category);
  if(tradeType==='buy'){
    const priceInCNY = toCNY(selectedStock.price, selectedStock.currency);
    let maxQty;
    if(rules.multiple){
      maxQty = Math.floor(accountData.balance / priceInCNY / rules.step) * rules.step;
    } else {
      maxQty = Math.floor(accountData.balance / priceInCNY / rules.step) * rules.step;
    }
    document.getElementById('tradeQty').value=Math.max(0,maxQty);
  } else {
    const h=accountData.holdings[selectedStock.symbol];
    document.getElementById('tradeQty').value=h?h.qty:0;
  }
  calcTotal();
}
function calcTotal(){
  const price=parseFloat(document.getElementById('tradePrice').value)||0;
  const qty=parseFloat(document.getElementById('tradeQty').value)||0;
  const rules = selectedStock ? getCategoryRules(selectedStock.category) : getCategoryRules('astocks');
  const cur = selectedStock?.currency || 'CNY';
  const totalOrig = price * qty;
  const totalCNY = toCNY(totalOrig, cur);
  document.getElementById('tradeTotal').textContent = cur !== 'CNY' ? `$${totalOrig.toFixed(2)} ≈ ${formatMoney(totalCNY)}` : formatMoney(totalOrig);

  // 按品类校验数量
  let qtyValid = qty >= rules.minQty;
  if(rules.multiple) qtyValid = qtyValid && qty % rules.step === 0;
  const valid = price && qtyValid;
  document.getElementById('submitBtn').disabled=!valid;

  const validationEl=document.getElementById('tradeValidation');
  if(validationEl){
    if(!valid&&qty>0){
      if(rules.multiple && qty % rules.step !== 0) validationEl.textContent=`数量必须为${rules.step}的整数倍`;
      else if(qty < rules.minQty) validationEl.textContent=`最小数量为${rules.minQty}${rules.unit}`;
      else if(!price) validationEl.textContent='请输入委托价格';
      validationEl.className='trade-validation error';
    } else if(valid){
      const totalCNYForCheck = toCNY(price * qty, cur);
      if(tradeType==='buy'){
        if(totalCNYForCheck>accountData.balance) validationEl.textContent=`资金不足，需约 ${formatMoney(totalCNYForCheck)}，可用 ${formatMoney(accountData.balance)}`;
        else validationEl.textContent='';
        validationEl.className=totalCNYForCheck>accountData.balance?'trade-validation error':'trade-validation';
      } else {
        const h=accountData.holdings[selectedStock?.symbol];
        if(h&&qty>h.qty) validationEl.textContent=`可卖不足，持有 ${h?.qty||0} ${rules.unit}`;
        else validationEl.textContent='';
        validationEl.className=(h&&qty>h.qty)?'trade-validation error':'trade-validation';
      }
    } else { validationEl.textContent=''; validationEl.className='trade-validation'; }
  }
  const hintEl=document.getElementById('qtyHint');
  if(hintEl&&selectedStock){
    const rules2 = getCategoryRules(selectedStock.category);
    if(tradeType==='buy'){
      const priceInCNY = toCNY(selectedStock.price, selectedStock.currency);
      let maxQty;
      if(rules2.multiple){
        maxQty = Math.floor(accountData.balance / priceInCNY / rules2.step) * rules2.step;
      } else {
        maxQty = Math.floor(accountData.balance / priceInCNY / rules2.step);
      }
      hintEl.textContent=`可买 ${Math.max(0,maxQty)} ${rules2.unit}`;
    } else {
      const h=accountData.holdings[selectedStock?.symbol];
      hintEl.textContent=`可卖 ${h?h.qty:0} ${rules2.unit}`;
    }
  }
}
async function submitOrder(){
  if(!selectedStock) return;
  const price=parseFloat(document.getElementById('tradePrice').value);
  const qty=parseFloat(document.getElementById('tradeQty').value);
  const rules = getCategoryRules(selectedStock.category);
  let qtyValid = qty >= rules.minQty;
  if(rules.multiple) qtyValid = qtyValid && qty % rules.step === 0;
  const validationEl=document.getElementById('tradeValidation');
  if(!price||!qtyValid){
    let msg = '请输入有效价格和数量';
    if(rules.multiple && qty % rules.step !== 0) msg = `数量必须为${rules.step}的整数倍`;
    else if(qty < rules.minQty) msg = `最小数量为${rules.minQty}${rules.unit}`;
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
    updateCurrentSymbolHolding();
    if(currentView==='portfolio') renderPortfolioView();
    if(currentView==='history') renderHistoryView();
  } else {
    const errMsg=result?.error||'下单失败：未知错误';
    notify(errMsg,'error');
    if(validationEl){ validationEl.textContent=errMsg; validationEl.className='trade-validation error'; }
  }
}

/* ===== CONDITIONAL ORDERS ===== */
async function submitOrderCondition(){
  if(!selectedStock) return notify('请先选择股票','error');
  const rules = getCategoryRules(selectedStock.category);
  const triggerPrice=parseFloat(document.getElementById('orderTriggerPrice').value);
  const qty=parseFloat(document.getElementById('orderQty').value);
  const triggerType=document.getElementById('orderTriggerType').value;
  const dir=document.getElementById('orderDir').value;
  let qtyValid = qty >= rules.minQty;
  if(rules.multiple) qtyValid = qtyValid && qty % rules.step === 0;
  if(!triggerPrice||!qtyValid){ notify(`请填写完整信息（数量最小${rules.minQty}${rules.unit}）`,'error'); return; }
  const result=await apiPost('/api/orders',{symbol:selectedStock.symbol,name:selectedStock.name,type:dir,triggerType,triggerPrice,qty,category:selectedStock.category});
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
    const rules = getCategoryRules(o.category);
    return `<div class="order-item">
      <span class="order-item-info">${o.name} ${o.type==='buy'?'买入':'卖出'} ${o.qty}${rules.unit} 触发:${sign}${o.triggerPrice}</span>
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
  const local=getAllStocks().find(s=>s.symbol===sym);
  if(local){
    const change=local.price-(local.prevClose||local.price);
    const pct=(change/(local.prevClose||local.price)*100)||0;
    const isUp=change>=0;
    const cur=local.currency==='USD'?'$':local.currency==='HKD'?'HK$':'¥';
    const cnyHint = local.currency !== 'CNY' ? ` ≈ ¥${toCNY(local.price, local.currency).toFixed(2)}` : '';
    result.innerHTML=`<div><div style="font-size:1.1rem;font-weight:700;margin-bottom:6px">${local.name} (${local.symbol})</div>
      <div style="font-family:var(--font-mono);font-size:1.3rem;color:${isUp?'var(--green)':'var(--red)'}">${cur}${local.price.toFixed(2)}${cnyHint} ${isUp?'+':''}${change.toFixed(2)} (${isUp?'+':''}${pct.toFixed(2)}%)</div>
      <div style="color:var(--text-secondary);font-size:.85rem;margin-top:6px">${local.sector}${local.unit?' · '+local.unit:''}</div></div>`;
    document.getElementById('quickPrice').value=local.price.toFixed(2);
    return;
  }
  const d = await apiGet('/api/quotes/' + encodeURIComponent(sym));
  if(d && d.quote){
    const q = d.quote;
    const change = q.change || (q.price - (q.prevClose||q.price));
    const pct = q.changePercent || (q.prevClose ? (change/q.prevClose*100) : 0);
    const isUp = change >= 0;
    const cur = q.currency==='USD'?'$':q.currency==='HKD'?'HK$':'¥';
    const cnyHint = q.currency !== 'CNY' ? ` ≈ ¥${toCNY(q.price, q.currency).toFixed(2)}` : '';
    result.innerHTML=`<div><div style="font-size:1.1rem;font-weight:700;margin-bottom:6px">${q.name} (${q.symbol})</div>
      <div style="font-family:var(--font-mono);font-size:1.3rem;color:${isUp?'var(--green)':'var(--red)'}">${cur}${q.price.toFixed(2)}${cnyHint} ${isUp?'+':''}${change.toFixed(2)} (${isUp?'+':''}${pct.toFixed(2)}%)</div>
      <div style="color:var(--text-secondary);font-size:.85rem;margin-top:6px">${q.market||''} ${q.category||''}</div></div>`;
    document.getElementById('quickPrice').value=q.price.toFixed(2);
  } else {
    result.innerHTML='<div class="empty-state"><p>未找到该资产</p></div>';
  }
}
async function quickTrade(type){
  const sym=document.getElementById('quickSymbol').value.trim().toUpperCase();
  const price=parseFloat(document.getElementById('quickPrice').value);
  const qty=parseFloat(document.getElementById('quickQty').value);
  if(!sym||!price||!qty||qty<=0){ notify('请填写完整信息','error'); return; }
  const result=await apiPost(`/api/trade/${type}`,{symbol:sym,qty,price});
  if(result&&result.success){
    notify(type==='buy'?'买入下单成功':'卖出下单成功','success');
    document.getElementById('quickQty').value='';
    await refreshAccount();
    await refreshAccountSummary();
  }
  else notify(result?.error||'下单失败','error');
}

/* ===== PORTFOLIO VIEW（汇率统一CNY口径） ===== */
async function refreshAccountSummary(){
  const d=await apiGet('/api/account/summary');
  if(d&&d.success) accountSummary=d;
}
function renderPortfolioView(){
  const summary=document.getElementById('portfolioSummary');
  const list=document.getElementById('portfolioList');

  if(accountSummary){
    const s=accountSummary;
    summary.innerHTML=`
      <div class="summary-card" data-testid="metric-total-assets" data-role="account-metric" data-metric="total-assets">
        <div class="summary-label">总资产(CNY)</div><div class="summary-value">${formatMoney(s.totalAssets)}</div>
      </div>
      <div class="summary-card" data-testid="metric-cash" data-role="account-metric" data-metric="cash">
        <div class="summary-label">可用资金</div><div class="summary-value" style="color:var(--颜色-买入)">${formatMoney(s.cash)}</div>
      </div>
      <div class="summary-card" data-testid="metric-market-value" data-role="account-metric" data-metric="market-value">
        <div class="summary-label">持仓市值(CNY)</div><div class="summary-value" style="color:var(--颜色-信息)">${formatMoney(s.holdingValue)}</div>
      </div>
      <div class="summary-card" data-testid="metric-unrealized-pnl" data-role="account-metric" data-metric="unrealized-pnl">
        <div class="summary-label">未实现盈亏</div><div class="summary-value" style="color:${s.totalUnrealizedPnL>=0?'var(--颜色-买入)':'var(--颜色-卖出)'}">${s.totalUnrealizedPnL>=0?'+':''}${s.totalUnrealizedPnL.toFixed(2)}</div>
      </div>
      <div class="summary-card" data-testid="metric-today-pnl" data-role="account-metric" data-metric="today-pnl">
        <div class="summary-label">今日收益</div><div class="summary-value" style="color:${s.todayRealizedPnL>=0?'var(--颜色-买入)':'var(--颜色-卖出)'}">${s.todayRealizedPnL>=0?'+':''}${s.todayRealizedPnL.toFixed(2)}</div>
      </div>
      <div class="summary-card" data-testid="metric-holding-count" data-role="account-metric" data-metric="holding-count">
        <div class="summary-label">持仓数量</div><div class="summary-value">${s.holdingCount} 只</div>
      </div>
      ${s.rates ? `<div style="font-size:.75rem;color:var(--text-secondary);padding:4px 8px;grid-column:1/-1">汇率：1 USD = ${s.rates.USD} CNY · 1 HKD = ${s.rates.HKD} CNY · 多币种资产已折算为CNY</div>` : ''}`;

    if(!s.holdings||s.holdings.length===0){
      list.innerHTML='<div class="empty-state" data-role="empty-state"><div class="empty-state__icon">📭</div><div class="empty-state__text">暂无持仓</div></div>'; return;
    }
    list.innerHTML=s.holdings.map(h=>{
      const rules = getCategoryRules(h.category);
      const origCur = h.currency === 'USD' ? '$' : h.currency === 'HKD' ? 'HK$' : '¥';
      return `<div class="holding-card" data-testid="holding-item" data-role="holding-item" data-symbol="${h.symbol}" onclick="jumpToStock('${h.symbol}')"><div class="holding-left">
        <div class="holding-name">${h.name||h.symbol} (${h.symbol})</div>
        <div class="holding-detail">${formatQty(h.qty)}${rules.unit} · 成本 ${origCur}${h.avgCost.toFixed(2)} · 现价 ${origCur}${h.latestPrice.toFixed(2)}</div>
        <div class="holding-detail">市值 ${h.conversionHint || formatMoney(h.marketValueCNY)}</div>
      </div><div class="holding-right">
        <div class="holding-pnl ${h.isUp?'up':'down'}">${h.isUp?'+':''}${h.unrealizedPnL.toFixed(2)}</div>
        <div class="holding-pct ${h.isUp?'up':'down'}">${h.isUp?'+':''}${h.unrealizedPnLRatio.toFixed(2)}%</div>
        <div style="font-size:var(--字号-极小);color:var(--文字-弱);margin-top:2px">${h.isUp?'上涨':'下跌'}</div>
      </div></div>`;
    }).join('');
    return;
  }

  // 兜底
  const keys=Object.keys(accountData.holdings);
  let holdingValue=0;
  keys.forEach(sym=>{
    const h=accountData.holdings[sym];
    const stock=getAllStocks().find(s=>s.symbol===sym);
    const price = stock ? stock.price : h.avgCost;
    const cur = stock ? stock.currency : (h.category==='usstocks'?'USD':h.category==='hkstocks'?'HKD':'CNY');
    holdingValue+=toCNY(h.qty*price, cur);
  });
  const totalAssets=accountData.balance+holdingValue;
  summary.innerHTML=`<div class="summary-card"><div class="summary-label">总资产(CNY)</div><div class="summary-value">${formatMoney(totalAssets)}</div></div>
    <div class="summary-card"><div class="summary-label">可用资金</div><div class="summary-value" style="color:var(--颜色-买入)">${formatMoney(accountData.balance)}</div></div>
    <div class="summary-card"><div class="summary-label">持仓市值(CNY)</div><div class="summary-value" style="color:var(--颜色-信息)">${formatMoney(holdingValue)}</div></div>`;
  if(keys.length===0){ list.innerHTML='<div class="empty-state"><div class="icon">📭</div><p>暂无持仓</p></div>'; return; }
  list.innerHTML=keys.map(sym=>{
    const h=accountData.holdings[sym]; const stock=getAllStocks().find(s=>s.symbol===sym);
    const current=stock?stock.price:h.avgCost;
    const cur=stock?stock.currency:(h.category==='usstocks'?'USD':h.category==='hkstocks'?'HKD':'CNY');
    const currentCNY=toCNY(current,cur); const costCNY=toCNY(h.avgCost,cur);
    const pnl=(currentCNY-costCNY)*h.qty; const pnlPct=((currentCNY-costCNY)/costCNY*100)||0;
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
  const stock=getAllStocks().find(s=>s.symbol===sym);
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
  if(historyFilter!=='all') trades=trades.filter(t=>t.type===historyFilter);
  if(!trades.length){ list.innerHTML='<div class="empty-state" data-role="empty-state"><div class="empty-state__icon">📝</div><div class="empty-state__text">暂无成交记录</div></div>'; return; }
  list.innerHTML=trades.slice(0,100).map(h=>{
    const d=new Date(h.time);
    const timeStr=isNaN(d)?h.time:d.toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
    const rules = getCategoryRules(h.category);
    const unit = h.unit || rules.unit;
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
  if(confirm('确定重置当前模拟账户？所有持仓、记录和条件单将被清空（自选不受影响）。')){
    const r=await apiPost('/api/account/reset');
    if(r&&r.success){ notify(r.message,'info'); await refreshAccount(); await refreshAccountSummary(); if(currentView==='portfolio') renderPortfolioView(); }
  }
}
function notify(msg,type='info'){
  const el=document.getElementById('notification');
  el.textContent=msg; el.className=`notification ${type} show`;
  setTimeout(()=>el.classList.remove('show'),3000);
  const fb=document.getElementById('system-feedback');
  if(fb){
    fb.textContent=msg;
    fb.className=`system-feedback ${type} show`;
    setTimeout(()=>fb.classList.remove('show'),3500);
  }
}

/* ===== TICK ===== */
let tickCount = 0;
async function tick(){
  await refreshMarketStatus();
  await refreshQuotes();
  await refreshAccount();
  tickCount++;
  if(marketStatus.isOpen){
    await apiPost('/api/orders/check');
  }
  // 每6次tick（30秒）刷新汇总和自选
  if(tickCount % 6 === 0){
    await refreshAccountSummary();
    await refreshWatchlist();
    if(currentView==='portfolio') renderPortfolioView();
  }
}

/* ===== ANALYSIS VIEW ===== */
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
    <div class="metric-card"><div class="metric-card-label">总收益</div><div class="metric-card-value ${valClass(总收益)}">${fmt(总收益,'')}</div><div class="metric-card-sub">${p.交易次数||0} 笔交易</div></div>
    <div class="metric-card"><div class="metric-card-label">胜率</div><div class="metric-card-value ${valClass(胜率, true)}">${胜率!==null?(胜率*100).toFixed(1)+'%':'--'}</div><div class="metric-card-sub">${e.状态||'--'}</div></div>
    <div class="metric-card"><div class="metric-card-label">盈亏比</div><div class="metric-card-value ${valClass(盈亏比, true)}">${fmt(盈亏比,'',2)}</div><div class="metric-card-sub">风险: ${e.风险||'--'}</div></div>
    <div class="metric-card"><div class="metric-card-label">最大回撤</div><div class="metric-card-value ${最大回撤!==null?'negative':'neutral'}">${最大回撤!==null?(最大回撤*100).toFixed(1)+'%':'--'}</div><div class="metric-card-sub">从峰值计算</div></div>`;
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
  ctx.scale(dpr, dpr); ctx.clearRect(0, 0, W, H);
  if(!盈亏明细 || 盈亏明细.length === 0){ ctx.fillStyle = '#4a5568'; ctx.font = '14px Space Grotesk'; ctx.textAlign = 'center'; ctx.fillText('暂无数据', W/2, H/2); return; }
  let cumPnl = [0]; 盈亏明细.forEach(t => { cumPnl.push(cumPnl[cumPnl.length-1] + (t.pnl||0)); });
  const pad = {top:10, right:10, bottom:20, left:50};
  const cW = W - pad.left - pad.right; const cH = H - pad.top - pad.bottom;
  const minV = Math.min(...cumPnl); const maxV = Math.max(...cumPnl); const range = maxV - minV || 1;
  const xStep = cW / (cumPnl.length - 1 || 1);
  const zeroY = pad.top + ((maxV - 0) / range) * cH;
  ctx.strokeStyle = '#2a3f5f'; ctx.lineWidth = 0.5; ctx.setLineDash([4,4]);
  ctx.beginPath(); ctx.moveTo(pad.left, zeroY); ctx.lineTo(W - pad.right, zeroY); ctx.stroke(); ctx.setLineDash([]);
  ctx.beginPath(); cumPnl.forEach((v, i) => { const x = pad.left + i * xStep; const y = pad.top + ((maxV - v) / range) * cH; if(i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
  const lastX = pad.left + (cumPnl.length - 1) * xStep;
  ctx.lineTo(lastX, zeroY); ctx.lineTo(pad.left, zeroY); ctx.closePath();
  const isUp = cumPnl[cumPnl.length-1] >= 0;
  ctx.fillStyle = isUp ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)'; ctx.fill();
  ctx.beginPath(); cumPnl.forEach((v, i) => { const x = pad.left + i * xStep; const y = pad.top + ((maxV - v) / range) * cH; if(i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
  ctx.strokeStyle = isUp ? '#10b981' : '#ef4444'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#4a5568'; ctx.font = '10px JetBrains Mono'; ctx.textAlign = 'right';
  for(let i = 0; i <= 4; i++){ const val = maxV - (range / 4) * i; const y = pad.top + (cH / 4) * i; ctx.fillText(val.toFixed(0), pad.left - 6, y + 4); }
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
  ctx.scale(dpr, dpr); ctx.clearRect(0, 0, W, H);
  if(!盈亏明细 || 盈亏明细.length === 0){ ctx.fillStyle = '#4a5568'; ctx.font = '14px Space Grotesk'; ctx.textAlign = 'center'; ctx.fillText('暂无数据', W/2, H/2); return; }
  const pnls = 盈亏明细.map(t => t.pnl || 0);
  const maxPnl = Math.max(...pnls); const minPnl = Math.min(...pnls);
  const pad = {top:10, right:10, bottom:20, left:50};
  const cW = W - pad.left - pad.right; const cH = H - pad.top - pad.bottom;
  const barW = Math.max(4, Math.min(30, cW / pnls.length - 2));
  const gap = (cW - barW * pnls.length) / (pnls.length + 1);
  const zeroY = pad.top + (maxPnl / (maxPnl - minPnl || 1)) * cH;
  ctx.strokeStyle = '#2a3f5f'; ctx.lineWidth = 0.5; ctx.setLineDash([4,4]);
  ctx.beginPath(); ctx.moveTo(pad.left, zeroY); ctx.lineTo(W - pad.right, zeroY); ctx.stroke(); ctx.setLineDash([]);
  pnls.forEach((pnl, i) => {
    const x = pad.left + gap + i * (barW + gap); const isUp = pnl >= 0;
    const barH = Math.abs(pnl) / (maxPnl - minPnl || 1) * cH; const y = isUp ? zeroY - barH : zeroY;
    ctx.fillStyle = isUp ? 'rgba(16,185,129,0.6)' : 'rgba(239,68,68,0.6)';
    ctx.beginPath(); ctx.roundRect(x, y, barW, Math.max(2, barH), 2); ctx.fill();
  });
  ctx.fillStyle = '#4a5568'; ctx.font = '10px JetBrains Mono'; ctx.textAlign = 'right';
  for(let i = 0; i <= 4; i++){ const val = maxPnl - ((maxPnl - minPnl) / 4) * i; const y = pad.top + (cH / 4) * i; ctx.fillText(val.toFixed(0), pad.left - 6, y + 4); }
}

function renderAnalysisTradeList(盈亏明细){
  const el = document.getElementById('analysisTradeList');
  if(!盈亏明细 || 盈亏明细.length === 0){ el.innerHTML = '<div class="empty-state" style="padding:20px"><p>暂无已完成的卖出交易</p></div>'; return; }
  let html = `<div class="atl-row header"><span>方向</span><span>股票</span><span>价格</span><span>数量</span><span>盈亏</span><span>策略</span></div>`;
  盈亏明细.slice(0, 50).forEach(t => {
    const pnl = t.pnl || 0; const isUp = pnl >= 0;
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

/* ===== DASHBOARD STATS ===== */
function renderDashboardStats(){
  const center = document.querySelector('.quotes-center');
  if(!center) return;
  let dashEl = document.getElementById('dashStats');
  if(!dashEl){ dashEl = document.createElement('div'); dashEl.id = 'dashStats'; dashEl.className = 'dashboard-stats'; center.insertBefore(dashEl, center.firstChild); }
  const today = new Date().toISOString().slice(0, 10);
  const todayTrades = (accountData.history || []).filter(t => t.time && t.time.startsWith(today));
  let todayPnl = 0;
  todayTrades.filter(t => t.type === 'sell').forEach(t => { todayPnl += t.total || 0; });
  const holdingCount = Object.keys(accountData.holdings || {}).length;
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
  const cur=selectedStock.currency==='USD'?'$':selectedStock.currency==='HKD'?'HK$':'¥';
  const dirText=isUp?'上涨':'下跌';
  const isFav=watchlist.some(w=>w.symbol===selectedStock.symbol);

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

  // 自选按钮
  const favEl = document.getElementById('csFavBtn');
  if(favEl){
    favEl.textContent = isFav ? '★ 已自选' : '☆ 加自选';
    favEl.className = `fav-panel-btn ${isFav?'active':''}`;
    favEl.onclick = () => toggleFavorite(selectedStock.symbol, selectedStock.name, selectedStock.category, selectedStock.currency);
  }

  // CNY折算提示
  const cnyEl = document.getElementById('csCNYHint');
  if(cnyEl){
    if(selectedStock.currency && selectedStock.currency !== 'CNY'){
      cnyEl.textContent = `≈ ¥${toCNY(selectedStock.price, selectedStock.currency).toFixed(2)}`;
      cnyEl.style.display = 'block';
    } else {
      cnyEl.style.display = 'none';
    }
  }

  updateCurrentSymbolHolding();
}

function updateCurrentSymbolHolding(){
  const el=document.getElementById('csHolding');
  if(!el||!selectedStock) return;
  const h=accountData.holdings[selectedStock.symbol];
  const rules = getCategoryRules(selectedStock.category);
  if(h){
    const pnl=toCNY((selectedStock.price-h.avgCost)*h.qty, selectedStock.currency);
    const isUp=pnl>=0;
    el.style.display='block';
    el.innerHTML=`持有 ${h.qty}${rules.unit} · 成本 ${h.avgCost.toFixed(2)} · 浮盈 ${isUp?'+':''}${pnl.toFixed(2)}（${isUp?'+':''}${((selectedStock.price-h.avgCost)/h.avgCost*100).toFixed(2)}%）`;
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
  await refreshWatchlist();
  await refreshFx();
  resizeChartCanvas();
  setupChartHover();
  if(quotesData.astocks.length) selectStock(quotesData.astocks[0].symbol);
  loadAnalysis().then(() => renderDashboardStats());
  setInterval(tick,5000);
  window.addEventListener('resize',()=>{ resizeChartCanvas(); drawChart(); });
}
init();
