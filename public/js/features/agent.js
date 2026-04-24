/**
 * Leomoney Agent 控制台 v2 — 前端逻辑
 * 配置面板 + 自定义策略 + 全局扫描 + 信号流 + 方案卡 + 操作日志 + 实时反馈
 */

import { apiGet, apiPost, apiPatch } from './api.js';
import { notify } from './account.js';

let _autoRefreshTimer = null;
let _isScanning = false;

// ── 初始化 ──
export async function initAgentView() {
  await refreshAgentStatus();
  await renderStrategyList();
  await renderSignals();
  await renderProposals();
  await renderAgentLog();
  startAutoRefresh();
}

// ── 自动刷新（Agent 启用时每 15 秒刷新信号/方案/日志）──
function startAutoRefresh() {
  if (_autoRefreshTimer) clearInterval(_autoRefreshTimer);
  _autoRefreshTimer = setInterval(async () => {
    try {
      const status = await apiGet('/api/agent/status');
      if (status?.agent?.enabled) {
        await renderSignals();
        await renderProposals();
        await renderAgentLog();
        renderStatusPanel(status);
      }
    } catch (e) { /* 静默 */ }
  }, 15000);
}

// ── 状态获取 ──
async function refreshAgentStatus() {
  try {
    const status = await apiGet('/api/agent/status');
    if (!status) return;
    renderStatusPanel(status);
    // 同步按钮状态
    const toggleBtn = document.getElementById('agentToggleBtn');
    if (toggleBtn) {
      if (status.agent?.enabled) {
        toggleBtn.classList.add('active');
        toggleBtn.textContent = '停止 Agent';
      } else {
        toggleBtn.classList.remove('active');
        toggleBtn.textContent = '启动 Agent';
      }
    }
    // 同步 Level 按钮
    document.querySelectorAll('.level-btn').forEach(b => {
      b.classList.toggle('active', parseInt(b.dataset.level) === status.agent?.level);
    });
  } catch (e) {
    console.error('Agent status failed:', e);
  }
}

// ── 渲染状态面板 ──
function renderStatusPanel(status) {
  const el = document.getElementById('agentStatusPanel');
  if (!el) return;

  const { llmReady, searchConfigured, agent, circuitBreaker, risk } = status;
  const levelNames = { 1: '监控者', 2: '顾问者', 3: '代理者' };
  const breakerNames = { CLOSED: '正常', OPEN: '熔断', HALF_OPEN: '试探' };
  const breakerClass = { CLOSED: '', OPEN: 'open', HALF_OPEN: 'half-open' };
  const todayPnl = Number(risk?.todayPnl || 0);

  el.innerHTML = `
    <div class="agent-status-grid">
      <div class="agent-main-card">
        <div class="agent-level-badge" id="agentLevelBadge">L${agent?.level || 1} ${levelNames[agent?.level || 1]}</div>
        <div class="agent-switch-row">
          <span style="font-size:.85rem;color:var(--text-secondary)">Agent 状态</span>
          <span style="font-size:.85rem;font-weight:600;color:${agent?.enabled ? 'var(--green)' : 'var(--text-muted)'}">${agent?.enabled ? '🟢 运行中' : '⏹️ 已停止'}</span>
        </div>
        <div class="agent-breaker-row">
          <span class="breaker-label" style="font-size:.82rem;color:var(--text-secondary)">熔断器</span>
          <div class="breaker-indicator ${breakerClass[circuitBreaker?.state || 'CLOSED']}" id="breakerIndicator">
            <div class="breaker-dot"></div>
            <span id="breakerState" style="font-size:.82rem;font-weight:600">${breakerNames[circuitBreaker?.state || 'CLOSED']}</span>
          </div>
        </div>
      </div>
      <div class="agent-metric-card">
        <div class="metric-icon">🤖</div>
        <div class="metric-label">LLM 状态</div>
        <div class="metric-value" id="agentLLMStatus" style="color:${llmReady ? 'var(--green)' : 'var(--red)'}">${llmReady ? '已连接' : '未配置'}</div>
      </div>
      <div class="agent-metric-card">
        <div class="metric-icon">📊</div>
        <div class="metric-label">今日交易</div>
        <div class="metric-value" id="agentTodayTrades">${risk?.todayTradeCount || 0}/${risk?.maxTradesPerDay || 10}</div>
      </div>
      <div class="agent-metric-card">
        <div class="metric-icon">💰</div>
        <div class="metric-label">今日盈亏</div>
        <div class="metric-value" id="agentTodayPnl" style="color:${todayPnl >= 0 ? 'var(--green)' : 'var(--red)'}">${todayPnl >= 0 ? '+' : ''}${todayPnl.toFixed(2)}</div>
      </div>
    </div>
  `;
}

