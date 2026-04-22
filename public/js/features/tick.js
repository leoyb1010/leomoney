/**
 * Leomoney 定时刷新模块
 */
import { store } from './store.js';
import { refreshMarketStatus, refreshQuotes, updateStatusUI } from './market.js';
import { refreshAccount, refreshAccountSummary, refreshWatchlist } from './account.js';
import { apiPost } from './api.js';
import { renderStockList } from './stockList.js';
import { updateSelectedStockPrice } from './trade.js';
import { renderPortfolioView } from './portfolio.js';

let tickCount = 0;
let tickInterval = null;

export function startTick() {
  if (tickInterval) clearInterval(tickInterval);
  tickInterval = setInterval(tick, 5000);
}

export function stopTick() {
  if (tickInterval) { clearInterval(tickInterval); tickInterval = null; }
}

async function tick() {
  await refreshMarketStatus();
  const quotesOk = await refreshQuotes();
  await refreshAccount();
  tickCount++;

  if (quotesOk) {
    renderStockList();
    updateSelectedStockPrice();
    updateStatusUI();
  }

  if (store.marketStatus.isOpen) {
    await apiPost('/api/orders/check');
  }

  // 每6次tick（30秒）刷新汇总和自选
  if (tickCount % 6 === 0) {
    await refreshAccountSummary();
    await refreshWatchlist();
    if (store.currentView === 'portfolio') renderPortfolioView();
  }
}
