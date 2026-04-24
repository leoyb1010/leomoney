/**
 * Leomoney 后台调度器 v2 — 三级调度 + 信号扫描 + 熔断监控
 * Level 1: 仅信号扫描
 * Level 2: 信号 + 方案生成（需人工确认）
 * Level 3: 信号 + 方案 + 自动执行
 *
 * v1.9.0: 多账户隔离 + 监听器去重
 */

const { checkPendingOrders } = require('../src/server/services/orderService');
const { getQuotes } = require('./quotes');
const { breaker, getBreakerForAccount, removeBreakerForAccount } = require('./agent/circuitBreaker');
const { riskManager, getRiskManagerForAccount, removeRiskManagerForAccount } = require('./agent/riskManager');
const { scanSymbols, getSignals, getProposals, removeStoreForAccount } = require('./agent/signalEngine');
const { isLLMReady } = require('./agent/brain');
const { getAccount } = require('../src/server/services/accountService');

let tickInterval = null;
let strategyInterval = null;
let signalInterval = null;

const DECISION_LOG_MAX = 200;
const decisionLog = [];

function logDecision(entry) {
  decisionLog.unshift({ ...entry, ts: new Date().toISOString() });
  if (decisionLog.length > DECISION_LOG_MAX) decisionLog.length = DECISION_LOG_MAX;
}
function getDecisionLog() { return decisionLog.slice(0, 50); }

// ── 多账户隔离：Map<accountId, agentConfig> ──

const _agentConfigs = new Map();

function _getAccountId() {
  try {
    const acc = getAccount();
    return acc?.accountId || 'default';
  } catch {
    return 'default';
  }
}

function _getConfigStore(accountId) {
  const id = accountId || _getAccountId();
  if (!_agentConfigs.has(id)) {
    _agentConfigs.set(id, {
      level: 1,
      strategyId: 'balanced',
      scanInterval: 300,
      strategyInterval: 300,
      watchSymbols: [],
      enabled: false,
    });
  }
  return _agentConfigs.get(id);
}

function getAgentConfig() { return { ..._getConfigStore() }; }

function updateAgentConfig(updates) {
  const config = _getConfigStore();
  const oldLevel = config.level;
  Object.assign(config, updates);
  // 同步到熔断器
  if (updates.level !== undefined) {
    breaker.setLevel(updates.level);
  }
  // 如果改了扫描间隔，重启调度器
  if (updates.scanInterval || updates.strategyInterval || updates.enabled !== undefined) {
    stopScheduler();
    startScheduler();
  }
  logDecision({ type: 'config_update', changes: updates, oldLevel });
  return config;
}

// ── 条件单定时检查（每 30 秒）──
function startOrderChecker() {
  tickInterval = setInterval(async () => {
    try {
      const quotes = await getQuotes();
      const prices = {};
      ['astocks', 'hkstocks', 'usstocks', 'metals', 'crypto'].forEach(cat => {
        (quotes[cat] || []).forEach(s => { prices[s.symbol] = s.price; });
      });
      const executed = await checkPendingOrders(prices);
      if (executed.length > 0) {
        console.log(`[Scheduler] 条件单触发: ${executed.length} 笔`);
        executed.forEach(e => {
          logDecision({ type: 'order', action: e.type, symbol: e.symbol, result: e.result });
        });
      }
    } catch (err) {
      console.error('[Scheduler] 条件单检查失败:', err.message);
    }
  }, 30 * 1000);
  console.log('[Scheduler] 条件单检查器已启动（30秒）');
}

