const express = require('express');
const { parseBody, parseSymbol } = require('../validation');
const {
  createProposalFromResearch,
  evaluateResearchRun,
  getResearchRun,
  getResearchRuns,
  runResearch,
} = require('../../../lib/agent/research/researchDesk');
const {
  getMemory,
  getResearchConfig,
  updateResearchConfig,
} = require('../../../lib/agent/research/memory');

const router = express.Router();

router.post('/research/run', async (req, res) => {
  try {
    const parsed = parseBody('researchRun', req.body || {});
    if (!parsed.ok) return res.status(400).json({ success: false, error: parsed.error, issues: parsed.issues });
    const run = await runResearch(parsed.data);
    res.json({ success: true, run });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.get('/research/runs', (req, res) => {
  const parsed = req.query.symbol ? parseSymbol(req.query.symbol) : { ok: true, symbol: undefined };
  if (!parsed.ok) return res.status(400).json({ success: false, error: parsed.error });
  const limit = Math.min(Math.max(Number(req.query.limit || 40), 1), 160);
  res.json({ success: true, runs: getResearchRuns({ symbol: parsed.symbol, limit }) });
});

router.get('/research/runs/:runId', (req, res) => {
  const run = getResearchRun(req.params.runId);
  if (!run) return res.status(404).json({ success: false, error: '研究记录不存在' });
  res.json({ success: true, run });
});

router.post('/research/runs/:runId/create-proposal', (req, res) => {
  try {
    const result = createProposalFromResearch(req.params.runId);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/research/runs/:runId/evaluate-outcome', async (req, res) => {
  try {
    const result = await evaluateResearchRun(req.params.runId);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.get('/research/memory', (req, res) => {
  const parsed = parseSymbol(req.query.symbol);
  if (!parsed.ok) return res.status(400).json({ success: false, error: parsed.error });
  res.json({ success: true, symbol: parsed.symbol, memory: getMemory(parsed.symbol, { limit: Number(req.query.limit || 20) }) });
});

router.get('/research/config', (req, res) => {
  res.json({ success: true, config: getResearchConfig() });
});

router.patch('/research/config', (req, res) => {
  try {
    const parsed = parseBody('researchConfig', req.body || {});
    if (!parsed.ok) return res.status(400).json({ success: false, error: parsed.error, issues: parsed.issues });
    res.json({ success: true, config: updateResearchConfig(parsed.data) });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

module.exports = router;
