/**
 * Leomoney 后台调度器 v2 — 三级调度 + 信号扫描 + 熔断监控
 * Level 1: 仅信号扫描
 * Level 2: 信号 + 方案生成（需人工确认）
 * Level 3: 信号 + 方案 + 自动执行
 */

const { checkPendingOrders } = require('../src/server/services/orderService');
const { getQuotes } = require('./quotes');
const { breaker } = require('./agent/circuitBreaker');
const { riskManager } = require('./agent/riskManager');
const { scanSymbols, getSignals, getProposals } = require('./agent/signalEngine');
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

// Agent 运行配置（持久化在内存，重启恢复默认）
let agentConfig = {
  level: 1,
  strategyId: 'balanced',
  scanInterval: 300,       // 信号扫描间隔秒数
  strategyInterval: 300,   // 策略扫描间隔秒数
  watchSymbols: [],        // 额外监控标的（除了持仓和自选）
  enabled: false,          // Agent 总开关
};

function getAgentConfig() { return { ...agentConfig }; }

function updateAgentConfig(updates) {
  const oldLevel = agentConfig.level;
  Object.assign(agentConfig, updates);
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
  return agentConfig;
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
  if (!agentConfig.enabled) {
    console.log('[Scheduler] Agent 未启用，信号扫描跳过');
    return;
  }
  if (!isLLMReady()) {
    console.log('[Scheduler] LLM 未配置，信号扫描跳过');
    return;
  }

  const intervalMs = (agentConfig.scanInterval || 300) * 1000;
  signalInterval = setInterval(async () => {
    if (!agentConfig.enabled || !isLLMReady()) return;

    try {
      // 收集扫描标的：持仓 + 自选 + 额外
      const account = getAccount();
      const positions = account?.positions || account?.holdings || {};
      const symbols = new Set([
        ...Object.keys(positions),
        ...(agentConfig.watchSymbols || []),
      ]);

      // 加入自选
      try {
        const state = require('../data/state.json');
        const accId = state.currentAccountId;
        const watchlist = state.accounts?.[accId]?.watchlist || state.watchlist || [];
        watchlist.forEach(w => { if (w.symbol) symbols.add(w.symbol); });
      } catch (e) { /* 忽略 */ }

      if (symbols.size === 0) return;

      const results = await scanSymbols([...symbols], agentConfig.strategyId);

      const newSignals = results.filter(r => r.id);
      const executed = results.filter(r => r.action && r.action !== '观望');

      logDecision({
        type: 'signal_scan',
        scannedCount: symbols.size,
        signalCount: newSignals.length,
        actionableCount: executed.length,
        level: agentConfig.level,
        strategy: agentConfig.strategyId,
      });

      console.log(`[Scheduler] 信号扫描: ${symbols.size}标的 → ${newSignals.length}信号 → ${executed.length}可操作 (Level ${agentConfig.level})`);
    } catch (err) {
      console.error('[Scheduler] 信号扫描失败:', err.message);
    }
  }, intervalMs);

  console.log(`[Scheduler] 信号扫描器已启动（${agentConfig.scanInterval || 300}秒，Level ${agentConfig.level}）`);
}

// ── 策略扫描（较长间隔，被 signalScanner 覆盖）──
function startStrategyScanner() {
  const intervalMs = (agentConfig.strategyInterval || 300) * 1000;
  strategyInterval = setInterval(async () => {
    // 策略扫描已被信号扫描替代，这里只做日志记录
    if (!agentConfig.enabled) return;
    try {
      const signals = getSignals(5);
      const proposals = getProposals();
      logDecision({
        type: 'strategy_check',
        level: agentConfig.level,
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

// ── 启动/停止 ──
function startScheduler() {
  startOrderChecker();
  startSignalScanner();
  startStrategyScanner();

  // 监听熔断事件
  breaker.on('trip', ({ reason, detail, newLevel }) => {
    logDecision({ type: 'circuit_breaker_trip', reason, detail, newLevel });
    agentConfig.level = newLevel;
    console.log(`[Scheduler] ⚠️ 熔断触发: ${reason} - ${detail}，降级到 Level ${newLevel}`);
  });

  breaker.on('stateChange', ({ from, to }) => {
    logDecision({ type: 'circuit_breaker_state', from, to });
  });

  console.log('[Scheduler] ✅ 后台调度器 v2 启动完成');
  console.log(`[Scheduler]    Agent: ${agentConfig.enabled ? `Level ${agentConfig.level} / ${agentConfig.strategyId}` : '未启用'}`);
}

function stopScheduler() {
  if (tickInterval) clearInterval(tickInterval);
  if (strategyInterval) clearInterval(strategyInterval);
  if (signalInterval) clearInterval(signalInterval);
  tickInterval = null;
  strategyInterval = null;
  signalInterval = null;
  console.log('[Scheduler] 已停止');
}

module.exports = {
  startScheduler, stopScheduler, getDecisionLog, logDecision,
  getAgentConfig, updateAgentConfig,
};