// ── 信号扫描（根据配置间隔）──
function startSignalScanner() {
  const config = _getConfigStore();
  if (!config.enabled) {
    console.log('[Scheduler] Agent 未启用，信号扫描跳过');
    return;
  }
  if (!isLLMReady()) {
    console.log('[Scheduler] LLM 未配置，信号扫描跳过');
    return;
  }

  const intervalMs = (config.scanInterval || 300) * 1000;
  signalInterval = setInterval(async () => {
    const currentConfig = _getConfigStore();
    if (!currentConfig.enabled || !isLLMReady()) return;

    try {
      // 收集扫描标的：持仓 + 自选 + 额外
      const account = getAccount();
      const positions = account?.positions || account?.holdings || {};
      const symbols = new Set([
        ...Object.keys(positions),
        ...(currentConfig.watchSymbols || []),
      ]);

      // 加入自选
      try {
        const state = require('../data/state.json');
        const accId = state.currentAccountId;
        const watchlist = state.accounts?.[accId]?.watchlist || state.watchlist || [];
        watchlist.forEach(w => { if (w.symbol) symbols.add(w.symbol); });
      } catch (e) { /* 忽略 */ }

      if (symbols.size === 0) return;

      const results = await scanSymbols([...symbols], currentConfig.strategyId);

      const newSignals = results.filter(r => r.id);
      const executed = results.filter(r => r.action && r.action !== '观望');

      logDecision({
        type: 'signal_scan',
        scannedCount: symbols.size,
        signalCount: newSignals.length,
        actionableCount: executed.length,
        level: currentConfig.level,
        strategy: currentConfig.strategyId,
      });

      console.log(`[Scheduler] 信号扫描: ${symbols.size}标的 → ${newSignals.length}信号 → ${executed.length}可操作 (Level ${currentConfig.level})`);
    } catch (err) {
      console.error('[Scheduler] 信号扫描失败:', err.message);
    }
  }, intervalMs);

  console.log(`[Scheduler] 信号扫描器已启动（${config.scanInterval || 300}秒，Level ${config.level}）`);
}

// ── 策略扫描（较长间隔，被 signalScanner 覆盖）──
function startStrategyScanner() {
  const config = _getConfigStore();
  const intervalMs = (config.strategyInterval || 300) * 1000;
  strategyInterval = setInterval(async () => {
    const currentConfig = _getConfigStore();
    if (!currentConfig.enabled) return;
    try {
      const signals = getSignals(5);
      const proposals = getProposals();
      logDecision({
        type: 'strategy_check',
        level: currentConfig.level,
        recentSignals: signals.length,
        pendingProposals: proposals.filter(p => p.status === 'pending').length,
        breakerState: breaker.getStatus().state,
        dailyTrades: riskManager.getStatus().todayTradeCount,
      });
    } catch (err) {
      // 静默
    }
  }, intervalMs);
}

// ── 熔断事件监听器（具名函数，确保去重）──

function _onBreakerTrip({ reason, detail, newLevel }) {
  const config = _getConfigStore();
  logDecision({ type: 'circuit_breaker_trip', reason, detail, newLevel });
  config.level = newLevel;
  console.log(`[Scheduler] ⚠️ 熔断触发: ${reason} - ${detail}，降级到 Level ${newLevel}`);
}

function _onBreakerStateChange({ from, to }) {
  logDecision({ type: 'circuit_breaker_state', from, to });
}

// ── 启动/停止 ──
function startScheduler() {
  startOrderChecker();
  startSignalScanner();
  startStrategyScanner();

  // 监听熔断事件（用具名函数确保可移除）
  breaker.on('trip', _onBreakerTrip);
  breaker.on('stateChange', _onBreakerStateChange);

  const config = _getConfigStore();
  console.log('[Scheduler] ✅ 后台调度器 v2 启动完成');
  console.log(`[Scheduler]    Agent: ${config.enabled ? `Level ${config.level} / ${config.strategyId}` : '未启用'}`);
}

function stopScheduler() {
  if (tickInterval) clearInterval(tickInterval);
  if (strategyInterval) clearInterval(strategyInterval);
  if (signalInterval) clearInterval(signalInterval);
  tickInterval = null;
  strategyInterval = null;
  signalInterval = null;

  // 移除熔断事件监听器，防止累积
  try {
    breaker.off('trip', _onBreakerTrip);
    breaker.off('stateChange', _onBreakerStateChange);
  } catch { /* 忽略：Proxy 可能抛错 */ }

  console.log('[Scheduler] 已停止');
}

module.exports = {
  startScheduler, stopScheduler, getDecisionLog, logDecision,
  getAgentConfig, updateAgentConfig,
};
