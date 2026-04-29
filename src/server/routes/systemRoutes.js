const express = require('express');
const pkg = require('../../../package.json');
const { getAccount } = require('../services/accountService');
const { getMarketStatus } = require('../../../lib/market');
const { getApiHealth } = require('../../../lib/quotes');
const { breaker } = require('../../../lib/agent/circuitBreaker');
const { riskManager } = require('../../../lib/agent/riskManager');
const { isLLMReady, getLLMInfo } = require('../../../lib/agent/brain');
const { sseService } = require('../../../lib/sse');
const { runAutomation } = require('../automation/automationEngine');
const { readAuditEvents, getReplay, AUDIT_DIR } = require('../audit/auditLog');

const router = express.Router();

router.get('/health', (req, res) => {
  const account = getAccount();
  res.json({
    success: true,
    status: 'ok',
    version: pkg.version,
    service: 'leomoney-vnext',
    accountId: account?.accountId || null,
    market: getMarketStatus(),
    apis: getApiHealth(),
    agent: {
      llmReady: isLLMReady(),
      llm: getLLMInfo(),
      breaker: breaker.getStatus(),
      risk: riskManager.getStatus(),
    },
    realtime: sseService.getStatus(),
    audit: { dir: AUDIT_DIR },
    timestamp: new Date().toISOString(),
  });
});

router.get('/vnext/status', (req, res) => {
  res.json({
    success: true,
    name: 'LeoMoney Command OS',
    capabilities: [
      'audit_log',
      'automation_engine',
      'execution_gate',
      'risk_control',
      'run_replay',
      'sse_realtime',
    ],
    next: ['react_command_center', 'sqlite_wal', 'agent_dag', 'event_backtest'],
  });
});

router.post('/automation/run', async (req, res) => {
  const account = getAccount();
  const body = req.body || {};
  const trigger = {
    id: body.id || `manual_${Date.now()}`,
    type: body.type || 'manual',
    accountId: body.accountId || account?.accountId || 'default',
    symbol: body.symbol,
    payload: body.payload || {},
    ts: body.ts || new Date().toISOString(),
  };
  const result = await runAutomation(trigger, { mode: body.mode || 'dry_run' });
  res.status(result.success ? 200 : 400).json(result);
});

router.get('/audit/events', async (req, res) => {
  const events = await readAuditEvents({
    runId: req.query.runId,
    type: req.query.type,
    limit: Number(req.query.limit || 100),
  });
  res.json({ success: true, events });
});

router.get('/replay/:runId', async (req, res) => {
  const replay = await getReplay(req.params.runId);
  res.status(replay.found ? 200 : 404).json({ success: replay.found, ...replay });
});

module.exports = router;
