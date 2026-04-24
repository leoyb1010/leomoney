/**
 * Leomoney 分析/Agent 路由 v2
 * 原有分析 API + Agent 完整控制台 API
 */
const express = require('express');
const router = express.Router();
const { 分析交易, 生成Agent总结, 生成决策输入, AGENT_PROMPT } = require('../../../src/analytics/tradeEngine');
const { getAccount } = require('../services/accountService');

// ── 原有分析 API ──

router.get('/analysis', (req, res) => {
  try {
    const account = getAccount();
    const trades = account.history || [];
    const 分析结果 = 分析交易(trades);
    const 总结 = 生成Agent总结(分析结果);
    res.json({ success: true, accountId: account.accountId, 分析: 分析结果, 总结 });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/agent/prompt', (req, res) => {
  res.json({ success: true, prompt: AGENT_PROMPT });
});

router.post('/agent/decision-input', (req, res) => {
  try {
    const account = getAccount();
    const trades = account.history || [];
    const 分析结果 = 分析交易(trades);
    const marketData = req.body.market || null;
    const 输入数据 = 生成决策输入(分析结果, marketData);
    res.json({ success: true, accountId: account.accountId, input: 输入数据, prompt: AGENT_PROMPT });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Agent 基础 API ──

router.post('/agent/analyze', async (req, res) => {
  try {
    const { analyzeSingle } = require('../../../lib/agent/executor');
    const { symbol } = req.body || {};
    if (!symbol) return res.status(400).json({ success: false, error: '缺少参数: symbol' });
    const result = await analyzeSingle(symbol);
    res.status(result.success ? 200 : 400).json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/agent/log', (req, res) => {
  try {
    const { getDecisionLog } = require('../../../lib/scheduler');
    res.json({ success: true, log: getDecisionLog() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/agent/status', (req, res) => {
  try {
    const { isLLMReady, getLLMInfo } = require('../../../lib/agent/brain');
    const { breaker } = require('../../../lib/agent/circuitBreaker');
    const { riskManager } = require('../../../lib/agent/riskManager');
    const { getAgentConfig } = require('../../../lib/scheduler');
    const llmInfo = getLLMInfo();
    const agentConfig = getAgentConfig();
    res.json({
      success: true,
      llmReady: isLLMReady(),
      ...llmInfo,
      searchConfigured: !!process.env.SEARCH_API_URL,
      searchProvider: process.env.SEARCH_API_URL === 'tavily' ? 'tavily' : (process.env.SEARCH_API_URL || 'none'),
      agent: agentConfig,
      circuitBreaker: breaker.getStatus(),
      risk: riskManager.getStatus(),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Agent 配置 API ──

router.get('/agent/config', (req, res) => {
  try {
    const { getAgentConfig } = require('../../../lib/scheduler');
    res.json({ success: true, config: getAgentConfig() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.patch('/agent/config', (req, res) => {
  try {
    const { updateAgentConfig } = require('../../../lib/scheduler');
    const newConfig = updateAgentConfig(req.body);
    res.json({ success: true, config: newConfig });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── 策略模板 API ──

router.get('/agent/strategies', (req, res) => {
  try {
    const { listStrategies, getStrategy } = require('../../../lib/agent/promptTemplates');
    const list = listStrategies();
    const detailed = req.query.detail === '1' ? list.map(s => getStrategy(s.id)) : list;
    res.json({ success: true, strategies: detailed });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/agent/strategies/custom', (req, res) => {
  try {
    const { createCustomStrategy } = require('../../../lib/agent/promptTemplates');
    const strategy = createCustomStrategy(req.body);
    res.json({ success: true, strategy });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── 信号 API ──

router.post('/agent/signal', async (req, res) => {
  try {
    const { generateSignal } = require('../../../lib/agent/signalEngine');
    const { symbol, strategyId } = req.body || {};
    if (!symbol) return res.status(400).json({ success: false, error: '缺少参数: symbol' });
    const result = await generateSignal(symbol, strategyId || 'balanced');
    res.status(result.success ? 200 : 400).json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/agent/signals', (req, res) => {
  try {
    const { getSignals } = require('../../../lib/agent/signalEngine');
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    res.json({ success: true, signals: getSignals(limit) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── 方案 API ──

router.get('/agent/proposals', (req, res) => {
  try {
    const { getProposals } = require('../../../lib/agent/signalEngine');
    const status = req.query.status || null;
    res.json({ success: true, proposals: getProposals(status) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/agent/proposals/:id/approve', (req, res) => {
  try {
    const { approveProposal } = require('../../../lib/agent/signalEngine');
    const result = approveProposal(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/agent/proposals/:id/reject', (req, res) => {
  try {
    const { rejectProposal } = require('../../../lib/agent/signalEngine');
    const result = rejectProposal(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/agent/proposals/:id/execute', async (req, res) => {
  try {
    const { executeProposal } = require('../../../lib/agent/signalEngine');
    const result = await executeProposal(req.params.id, false);
    res.status(result.success ? 200 : 400).json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── 熔断器 API ──

router.get('/agent/circuit-breaker', (req, res) => {
  try {
    const { breaker } = require('../../../lib/agent/circuitBreaker');
    res.json({ success: true, ...breaker.getStatus() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/agent/circuit-breaker/reset', (req, res) => {
  try {
    const { breaker } = require('../../../lib/agent/circuitBreaker');
    breaker.reset();
    res.json({ success: true, ...breaker.getStatus() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── 风控 API ──

router.get('/agent/risk', (req, res) => {
  try {
    const { riskManager } = require('../../../lib/agent/riskManager');
    res.json({ success: true, ...riskManager.getStatus() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.patch('/agent/risk', (req, res) => {
  try {
    const { riskManager } = require('../../../lib/agent/riskManager');
    riskManager.updateConfig(req.body);
    res.json({ success: true, ...riskManager.getStatus() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── 每日报告 ──

router.get('/agent/daily-report', (req, res) => {
  try {
    const { getDecisionLog } = require('../../../lib/scheduler');
    const { getSignals, getProposals } = require('../../../lib/agent/signalEngine');
    const { breaker } = require('../../../lib/agent/circuitBreaker');
    const { riskManager } = require('../../../lib/agent/riskManager');
    const { getAgentConfig } = require('../../../lib/scheduler');
    const account = getAccount();

    const today = new Date().toISOString().slice(0, 10);
    const todayLog = getDecisionLog().filter(l => l.ts?.startsWith(today));
    const todaySignals = getSignals(200).filter(s => s.ts?.startsWith(today));
    const todayProposals = getProposals().filter(p => p.createdAt?.startsWith(today));
    const executed = todayProposals.filter(p => p.status === 'executed');

    res.json({
      success: true,
      date: today,
      account: { cash: account?.cash, positionCount: Object.keys(account?.positions || account?.holdings || {}).length },
      agent: { config: getAgentConfig(), circuitBreaker: breaker.getStatus(), risk: riskManager.getStatus() },
      summary: {
        signalsGenerated: todaySignals.length,
        proposalsCreated: todayProposals.length,
        proposalsExecuted: executed.length,
        proposalsPending: todayProposals.filter(p => p.status === 'pending').length,
        proposalsRejected: todayProposals.filter(p => p.status === 'rejected').length,
      },
      recentLog: todayLog.slice(0, 20),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
