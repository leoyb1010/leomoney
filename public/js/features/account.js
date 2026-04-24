/**
 * Leomoney 账户管理模块
 */
import { store } from './store.js';
import { apiGet, apiPost, apiDelete } from './api.js';
import { formatMoney } from './format.js';
import { renderOrderList } from './trade.js';

export async function refreshAccount() {
  const d = await apiGet('/api/account');
  if (d && d.success) {
    store.accountData = d;
    updateBalance();
    renderOrderList();
  }
  await refreshAccounts();
}

export async function refreshAccounts() {
  const d = await apiGet('/api/accounts');
  if (!d || !d.success) return;
  store.accounts = d.accounts || [];
  store.currentAccountId = d.currentAccountId;
  const cur = store.accounts.find(a => a.accountId === store.currentAccountId);
  if (cur) {
    store.currentAccountName = cur.accountName;
    const nameEl = document.getElementById('accountSwitcherName');
    const dotEl = document.getElementById('accountDot');
    if (nameEl) nameEl.textContent = cur.accountName;
    if (dotEl) dotEl.style.background = cur.color || '#3b82f6';
  }
  renderAccountList();
}

export function renderAccountList() {
  const el = document.getElementById('accountList');
  if (!el) return;
  if (store.accounts.length === 0) {
    el.innerHTML = '<div style="padding:12px 14px;color:var(--text-secondary);font-size:.82rem">暂无账户</div>';
    return;
  }
  el.innerHTML = store.accounts.map(a => `
    <div class="account-item ${a.accountId === store.currentAccountId ? 'active' : ''}" data-account-id="${a.accountId}">
      <span class="account-dot" style="background:${a.color || '#3b82f6'}"></span>
      <div class="account-item-info">
        <div class="account-item-name">${a.accountName}</div>
        <div class="account-item-meta">资金 ${formatMoney(a.cashAvailable ?? a.balance ?? 0)}</div>
      </div>
      ${a.accountId !== store.currentAccountId ? `
        <div class="account-item-actions">
          ${store.accounts.length > 1 ? `<button class="account-item-action-btn danger" data-delete-id="${a.accountId}">删除</button>` : ''}
        </div>` : ''}
    </div>
  `).join('');

  // 绑定事件（替代内联 onclick）
  el.querySelectorAll('.account-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.account-item-actions')) return;
      const id = item.dataset.accountId;
      if (id) switchAccount(id);
    });
  });
  el.querySelectorAll('[data-delete-id]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      showDeleteAccountModal(btn.dataset.deleteId);
    });
  });
}

export async function switchAccount(id) {
  if (id === store.currentAccountId) { closeAccountDropdown(); return; }
  const r = await apiPost('/api/accounts/' + id + '/switch');
  if (r && r.success) {
    store.currentAccountId = id;
    closeAccountDropdown();
    await refreshAccounts();
    await refreshAccount();
    await refreshAccountSummary();
    await refreshWatchlist();
    // 通知其他模块刷新视图
    if (store.currentView === 'dashboard') {
      const { renderDashboard } = await import('./dashboard.js');
      renderDashboard();
    }
    if (store.currentView === 'portfolio') {
      const { renderPortfolioView } = await import('./portfolio.js');
      renderPortfolioView();
    }
    if (store.currentView === 'orders') {
      const { renderOrders } = await import('./dashboard.js');
      renderOrders();
    }
    if (store.currentView === 'history') {
      const { renderHistoryView } = await import('./history.js');
      renderHistoryView();
    }
    notify('已切换到 ' + (store.accounts.find(a => a.accountId === id)?.accountName || ''), 'info');
  } else {
    notify('切换失败: ' + (r.error || '未知错误'), 'error');
  }
}

export function toggleAccountDropdown() {
  const el = document.getElementById('accountDropdown');
  if (el) el.classList.toggle('open');
}
export function closeAccountDropdown() {
  const el = document.getElementById('accountDropdown');
  if (el) el.classList.remove('open');
}

