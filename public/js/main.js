/**
 * Leomoney Frontend v1.5.0 — 模块化主入口
 * 替代 app.js 成为真正的前端架构核心
 */

import { store } from './features/store.js';
import { refreshMarketStatus } from './features/market.js';
import { refreshQuotes } from './features/market.js';
import { refreshAccount, refreshAccountSummary, refreshWatchlist, refreshFx, refreshAccounts } from './features/account.js';
import { renderStockList } from './features/stockList.js';
import { renderIndices } from './features/indices.js';
import { selectStock } from './features/trade.js';
import { resizeChartCanvas, setupChartHover, drawChart } from './features/chart.js';
import { loadAnalysis } from './features/analysis.js';
import { renderDashboardStats, renderDashboard } from './features/dashboard.js';
import { startTick } from './features/tick.js';
import { switchView, setMarketCategory, setListMode } from './features/views.js';
import { notify } from './features/account.js';

// 把 notify 挂到全局，供所有模块使用
window.notify = notify;

// 绑定全局事件（替代 index.html 内联 onclick）
function bindEvents() {
  // Sidebar 导航
  document.querySelectorAll('.sidebar-item').forEach(item => {
    item.addEventListener('click', () => {
      const view = item.dataset.view;
      if (!view) return;
      switchView(view);
      // 视图懒加载
      if (view === 'dashboard') {
        import('./features/dashboard.js').then(m => m.renderDashboard());
      }
      if (view === 'portfolio') {
        import('./features/portfolio.js').then(m => m.renderPortfolioView());
      }
      if (view === 'orders') {
        import('./features/dashboard.js').then(m => m.renderOrders());
      }
      if (view === 'history') {
        import('./features/history.js').then(m => m.renderHistoryView());
      }
      if (view === 'analysis') {
        import('./features/analysis.js').then(m => m.loadAnalysis());
      }
      if (view === 'agent') {
        import('./features/agent.js').then(m => m.initAgentView());
      }
      if (view === 'trade') {
        import('./features/quickTrade.js').then(m => m.initQuickTrade && m.initQuickTrade());
      }
      if (view === 'quotes' && store.selectedStock) {
        requestAnimationFrame(() => { resizeChartCanvas(); drawChart(); });
      }
    });
  });

  // Dashboard 快速买入
  const dashQuickBuy = document.getElementById('dashboardQuickBuyBtn');
  if (dashQuickBuy) {
    dashQuickBuy.addEventListener('click', () => {
      switchView('trade');
      import('./features/quickTrade.js').then(m => m.initQuickTrade && m.initQuickTrade());
    });
  }

  // Dashboard 市场分类切换
  document.querySelectorAll('.cat-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.cat-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      import('./features/dashboard.js').then(m => m.renderDashboardMarketList(chip.dataset.cat));
    });
  });

  // Dashboard 关注标的点击
  document.getElementById('dashboardWatchlist')?.addEventListener('click', (e) => {
    const item = e.target.closest('.dash-stock-item');
    if (item) {
      switchView('quotes');
      selectStock(item.dataset.symbol);
    }
  });

  // 市场分类 tab
  document.querySelectorAll('.market-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const cat = tab.dataset.cat;
      if (cat) { setMarketCategory(cat); renderStockList(); }
    });
  });

  // 列表模式切换
  document.querySelectorAll('.list-mode-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const mode = tab.dataset.mode;
      if (mode) { setListMode(mode); renderStockList(); }
    });
  });

  // 搜索框
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      import('./features/stockList.js').then(m => m.filterStocks(e.target.value));
    });
  }

  // 数量快捷按钮
  document.querySelectorAll('.quantity-presets .preset-btn[data-qty]').forEach(btn => {
    btn.addEventListener('click', () => {
      const qty = parseFloat(btn.dataset.qty || '0');
      if (!isNaN(qty)) {
        import('./features/trade.js').then(m => m.setQty(qty));
      }
    });
  });

  // 交易类型切换
  document.querySelectorAll('.trade-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      import('./features/trade.js').then(m => m.setTradeType(tab.dataset.type || tab.classList.contains('buy') ? 'buy' : 'sell'));
    });
  });

  // 数量输入变化
  const tradeQty = document.getElementById('tradeQty');
  if (tradeQty) {
    tradeQty.addEventListener('input', () => {
      import('./features/trade.js').then(m => m.calcTotal());
    });
  }

  // 价格输入变化
  const tradePrice = document.getElementById('tradePrice');
  if (tradePrice) {
    tradePrice.addEventListener('input', () => {
      import('./features/trade.js').then(m => m.calcTotal());
    });
  }

  // 全仓按钮
  const qtyMaxBtn = document.getElementById('qtyMaxBtn');
  if (qtyMaxBtn) {
    qtyMaxBtn.addEventListener('click', () => {
      import('./features/trade.js').then(m => m.setQtyMax());
    });
  }

  // 提交订单
  const submitBtn = document.getElementById('submitBtn');
  if (submitBtn) {
    submitBtn.addEventListener('click', () => {
      import('./features/trade.js').then(m => m.submitOrder());
    });
  }

  // 条件单提交
  const submitOrderBtn = document.getElementById('submitOrderBtn');
  if (submitOrderBtn) {
    submitOrderBtn.addEventListener('click', () => {
      import('./features/trade.js').then(m => m.submitOrderCondition());
    });
  }

  // 快捷交易
  const quickLookupBtn = document.getElementById('quickLookupBtn');
  if (quickLookupBtn) {
    quickLookupBtn.addEventListener('click', () => {
      import('./features/quickTrade.js').then(m => m.quickLookup());
    });
  }
  const quickSymbolInput = document.getElementById('quickSymbol');
  if (quickSymbolInput) {
    quickSymbolInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        import('./features/quickTrade.js').then(m => m.quickLookup());
      }
    });
  }
  const quickBuyBtn = document.getElementById('quickBuyBtn');
  if (quickBuyBtn) {
    quickBuyBtn.addEventListener('click', () => {
      import('./features/quickTrade.js').then(m => m.quickTrade('buy'));
    });
  }
  const quickSellBtn = document.getElementById('quickSellBtn');
  if (quickSellBtn) {
    quickSellBtn.addEventListener('click', () => {
      import('./features/quickTrade.js').then(m => m.quickTrade('sell'));
    });
  }

  // 账户切换器
  const accountSwitcherBtn = document.getElementById('accountSwitcherBtn');
  if (accountSwitcherBtn) {
    accountSwitcherBtn.addEventListener('click', () => {
      import('./features/account.js').then(m => m.toggleAccountDropdown());
    });
  }

  // 新建账户
  const createAccountAction = document.getElementById('createAccountAction');
  if (createAccountAction) {
    createAccountAction.addEventListener('click', () => {
      import('./features/account.js').then(m => m.showCreateAccountModal());
    });
  }

  // 创建确认
  const confirmCreateBtn = document.querySelector('#createAccountModal .btn-primary');
  if (confirmCreateBtn) {
    confirmCreateBtn.addEventListener('click', () => {
      import('./features/account.js').then(m => m.confirmCreateAccount());
    });
  }

  // 删除确认
  const confirmDeleteBtn = document.querySelector('#deleteAccountModal .btn-danger');
  if (confirmDeleteBtn) {
    confirmDeleteBtn.addEventListener('click', () => {
      import('./features/account.js').then(m => m.confirmDeleteAccount());
    });
  }

  // 关闭弹窗
  document.querySelectorAll('.modal-close, .modal-backdrop').forEach(el => {
    el.addEventListener('click', (e) => {
      const modal = e.target.closest('.modal');
      if (modal) modal.style.display = 'none';
    });
  });

  // 快速创建条件单（订单视图）
  const quickCreateOrderBtn = document.getElementById('quickCreateOrderBtn');
  if (quickCreateOrderBtn) {
    quickCreateOrderBtn.addEventListener('click', () => {
      const form = document.getElementById('quickOrderForm');
      if (form) form.style.display = form.style.display === 'none' ? 'block' : 'none';
    });
  }
  const qoSubmitBtn = document.getElementById('qoSubmitBtn');
  if (qoSubmitBtn) {
    qoSubmitBtn.addEventListener('click', async () => {
      const { apiPost } = await import('./features/api.js');
      const { notify } = await import('./features/account.js');
      const symbol = document.getElementById('qoSymbol')?.value?.trim().toUpperCase();
      const dir = document.getElementById('qoDir')?.value;
      const triggerType = document.getElementById('qoTriggerType')?.value;
      const triggerPrice = parseFloat(document.getElementById('qoTriggerPrice')?.value);
      const qty = parseFloat(document.getElementById('qoQty')?.value);
      if (!symbol || !triggerPrice || !qty) { notify('请填写完整信息', 'error'); return; }
      const result = await apiPost('/api/orders', { symbol, type: dir, triggerType, triggerPrice, qty });
      if (result?.success) {
        notify('条件单创建成功', 'success');
        document.getElementById('qoSymbol').value = '';
        document.getElementById('qoTriggerPrice').value = '';
        document.getElementById('qoQty').value = '';
        const { refreshAccount } = await import('./features/account.js');
        await refreshAccount();
        const { renderOrders } = await import('./features/dashboard.js');
        renderOrders();
      } else {
        notify(result?.error || '创建失败', 'error');
      }
    });
  }

  // 快捷交易数量预设按钮
  document.querySelectorAll('[data-quick-qty]').forEach(btn => {
    btn.addEventListener('click', () => {
      const qtyEl = document.getElementById('quickQty');
      if (qtyEl) qtyEl.value = btn.dataset.quickQty;
    });
  });
  const quickQtyMaxBtn = document.getElementById('quickQtyMaxBtn');
  if (quickQtyMaxBtn) {
    quickQtyMaxBtn.addEventListener('click', async () => {
      const { apiGet } = await import('./features/api.js');
      const price = parseFloat(document.getElementById('quickPrice')?.value);
      if (!price) return;
      const acc = await apiGet('/api/account');
      const available = Number(acc?.cash?.available ?? acc?.balance ?? 0);
      if (available > 0) {
        const qtyEl = document.getElementById('quickQty');
        if (qtyEl) qtyEl.value = Math.floor(available / price / 100) * 100;
      }
    });
  }

  // 重置账户
  const resetBtn = document.querySelector('.reset-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      import('./features/account.js').then(m => m.resetAccount());
    });
  }

  // 成交筛选
  document.querySelectorAll('.history-filter .preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const filter = btn.dataset.filter;
      if (filter) {
        import('./features/history.js').then(m => m.filterHistory(filter));
      }
    });
  });

  // 订单筛选
  document.querySelectorAll('.orders-filter .preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const filter = btn.dataset.ofilter;
      if (filter) {
        import('./features/dashboard.js').then(m => m.filterOrders(filter));
      }
    });
  });

  // Agent 等级切换
  document.querySelectorAll('.level-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const level = parseInt(btn.dataset.level);
      if (level >= 3) {
        if (!confirm('⚠️ Level 3 代理者模式将自动执行交易！确认切换？')) return;
      }
      document.querySelectorAll('.level-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const { setAgentLevel } = await import('./features/agent.js');
      await setAgentLevel(level);
    });
  });

  // Agent 开关
  const agentToggleBtn = document.getElementById('agentToggleBtn');
  if (agentToggleBtn) {
    agentToggleBtn.addEventListener('click', async () => {
      const isActive = agentToggleBtn.classList.toggle('active');
      agentToggleBtn.textContent = isActive ? '停止 Agent' : '启动 Agent';
      const { toggleAgent } = await import('./features/agent.js');
      await toggleAgent(isActive);
    });
  }

  // Agent 刷新
  const agentRefreshBtn = document.getElementById('agentRefreshBtn');
  if (agentRefreshBtn) {
    agentRefreshBtn.addEventListener('click', async () => {
      const { refreshAgent } = await import('./features/agent.js');
      await refreshAgent();
    });
  }

  // Agent 手动分析
  const agentManualScanBtn = document.getElementById('agentManualScanBtn');
  if (agentManualScanBtn) {
    agentManualScanBtn.addEventListener('click', async () => {
      const symbol = document.getElementById('agentManualSymbol')?.value?.trim();
      if (!symbol) return;
      const { manualSignal } = await import('./features/agent.js');
      await manualSignal(symbol.toUpperCase());
    });
  }
  const agentManualSymbolInput = document.getElementById('agentManualSymbol');
  if (agentManualSymbolInput) {
    agentManualSymbolInput.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const symbol = agentManualSymbolInput.value?.trim();
        if (!symbol) return;
        const { manualSignal } = await import('./features/agent.js');
        await manualSignal(symbol.toUpperCase());
      }
    });
  }

  // Agent 全局扫描
  const agentGlobalScanBtn = document.getElementById('agentGlobalScanBtn');
  if (agentGlobalScanBtn) {
    agentGlobalScanBtn.addEventListener('click', async () => {
      const { globalScan } = await import('./features/agent.js');
      await globalScan();
    });
  }

  // Agent 自定义策略保存
  const agentSaveCustomBtn = document.getElementById('agentSaveCustomBtn');
  if (agentSaveCustomBtn) {
    agentSaveCustomBtn.addEventListener('click', async () => {
      const { saveCustomStrategy } = await import('./features/agent.js');
      await saveCustomStrategy();
    });
  }

  // Agent 熔断器重置
  const agentResetBreakerBtn = document.getElementById('agentResetBreakerBtn');
  if (agentResetBreakerBtn) {
    agentResetBreakerBtn.addEventListener('click', async () => {
      if (!confirm('确认重置熔断器？这将恢复所有自动交易能力。')) return;
      const { resetCircuitBreaker } = await import('./features/agent.js');
      await resetCircuitBreaker();
    });
  }

  // Agent 今日报告
  const agentDailyReportBtn = document.getElementById('agentDailyReportBtn');
  if (agentDailyReportBtn) {
    agentDailyReportBtn.addEventListener('click', () => {
      window.open('/api/agent/daily-report', '_blank');
    });
  }

  // K线周期
  document.querySelectorAll('.tf-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tf = parseInt(btn.dataset.tf);
      if (!isNaN(tf)) {
        import('./features/chart.js').then(m => m.setTimeframe(tf));
      }
    });
  });

  // 窗口 resize
  window.addEventListener('resize', () => {
    resizeChartCanvas();
    drawChart();
  });
}

// 全局错误捕获（便于诊断）
window.addEventListener('error', (e) => {
  console.error('Global error:', e.error);
  const fb = document.getElementById('system-feedback');
  if (fb) fb.textContent = '系统错误: ' + (e.error?.message || e.message);
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('Unhandled rejection:', e.reason);
});

// 初始化
async function init() {
  try {
    await refreshMarketStatus();
    await refreshQuotes();
    await refreshAccount();
    await refreshAccountSummary();
    await refreshWatchlist();
    await refreshFx();
    await refreshAccounts();

    // 默认显示 Dashboard
    switchView('dashboard');
    await renderDashboard();
    renderStockList();
    renderIndices();
    resizeChartCanvas();
    setupChartHover();

    if (store.quotesData.astocks.length) {
      selectStock(store.quotesData.astocks[0].symbol);
    }

    loadAnalysis().then(() => renderDashboardStats());
    bindEvents();
    startTick();
  } catch (err) {
    console.error('Init failed:', err);
    const fb = document.getElementById('system-feedback');
    if (fb) fb.textContent = '初始化失败: ' + err.message;
  }
}

init();