// ── 渲染策略列表 ──
async function renderStrategyList() {
  try {
    const data = await apiGet('/api/agent/strategies');
    if (!data?.strategies) return;
    const el = document.getElementById('agentStrategyList');
    if (!el) return;
    const config = await apiGet('/api/agent/config');

    el.innerHTML = data.strategies.map(s => `
      <div class="strategy-card ${s.id === config?.config?.strategyId ? 'active' : ''}" data-strategy-id="${s.id}">
        <div class="strategy-icon">${s.icon || '🎯'}</div>
        <div class="strategy-info">
          <div class="strategy-name">${s.name}</div>
          <div class="strategy-desc">${s.description}</div>
          <div class="strategy-meta">置信度阈值: ${(Number(s.confidenceThreshold || 0.7) * 100).toFixed(0)}% · 风险: ${s.riskLevel || '中'}</div>
        </div>
        <button class="strategy-select-btn" data-strategy-id="${s.id}">${s.id === config?.config?.strategyId ? '✓ 使用中' : '选择'}</button>
      </div>
    `).join('');

    // 绑定选择事件
    el.querySelectorAll('.strategy-select-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const strategyId = btn.dataset.strategyId;
        await apiPatch('/api/agent/config', { strategyId });
        notify(`策略切换为 ${strategyId}`, 'success');
        await renderStrategyList();
        await refreshAgentStatus();
      });
    });
  } catch (e) {
    console.error('Strategy list failed:', e);
  }
}

// ── 自定义策略 ──
export async function saveCustomStrategy() {
  const prompt = document.getElementById('agentCustomPrompt')?.value?.trim();
  if (!prompt) {
    notify('请输入自定义策略 Prompt', 'error');
    return;
  }
  const name = document.getElementById('agentCustomName')?.value?.trim() || '自定义策略';
  notify('正在保存自定义策略...', 'info');
  try {
    const result = await apiPost('/api/agent/strategies/custom', {
      name,
      description: '用户自定义策略',
      systemPrompt: prompt,
      riskLevel: '中',
      confidenceThreshold: 0.7,
    });
    if (result?.success) {
      // 切换到自定义策略
      await apiPatch('/api/agent/config', { strategyId: result.strategy.id });
      notify(`自定义策略 "${name}" 已保存并应用`, 'success');
      await renderStrategyList();
      await refreshAgentStatus();
    } else {
      notify(result?.error || '保存失败', 'error');
    }
  } catch (e) {
    notify('保存失败: ' + e.message, 'error');
  }
}

