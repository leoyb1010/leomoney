const express = require('express');
const pkg = require('../../../package.json');
const { getRuntimeConfig } = require('../config');
const { getAccount } = require('../services/accountService');
const { getMarketStatus } = require('../../../lib/market');
const { getApiHealth } = require('../../../lib/quotes');
const { breaker } = require('../../../lib/agent/circuitBreaker');
const { riskManager } = require('../../../lib/agent/riskManager');
const { isLLMReady, getLLMInfo } = require('../../../lib/agent/brain');
const { sseService } = require('../../../lib/sse');
const { runAutomation } = require('../automation/automationEngine');
const { readAuditEvents, getReplay, getAuditStatus } = require('../audit/auditLog');
const { startupIntegrityCheck, getStateRepositoryStatus } = require('../repositories/stateRepository');
const { parseBody } = require('../validation');

const router = express.Router();

router.get('/health', (req, res) => {
  const account = getAccount();
  const runtime = getRuntimeConfig();
  const state = getStateRepositoryStatus();
  const audit = getAuditStatus();
  res.json({
    success: true,
    status: 'ok',
    version: pkg.version,
    channel: runtime.versionChannel,
    service: 'leomoney-command-center',
    product: {
      name: runtime.productName,
      identity: '个人模拟仓与分析师情报工作台',
      tagline: '个人模拟仓 · 分析师工作台',
      simulatedTradingOnly: runtime.simulatedTradingOnly,
      paperExecutionEnabled: runtime.paperExecutionEnabled,
      agentPaperExecutionEnabled: runtime.agentPaperExecutionEnabled,
      investmentAdvice: false,
    },
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
    persistence: state,
    audit,
    security: {
      corsMode: runtime.corsMode,
      requestBodyLimit: runtime.requestBodyLimit,
      securityHeaders: true,
      secretsExpectedInEnv: true,
    },
    timestamp: new Date().toISOString(),
  });
});

router.get('/readiness', (req, res) => {
  const integrity = startupIntegrityCheck();
  const state = getStateRepositoryStatus();
  const audit = getAuditStatus();
  const ready = integrity.valid && state.writable && audit.writable;
  res.status(ready ? 200 : 503).json({
    success: ready,
    ready,
    version: pkg.version,
    checks: {
      stateIntegrity: integrity,
      persistenceWritable: state.writable,
      auditWritable: audit.writable,
      llmConfigured: isLLMReady(),
    },
    safeMode: {
      simulatedTradingOnly: true,
      llmUnavailableAction: 'HOLD',
      marketDataUnavailableAction: 'HOLD',
    },
    timestamp: new Date().toISOString(),
  });
});

router.get('/version', (req, res) => {
  const runtime = getRuntimeConfig();
  res.json({
    success: true,
    name: 'LeoMoney',
    version: pkg.version,
    channel: runtime.versionChannel,
    simulatedTradingOnly: true,
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
  const parsed = parseBody('automationRun', req.body || {});
  if (!parsed.ok) return res.status(400).json({ success: false, error: parsed.error, issues: parsed.issues });
  const body = parsed.data;
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
    limit: Math.min(Math.max(Number(req.query.limit || 100), 1), 500),
  });
  res.json({ success: true, events });
});

router.get('/replay/:runId', async (req, res) => {
  const replay = await getReplay(req.params.runId);
  res.status(replay.found ? 200 : 404).json({ success: replay.found, ...replay });
});

module.exports = router;
