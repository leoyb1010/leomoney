/**
 * Leomoney Agent API 路由
 * 16 个端点覆盖：配置/策略/信号/方案/熔断器/风控/日志
 */

const express = require('express');
const router = express.Router();

const { getAgentConfig, updateAgentConfig, getDecisionLog } = require('../../../lib/scheduler');
const { generateSignal, createProposal, executeProposal, scanSymbols, getSignals, getProposals, approveProposal, rejectProposal } = require('../../../lib/agent/signalEngine');
const { breaker, getBreakerForAccount } = require('../../../lib/agent/circuitBreaker');
const { riskManager, getRiskManagerForAccount } = require('../../../lib/agent/riskManager');
const { listStrategies, getStrategy, createCustomStrategy, getStrategyPrompt } = require('../../../lib/agent/promptTemplates');
const { isLLMReady, getLLMInfo } = require('../../../lib/agent/brain');
const { gatherIntelligence } = require('../../../lib/agent/eyes');

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
    if (breaker.currentLevel >= 2 && result.signal && result.signal.action !== 'HOLD' && result.signal.action !== '观望') {
      const proposal = createProposal(result.signal);
      // Level 3 自动执行
      if (breaker.currentLevel === 3 && proposal) {
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

module.exports = router;
