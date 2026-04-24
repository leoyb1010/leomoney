/**
 * Leomoney Agent 控制台 — 前端逻辑
 * 配置面板 + 信号流 + 方案卡 + 操作日志
 */

import { apiGet, apiPost, apiPatch } from './api.js';
import { notify } from './account.js';

// ── 初始化 ──
export async function initAgentView() {
  await refreshAgentStatus();
  await renderStrategyList();
  await renderSignals();
  await renderProposals();
  await renderAgentLog();
}

// ── 状态获取 ──
async function refreshAgentStatus() {
  try {
    const status = await apiGet('/api/agent/status');
    if (!status) return;
    renderStatusPanel(status);
  } catch (e) {
    console.error('Agent status failed:', e);
  }
}

// ── 渲染状态面板 ──
function renderStatusPanel(status) {
  const el = document.getElementById('agentStatusPanel');
  if (!el) return;

  const { llmReady, searchConfigured, agent, circuitBreaker, risk } = status;
  const levelColors = { 1: '#3b82f6', 2: '#f59e0b', 3: '#ef4444' };
  const levelNames = { 1: '监控者', 2: '顾问者', 3: '代理者' };
  const breakerColors = { CLOSED: '#10b981', OPEN: '#ef4444', HALF_OPEN: '#f59e0b' };
  const breakerNames = { CLOSED: '正常', OPEN: '熔断', HALF_OPEN: '试探' };

  el.innerHTML = `
    <div class="agent-status-grid">
      <div class="agent-status-card">
        <div class="agent-status-label">LLM</div>
        <div class="agent-status-value" style="color:${llmReady ? '#10b981' : '#ef4444'}">${llmReady ? '✅ 已连接' : '❌ 未配置'}</div>
      </div>
      <div class="agent-status-card">
        <div class="agent-status-label">搜索引擎</div>
        <div class="agent-status-value" style="color:${searchConfigured ? '#10b981' : '#f59e0b'}">${searchConfigured ? '✅ 已配置' : '⚠️ 未配置'}</div>
      </div>
      <div class="agent-status-card">
        <div class="agent-status-label">运行等级</div>
        <div class="agent-status-value" style="color:${levelColors[agent?.level || 1]}">L${agent?.level || 1} ${levelNames[agent?.level || 1]}</div>
      </div>
      <div class="agent-status-card">
        <div class="agent-status-label">熔断器</div>
        <div class="agent-status-value" style="color:${breakerColors[circuitBreaker?.state || 'CLOSED']}">${breakerNames[circuitBreaker?.state || 'CLOSED']}</div>
      </div>
      <div class="agent-status-card">
        <div class="agent-status-label">今日交易</div>
        <div class="agent-status-value">${risk?.todayTradeCount || 0} / ${risk?.maxTradesPerDay || 10}</div>
      </div>
      <div class="agent-status-card">
        <div class="agent-status-label">Agent 开关</div>
        <div class="agent-status-value" style="color:${agent?.enabled ? '#10b981' : '#6b7280'}">${agent?.enabled ? '🟢 运行中' : '⏹️ 已停止'}</div>
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
      <div class="strategy-card ${s.id === config?.strategyId ? 'active' : ''}" data-strategy-id="${s.id}">
        <div class="strategy-icon">${s.icon}</div>
        <div class="strategy-info">
          <div class="strategy-name">${s.name}</div>
          <div class="strategy-desc">${s.description}</div>
          <div class="strategy-meta">置信度阈值: ${(s.confidenceThreshold * 100).toFixed(0)}% · 风险: ${s.riskLevel}</div>
        </div>
        <button class="strategy-select-btn" data-strategy-id="${s.id}">${s.id === config?.strategyId ? '✓ 使用中' : '选择'}</button>
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

// ── 渲染信号流 ──
async function renderSignals() {
  try {
    const data = await apiGet('/api/agent/signals?limit=20');
    if (!data?.signals) return;
    const el = document.getElementById('agentSignalList');
    if (!el) return;

    if (data.signals.length === 0) {
      el.innerHTML = '<div class="agent-empty">暂无信号，Agent 启用后将自动扫描</div>';
      return;
    }

    el.innerHTML = data.signals.map(s => {
      const actionColors = { '买入': '#10b981', '卖出': '#ef4444', '观望': '#6b7280' };
      const actionBg = { '买入': 'var(--green-bg)', '卖出': 'var(--red-bg)', '观望': 'var(--bg-input)' };
      return `
        <div class="signal-card">
          <div class="signal-header">
            <span class="signal-symbol">${s.symbol}</span>
            <span class="signal-name">${s.name}</span>
            <span class="signal-action" style="color:${actionColors[s.action]};background:${actionBg[s.action]}">${s.action}</span>
            <span class="signal-strategy">${s.strategyName}</span>
          </div>
          <div class="signal-body">
            <div class="signal-price">¥${s.price?.toFixed(2)}</div>
            <div class="signal-confidence">置信度: ${(s.confidence * 100).toFixed(0)}%</div>
            <div class="signal-risk">风险: ${s.riskLevel}</div>
          </div>
          <div class="signal-reason">${s.reason}</div>
          <div class="signal-footer">
            <span class="signal-time">${new Date(s.ts).toLocaleString('zh-CN', { hour12: false })}</span>
            ${s.action !== '观望' ? `<button class="signal-gen-proposal" data-signal-id="${s.id}">生成方案</button>` : ''}
          </div>
        </div>
      `;
    }).join('');

    // 绑定生成方案
    el.querySelectorAll('.signal-gen-proposal').forEach(btn => {
      btn.addEventListener('click', async () => {
        // 找到对应信号
        const signalId = btn.dataset.signalId;
        const signal = data.signals.find(s => s.id === signalId);
        if (!signal) return;
        // 重新调信号API生成方案
        notify('正在生成交易方案...', 'info');
        await refreshAgentStatus();
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
            <span class="proposal-action ${p.action === '买入' ? 'buy' : 'sell'}">${p.action}</span>
            <span class="proposal-symbol">${p.symbol} ${p.name}</span>
            <span class="proposal-status" style="color:${statusColors[p.status]}">${statusNames[p.status]}</span>
          </div>
          <div class="proposal-body">
            <div class="proposal-detail">价格: ¥${p.price?.toFixed(2)} · 数量: ${p.qty} · 金额: ¥${(p.totalAmount || 0).toFixed(0)}</div>
            <div class="proposal-detail">置信度: ${(p.confidence * 100).toFixed(0)}% · 策略: ${p.strategyName}</div>
            ${p.reason ? `<div class="proposal-reason">原因: ${p.reason}</div>` : ''}
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
            <span class="proposal-time">${new Date(p.createdAt).toLocaleString('zh-CN', { hour12: false })}</span>
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
        <span class="log-detail">${JSON.stringify(l).slice(0, 120)}</span>
        <span class="log-time">${new Date(l.ts).toLocaleTimeString('zh-CN', { hour12: false })}</span>
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
    notify(enabled ? 'Agent 已启动' : 'Agent 已停止', enabled ? 'success' : 'info');
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
  notify('正在分析...', 'info');
  const result = await apiPost('/api/agent/signal', { symbol });
  if (result?.success) {
    notify(`信号: ${result.signal.action} ${result.signal.symbol} (置信度 ${(result.signal.confidence * 100).toFixed(0)}%)`, 'success');
    await renderSignals();
    await renderProposals();
  } else {
    notify(result?.error || '分析失败', 'error');
  }
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
