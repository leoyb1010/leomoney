const { buildContext } = require('./contextBuilder');
const { runRules } = require('./ruleEngine');
const { executionGate } = require('./executionGate');
const { TriggerSchema, AutomationModeSchema } = require('./schemas');
const { recordAuditEvent } = require('../audit/auditLog');

async function runAutomation(triggerInput, options = {}) {
  const trigger = TriggerSchema.parse({
    ts: new Date().toISOString(),
    payload: {},
    ...triggerInput,
  });
  const mode = AutomationModeSchema.parse(options.mode || 'dry_run');
  const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  await recordAuditEvent({ type: 'automation_start', runId, mode, trigger });

  try {
    const context = await buildContext(trigger);
    await recordAuditEvent({
      type: 'context_built',
      runId,
      accountId: trigger.accountId,
      symbol: trigger.symbol,
      contextSnapshot: context,
    });

    const ruleDecision = await runRules(context);
    const decision = ruleDecision || {
      action: 'HOLD',
      symbol: trigger.symbol || 'UNKNOWN',
      confidence: 0,
      thesis: 'No rule matched',
      evidenceRefs: [],
      positionSize: { mode: 'cash_percent', value: 0 },
      riskFlags: [],
    };

    await recordAuditEvent({ type: 'decision_created', runId, decision });

    const gate = await executionGate({ runId, mode, trigger, context, decision });
    await recordAuditEvent({
      type: 'execution_gate',
      runId,
      mode,
      trigger,
      decision,
      gate,
    });

    return { success: true, runId, mode, decision, gate };
  } catch (err) {
    await recordAuditEvent({
      type: 'automation_error',
      runId,
      mode,
      trigger,
      error: { message: err.message, stack: err.stack },
    });
    return { success: false, runId, mode, error: err.message };
  }
}

module.exports = { runAutomation };