// 新建账户
export function showCreateAccountModal() {
  closeAccountDropdown();
  document.getElementById('newAccountName').value = '';
  document.getElementById('newAccountBalance').value = '1000000';
  document.querySelectorAll('.color-option').forEach(o => o.classList.remove('selected'));
  const first = document.querySelector('.color-option');
  if (first) first.classList.add('selected');
  store.selectedAccountColor = '#3b82f6';
  document.getElementById('createAccountModal').style.display = 'flex';
  document.getElementById('newAccountName').focus();
}
export function closeCreateAccountModal() {
  document.getElementById('createAccountModal').style.display = 'none';
}
export async function confirmCreateAccount() {
  const name = document.getElementById('newAccountName').value.trim();
  const balance = parseFloat(document.getElementById('newAccountBalance').value) || 1000000;
  if (!name) { notify('请输入账户名称', 'error'); return; }
  const r = await apiPost('/api/accounts', { accountName: name, balance, color: store.selectedAccountColor });
  if (r && r.success) {
    closeCreateAccountModal();
    await refreshAccounts();
    notify('账户 "' + name + '" 创建成功', 'success');
  } else {
    notify('创建失败: ' + (r.error || '未知错误'), 'error');
  }
}

// 删除账户
export function showDeleteAccountModal(id) {
  const acc = store.accounts.find(a => a.accountId === id);
  if (!acc) return;
  if (store.accounts.length <= 1) { notify('至少保留一个账户', 'error'); return; }
  store.pendingDeleteAccountId = id;
  document.getElementById('deleteAccountName').textContent = acc.accountName;
  document.getElementById('deleteAccountModal').style.display = 'flex';
}
export function closeDeleteAccountModal() {
  document.getElementById('deleteAccountModal').style.display = 'none';
  store.pendingDeleteAccountId = null;
}
export async function confirmDeleteAccount() {
  if (!store.pendingDeleteAccountId) return;
  const id = store.pendingDeleteAccountId;
  const r = await apiDelete('/api/accounts/' + id);
  if (r && r.success) {
    closeDeleteAccountModal();
    await refreshAccounts();
    if (id === store.currentAccountId && store.accounts.length > 0) {
      await switchAccount(store.accounts[0].accountId);
    }
    notify('账户已删除', 'info');
  } else {
    notify('删除失败: ' + (r.error || '未知错误'), 'error');
  }
}

export async function refreshAccountSummary() {
  const d = await apiGet('/api/account/summary');
  if (d && d.success) store.accountSummary = d;
}

export async function refreshWatchlist() {
  const d = await apiGet('/api/watchlist');
  if (d && d.success) {
    store.watchlist = d.watchlist || [];
    store.watchlistData = d.watchlist || [];
  }
}

export async function refreshFx() {
  const d = await apiGet('/api/fx');
  if (d && d.success) store.fxRates = d.rates;
}

export function updateBalance() {
  const el = document.getElementById('headerBalance');
  if (!el) return;
  const cash = store.accountData.cash;
  if (cash && typeof cash === 'object') {
    el.textContent = `可用 ${formatMoney(cash.available)} / 冻结 ${formatMoney(cash.frozen)} / 总 ${formatMoney(cash.total)}`;
  } else {
    // 兼容旧结构
    el.textContent = formatMoney(store.accountData.balance);
  }
}

export async function resetAccount() {
  const cur = store.accounts.find(a => a.accountId === store.currentAccountId);
  const curName = cur ? cur.accountName : '当前';
  if (confirm(`确定重置【${curName}】？所有持仓、成交记录和条件单将被清空（自选不受影响）。`)) {
    const r = await apiPost('/api/account/reset');
    if (r && r.success) {
      notify(r.message, 'info');
      await refreshAccount();
      await refreshAccountSummary();
      if (store.currentView === 'portfolio') {
        const { renderPortfolioView } = await import('./portfolio.js');
        renderPortfolioView();
      }
    }
  }
}

// 通知系统
export function notify(msg, type = 'info') {
  const el = document.getElementById('notification');
  if (el) {
    el.textContent = msg;
    el.className = `notification ${type} show`;
    setTimeout(() => el.classList.remove('show'), 3000);
  }
  const fb = document.getElementById('system-feedback');
  if (fb) {
    fb.textContent = msg;
    fb.className = `system-feedback ${type} show`;
    setTimeout(() => fb.classList.remove('show'), 3500);
  }
}
