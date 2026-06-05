/**
 * Leomoney Agent API 路由 v3（精简）
 *
 * 历史上这里有一整套 /agent/* 端点，但它与 analysisRoutes.js 大量重复，且 analysisRoutes
 * 先挂载（server.js）会抢先匹配，导致这里的同名 handler 永远不会被执行（dead code）。
 * 为消除这种隐蔽的 route shadowing，这里只保留 analysisRoutes 没有、且前端会调用的两个
 * 无状态端点：回测与健康面板。其余 agent 端点统一由 analysisRoutes 提供。
 */

const express = require('express');
const router = express.Router();

const { backtestStrategy, backtestAll } = require('../../../lib/agent/backtest');
const { getApiHealth } = require('../../../lib/quotes');
const { sseService } = require('../../../lib/sse');
const { isLLMReady, getLLMInfo } = require('../../../lib/agent/brain');

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

module.exports = router;