// ── 渲染信号流 ──
async function renderSignals() {
  try {
    const data = await apiGet('/api/agent/signals?limit=20');
    if (!data?.signals) return;
    const el = document.getElementById('agentSignalList');
    if (!el) return;

    if (data.signals.length === 0) {
      el.innerHTML = '<div class="agent-empty">暂无信号，Agent 启用后将自动扫描<br>也可手动输入代码分析或点击全局扫描</div>';
      return;
    }

    el.innerHTML = data.signals.map(s => {
      const actionColors = { '买入': '#10b981', BUY: '#10b981', '卖出': '#ef4444', SELL: '#ef4444', '观望': '#6b7280', HOLD: '#6b7280' };
      const actionLabel = { BUY: '买入', SELL: '卖出', HOLD: '观望' };
      const displayAction = actionLabel[s.action] || s.action;
      const dotClass = (s.action === 'BUY' || s.action === '买入') ? 'buy' : (s.action === 'SELL' || s.action === '卖出') ? 'sell' : 'hold';
      const time = s.ts ? new Date(s.ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }) : '--:--';
      return `
        <div class="signal-timeline-item">
          <div class="signal-time-dot">
            <div class="signal-dot ${dotClass}"></div>
            <div class="signal-time">${time}</div>
          </div>
          <div class="signal-content-card">
            <div class="signal-header">
              <span class="signal-symbol">${s.symbol}</span>
              <span class="signal-name">${s.name || ''}</span>
              <span class="signal-action-badge ${dotClass}">${displayAction}</span>
              <span class="signal-confidence">${(Number(s.confidence || 0) * 100).toFixed(0)}%</span>
            </div>
            <div class="signal-reason">${s.reason || s.thesis || ''}</div>
            <div class="signal-meta">${s.strategyName || ''} · 风险: ${s.riskLevel || '中'}</div>
            ${displayAction !== '观望' ? `<div style="margin-top:6px"><button class="signal-gen-proposal" data-signal-id="${s.id}">生成方案</button></div>` : ''}
          </div>
        </div>
      `;
    }).join('');

    // 绑定生成方案
    el.querySelectorAll('.signal-gen-proposal').forEach(btn => {
      btn.addEventListener('click', async () => {
        const signalId = btn.dataset.signalId;
        const signal = data.signals.find(s => s.id === signalId);
        if (!signal) return;
        notify('正在生成交易方案...', 'info');
        try {
          const result = await apiPost('/api/agent/signal', { symbol: signal.symbol, strategyId: signal.strategyId });
          if (result?.success) {
            notify('方案已生成', 'success');
            await renderProposals();
          } else {
            notify(result?.error || '生成失败', 'error');
          }
        } catch (e) {
          notify('生成失败', 'error');
        }
      });
    });
  } catch (e) {
    console.error('Signals failed:', e);
  }
}

