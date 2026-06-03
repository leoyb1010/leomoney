/**
 * 消息情报 API — 实时检索 / Agent 解读 / 关注词
 */
const express = require('express');
const router = express.Router();
const {
  scanIntel,
  analyzeIntel,
  getFeed,
  getWatchTopics,
  addWatchTopic,
  removeWatchTopic,
  isLLMReady,
  getLLMInfo,
} = require('../../../lib/intel');
const { generateSignal } = require('../../../lib/agent/cognitiveLoop');
const { getAgentConfig } = require('../../../lib/scheduler');
const { parseSymbol } = require('../validation');

router.get('/intel/feed', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 30, 80);
  res.json({ success: true, items: getFeed(limit), llmReady: isLLMReady() });
});

router.get('/intel/watch', (req, res) => {
  res.json({ success: true, topics: getWatchTopics(), llmReady: isLLMReady(), llmInfo: getLLMInfo() });
});

router.post('/intel/watch', (req, res) => {
  try {
    const topic = addWatchTopic(req.body || {});
    res.json({ success: true, topic });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.delete('/intel/watch/:id', (req, res) => {
  removeWatchTopic(req.params.id);
  res.json({ success: true });
});

router.post('/intel/scan', async (req, res) => {
  try {
    const { query, symbol } = req.body || {};
    const entry = await scanIntel({ query, symbol });
    res.json({ success: true, entry });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/intel/analyze', async (req, res) => {
  try {
    const { query, symbol } = req.body || {};
    const entry = await analyzeIntel({ query, symbol });
    res.json({ success: true, entry, llmReady: isLLMReady() });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/intel/agent-signal', async (req, res) => {
  try {
    const { symbol, strategyId, query } = req.body || {};
    const sym = symbol || query;
    const parsed = parseSymbol(sym);
    if (!parsed.ok) return res.status(400).json({ success: false, error: parsed.error });

    if (query) {
      await scanIntel({ query, symbol: parsed.symbol });
    }

    const config = getAgentConfig();
    const result = await generateSignal(parsed.symbol, strategyId || config.strategyId);
    res.json({
      success: !result.error,
      symbol: parsed.symbol,
      signal: result.signal,
      error: result.error,
      intelLinked: true,
      llmReady: isLLMReady(),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;