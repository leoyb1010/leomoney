const { z } = require('zod');

const TriggerSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['manual', 'schedule', 'condition', 'agent', 'backtest']),
  accountId: z.string().min(1),
  symbol: z.string().min(1).optional(),
  payload: z.record(z.string(), z.any()).default({}),
  ts: z.string().min(1),
});

const DecisionSchema = z.object({
  action: z.enum(['BUY', 'SELL', 'HOLD', 'NO_OP']),
  symbol: z.string().min(1),
  confidence: z.number().min(0).max(1),
  thesis: z.string().min(1),
  evidenceRefs: z.array(z.string()).default([]),
  positionSize: z.object({
    mode: z.enum(['cash_percent', 'position_percent', 'shares']),
    value: z.number().nonnegative(),
  }).default({ mode: 'cash_percent', value: 0 }),
  riskFlags: z.array(z.string()).default([]),
});

const AutomationModeSchema = z.enum(['dry_run', 'simulation_only', 'paper_execution']);

module.exports = {
  TriggerSchema,
  DecisionSchema,
  AutomationModeSchema,
};
