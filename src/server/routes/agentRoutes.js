/**
 * Leomoney Agent API 路由 v3
 * 20 个端点覆盖：配置/策略/信号/方案/熔断器/风控/日志/回测/健康/SSE
 */

const express = require('express');
const router = express.Router();

const { getAgentConfig, updateAgentConfig, getDecisionLog } = require('../../../lib/scheduler');
const { generateSignal, createProposal, executeProposal, scanSymbols, getSignals, getProposals, approveProposal, rejectProposal } = require('../../../lib/agent/cognitiveLoop');
const { breaker, getBreakerForAccount } = require('../../../lib/agent/circuitBreaker');
const { riskManager, getRiskManagerForAccount } = require('../../../lib/agent/riskManager');
const { listStrategies, getStrategy, createCustomStrategy, getStrategyPrompt } = require('../../../lib/agent/promptTemplates');
const { isLLMReady, getLLMInfo } = require('../../../lib/agent/brain');
const { gatherIntelligence } = require('../../../lib/agent/eyes');
const { backtestStrategy, backtestAll } = require('../../../lib/agent/backtest');
const { getApiHealth } = require('../../../lib/quotes');
const { sseService } = require('../../../lib/sse');

// ── 配置 ──

router.get('/agent/config', (req, res) => {
  res.json({ success: true, config: getAgentConfig() });
});

router.patch('/agent/config', (req, res) => {
  try {
    const config = updateAgentConfig(req.body);
    res.json({ success: true, config });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ── 状态总览 ──

router.get('/agent/status', (req, res) => {
  const config = getAgentConfig();
  const breakerStatus = breaker.getStatus();
  const riskStatus = riskManager.getStatus();

  res.json({
    success: true,
    llmReady: isLLMReady(),
    llmInfo: getLLMInfo(),
    searchConfigured: !!(process.env.SEARCH_API_KEY),
    agent: config,
    circuitBreaker: breakerStatus,
    risk: riskStatus,
  });
});

// ── 策略 ──

router.get('/agent/strategies', (req, res) => {
  const strategies = listStrategies();
  res.json({ success: true, strategies });
});

router.post('/agent/strategies/custom', (req, res) => {
  try {
    const { name, description, prompt } = req.body;
    if (!name || !prompt) return res.status(400).json({ success: false, error: '需要 name 和 prompt' });
    const strategy = createCustomStrategy({ name, description: description || '', prompt });
    res.json({ success: true, strategy });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ── 信号 ──

router.get('/agent/signals', (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  res.json({ success: true, signals: getSignals(limit) });
});

router.post('/agent/signal', async (req, res) => {
  try {
    const { symbol, strategyId } = req.body;
    if (!symbol) return res.status(400).json({ success: false, error: '需要 symbol' });
    const config = getAgentConfig();
    const result = await generateSignal(symbol, strategyId || config.strategyId);
    if (result.error) return res.json({ success: false, error: result.error });

    // Level 2+ 自动创建方案
    if (breaker.currentLevel >= 2 && result.signal && result.signal.action !== '观望') {
      const proposal = createProposal(result.signal);
      // Level 3 自动执行
      if (breaker.currentLevel === 3 && proposal && proposal.status !== 'rejected') {
        const threshold = getStrategy(config.strategyId)?.confidenceThreshold || 0.7;
        if (result.signal.confidence >= threshold) {
          await executeProposal(proposal.id, true);
        }
      }
    }

    res.json({ success: true, signal: result.signal });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── 方案 ──

router.get('/agent/proposals', (req, res) => {
  res.json({ success: true, proposals: getProposals() });
});

router.post('/agent/proposals/:id/approve', (req, res) => {
  try {
    const result = approveProposal(req.params.id);
    res.json({ success: !!result, ...result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/agent/proposals/:id/reject', (req, res) => {
  try {
    const result = rejectProposal(req.params.id);
    res.json({ success: !!result, ...result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/agent/proposals/:id/execute', async (req, res) => {
  try {
    const result = await executeProposal(req.params.id);
    res.json({ success: result.success, ...result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ── 熔断器 ──

router.get('/agent/circuit-breaker', (req, res) => {
  res.json({ success: true, ...breaker.getStatus() });
});

router.post('/agent/circuit-breaker/reset', (req, res) => {
  breaker.reset();
  res.json({ success: true, state: breaker.getStatus().state });
});

// ── 风控 ──

router.get('/agent/risk', (req, res) => {
  res.json({ success: true, ...riskManager.getStatus() });
});

// ── 日志 ──

router.get('/agent/log', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  res.json({ success: true, log: getDecisionLog().slice(0, limit) });
});

// ── 回测 v3 ──

router.get('/agent/backtest', (req, res) => {
  const { strategyId, period } = req.query;
  try {
    if (strategyId) {
      const result = backtestStrategy(strategyId, { period: period || 'all' });
      res.json({ success: true, result });
    } else {
      const results = backtestAll({ period: period || 'all' });
      res.json({ success: true, results });
    }
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ── API 健康面板 v3 ──

router.get('/agent/health', (req, res) => {
  const apiHealth = getApiHealth();
  const sseStatus = sseService.getStatus();
  const llmInfo = getLLMInfo();

  res.json({
    success: true,
    apis: apiHealth,
    sse: sseStatus,
    llm: {
      ready: isLLMReady(),
      provider: llmInfo.provider,
      model: llmInfo.model,
      reasoner: llmInfo.reasoner,
    },
    search: {
      configured: !!(process.env.SEARCH_API_KEY),
      provider: process.env.SEARCH_API_URL ? 'tavily' : 'none',
    },
    timestamp: new Date().toISOString(),
  });
});

// ── 日报 ──

router.get('/agent/daily-report', (req, res) => {
  const config = getAgentConfig();
  const breakerStatus = breaker.getStatus();
  const riskStatus = riskManager.getStatus();
  const signals = getSignals(10);
  const proposals = getProposals();
  const log = getDecisionLog().slice(0, 20);

  res.json({
    success: true,
    date: new Date().toISOString().slice(0, 10),
    agent: config,
    circuitBreaker: breakerStatus,
    risk: riskStatus,
    recentSignals: signals.length,
    pendingProposals: proposals.filter(p => p.status === 'pending').length,
    executedProposals: proposals.filter(p => p.status === 'executed').length,
    log,
  });
});

module.exports = router;