// ── 渲染方案列表 ──
async function renderProposals() {
  try {
    const data = await apiGet('/api/agent/proposals');
    if (!data?.proposals) return;
    const el = document.getElementById('agentProposalList');
    if (!el) return;

    if (data.proposals.length === 0) {
      el.innerHTML = '<div class="agent-empty">暂无方案，信号触发后自动生成</div>';
      return;
    }

    el.innerHTML = data.proposals.map(p => {
      const statusColors = { pending: '#f59e0b', approved: '#3b82f6', executed: '#10b981', rejected: '#ef4444', failed: '#ef4444' };
      const statusNames = { pending: '待确认', approved: '已批准', executed: '已执行', rejected: '已拒绝', failed: '失败' };
      return `
        <div class="proposal-card" data-proposal-id="${p.id}">
          <div class="proposal-header">
            <span class="proposal-action ${p.action === '买入' || p.action === 'BUY' ? 'buy' : 'sell'}">${p.action === 'BUY' ? '买入' : p.action === 'SELL' ? '卖出' : p.action}</span>
            <span class="proposal-symbol">${p.symbol} ${p.name || ''}</span>
            <span class="proposal-status" style="color:${statusColors[p.status] || '#6b7280'}">${statusNames[p.status] || p.status}</span>
          </div>
          <div class="proposal-body">
            <div class="proposal-detail">价格: ¥${Number(p.price || 0).toFixed(2)} · 数量: ${p.qty} · 金额: ¥${Number(p.totalAmount || 0).toFixed(0)}</div>
            <div class="proposal-detail">置信度: ${(Number(p.confidence || 0) * 100).toFixed(0)}% · 策略: ${p.strategyName || ''}</div>
            ${p.reason || p.thesis ? `<div class="proposal-reason">原因: ${p.reason || p.thesis}</div>` : ''}
            ${p.warnings?.length ? `<div class="proposal-warnings">${p.warnings.map(w => '⚠️ ' + w).join('；')}</div>` : ''}
            ${p.rejectionReason ? `<div class="proposal-rejection">❌ ${p.rejectionReason}</div>` : ''}
            ${p.riskCheck ? `
              <div class="proposal-riskcheck">
                <div class="riskcheck-level" style="color:${p.riskCheck.level === 'PASS' ? '#10b981' : p.riskCheck.level === 'WARN' ? '#f59e0b' : '#ef4444'}">风控: ${p.riskCheck.level}</div>
                ${p.riskCheck.reasons?.length ? `<div class="riskcheck-reasons">${p.riskCheck.reasons.map(r => '· ' + r).join('<br>')}</div>` : ''}
                ${p.riskCheck.machineCode?.length ? `<div class="riskcheck-codes" style="font-size:.7rem;color:var(--text-muted)">[${p.riskCheck.machineCode.join(', ')}]</div>` : ''}
              </div>
            ` : ''}
            ${p.executionResult ? `
              <div class="proposal-execution" style="font-size:.8rem;margin-top:4px;padding:4px 8px;background:var(--bg-input);border-radius:4px">
                ${p.executionResult.success ? `✅ 执行成功` : `❌ 执行失败: ${p.executionResult.error || ''}`}
                ${p.executionResult.orderId ? ` · 订单: ${p.executionResult.orderId}` : ''}
              </div>
            ` : ''}
          </div>
          <div class="proposal-footer">
            <span class="proposal-time">${p.createdAt ? new Date(p.createdAt).toLocaleString('zh-CN', { hour12: false }) : ''}</span>
            <div class="proposal-actions">
              ${p.status === 'pending' ? `
                <button class="proposal-btn approve" data-action="approve" data-id="${p.id}">✓ 批准</button>
                <button class="proposal-btn reject" data-action="reject" data-id="${p.id}">✕ 拒绝</button>
              ` : ''}
              ${p.status === 'approved' ? `
                <button class="proposal-btn execute" data-action="execute" data-id="${p.id}">⚡ 执行</button>
              ` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');

    // 绑定操作
    el.querySelectorAll('.proposal-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const action = btn.dataset.action;
        const id = btn.dataset.id;
        if (action === 'approve') {
          const result = await apiPost(`/api/agent/proposals/${id}/approve`);
          if (result?.success) notify('方案已批准', 'success');
          else notify(result?.error || '批准失败', 'error');
        } else if (action === 'reject') {
          const result = await apiPost(`/api/agent/proposals/${id}/reject`);
          if (result?.success) notify('方案已拒绝', 'info');
        } else if (action === 'execute') {
          notify('正在执行...', 'info');
          const result = await apiPost(`/api/agent/proposals/${id}/execute`);
          if (result?.success) notify('执行成功！', 'success');
          else notify(result?.error || '执行失败', 'error');
        }
        await renderProposals();
        await refreshAgentStatus();
      });
    });
  } catch (e) {
    console.error('Proposals failed:', e);
  }
}

// ── 渲染日志 ──
async function renderAgentLog() {
  try {
    const data = await apiGet('/api/agent/log');
    if (!data?.log) return;
    const el = document.getElementById('agentLogList');
    if (!el) return;

    if (data.log.length === 0) {
      el.innerHTML = '<div class="agent-empty">暂无操作日志</div>';
      return;
    }

    el.innerHTML = data.log.map(l => `
      <div class="log-item">
        <span class="log-type">${l.type}</span>
        <span class="log-detail">${JSON.stringify(l).slice(0, 150)}</span>
        <span class="log-time">${l.ts ? new Date(l.ts).toLocaleTimeString('zh-CN', { hour12: false }) : ''}</span>
      </div>
    `).join('');
  } catch (e) {
    console.error('Agent log failed:', e);
  }
}

// ── 配置操作 ──

export async function toggleAgent(enabled) {
  const result = await apiPatch('/api/agent/config', { enabled });
  if (result) {
    notify(enabled ? 'Agent 已启动 🟢' : 'Agent 已停止 ⏹️', enabled ? 'success' : 'info');
    await refreshAgentStatus();
  }
}

export async function setAgentLevel(level) {
  const result = await apiPatch('/api/agent/config', { level });
  if (result) {
    const names = { 1: '监控者', 2: '顾问者', 3: '代理者' };
    notify(`切换到 Level ${level} ${names[level]}`, 'success');
    await refreshAgentStatus();
  }
}

export async function manualSignal(symbol) {
  if (!symbol) return;
  showScanProgress('正在分析 ' + symbol + '...', 30);
  notify('正在分析 ' + symbol + '，LLM 推理中...', 'info');
  try {
    const result = await apiPost('/api/agent/signal', { symbol });
    showScanProgress('分析完成', 100);
    if (result?.success) {
      const actionLabel = { BUY: '买入', SELL: '卖出', HOLD: '观望' };
      const action = actionLabel[result.signal?.action] || result.signal?.action;
      notify(`🎯 ${symbol}: ${action}（置信度 ${(Number(result.signal?.confidence || 0) * 100).toFixed(0)}%）`, 'success');
      await renderSignals();
      await renderProposals();
    } else {
      notify(result?.error || '分析失败', 'error');
    }
  } catch (e) {
    showScanProgress('分析失败', 0);
    notify('分析失败: ' + e.message, 'error');
  }
  setTimeout(() => hideScanProgress(), 2000);
}

// ── 全局扫描 ──
export async function globalScan() {
  if (_isScanning) {
    notify('正在扫描中，请稍候', 'info');
    return;
  }
  _isScanning = true;

  // 获取持仓和自选标的
  let symbols = [];
  try {
    const account = await apiGet('/api/account');
    const positions = account?.positions || account?.holdings || {};
    symbols = Object.keys(positions);
  } catch (e) { /* 忽略 */ }

  try {
    const watchlist = await apiGet('/api/watchlist');
    (watchlist?.watchlist || []).forEach(w => {
      if (!symbols.includes(w.symbol)) symbols.push(w.symbol);
    });
  } catch (e) { /* 忽略 */ }

  if (symbols.length === 0) {
    notify('没有持仓和自选标的，请先添加', 'error');
    _isScanning = false;
    return;
  }

  const total = symbols.length;
  notify(`🌐 全局扫描 ${total} 个标的...`, 'info');
  showScanProgress(`扫描中 0/${total}`, 0);

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < symbols.length; i++) {
    const sym = symbols[i];
    showScanProgress(`扫描 ${i + 1}/${total}: ${sym}`, Math.round((i + 1) / total * 100));
    try {
      const result = await apiPost('/api/agent/signal', { symbol: sym });
      if (result?.success) successCount++;
      else failCount++;
    } catch (e) {
      failCount++;
    }
    // 避免请求过快
    if (i < symbols.length - 1) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  showScanProgress(`扫描完成 ✅ ${successCount} 成功 / ${failCount} 失败`, 100);
  notify(`🌐 扫描完成: ${successCount} 成功 / ${failCount} 失败`, successCount > 0 ? 'success' : 'error');

  await renderSignals();
  await renderProposals();
  await renderAgentLog();
  _isScanning = false;
  setTimeout(() => hideScanProgress(), 3000);
}

// ── 扫描进度 UI ──
function showScanProgress(text, pct) {
  const wrap = document.getElementById('agentScanProgress');
  const fill = document.getElementById('agentScanProgressFill');
  const txt = document.getElementById('agentScanProgressText');
  if (!wrap || !fill || !txt) return;
  wrap.style.display = 'block';
  fill.style.width = Math.min(pct, 100) + '%';
  txt.textContent = text;
}

function hideScanProgress() {
  const wrap = document.getElementById('agentScanProgress');
  if (wrap) wrap.style.display = 'none';
}

export async function resetCircuitBreaker() {
  const result = await apiPost('/api/agent/circuit-breaker/reset');
  if (result?.success) {
    notify('熔断器已重置', 'success');
    await refreshAgentStatus();
  }
}

export async function refreshAgent() {
  await initAgentView();
}
