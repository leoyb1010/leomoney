const { z } = require('zod');
const { getRuntimeConfig } = require('./config');

const SYMBOL_PATTERN = /^[A-Za-z0-9._:-]{1,48}$/;
const RUN_ID_PATTERN = /^[A-Za-z0-9._:-]{1,96}$/;
const CATEGORY_VALUES = ['indices', 'astocks', 'hkstocks', 'usstocks', 'metals', 'crypto'];
const AUTOMATION_MODES = ['dry_run', 'simulation_only', 'paper_execution'];

function optionalEmptyNumber(schema) {
  return z.preprocess(value => {
    if (value === '' || value === null || value === undefined) return undefined;
    return value;
  }, schema.optional());
}

function numberWithin(name, max) {
  return z.coerce.number({
    error: `${name} 必须是数字`,
  }).refine(Number.isFinite, `${name} 必须是有限数字`).positive(`${name} 必须大于 0`).max(max, `${name} 超过系统上限 ${max}`);
}

function schemas() {
  const config = getRuntimeConfig();
  const symbol = z.string().trim().min(1, '缺少参数: symbol').max(48, 'symbol 过长').regex(SYMBOL_PATTERN, 'symbol 只能包含字母、数字、点、下划线、冒号或短横线');
  const runId = z.string().trim().min(1).max(96).regex(RUN_ID_PATTERN).optional();

  const tradePayload = z.object({
    symbol,
    qty: numberWithin('qty', config.maxOrderQty),
    price: optionalEmptyNumber(numberWithin('price', config.maxOrderPrice)),
    strategy: z.string().trim().max(80).optional(),
    source: z.string().trim().max(40).optional(),
    mode: z.enum(AUTOMATION_MODES).optional(),
    executionMode: z.enum(AUTOMATION_MODES).optional(),
    runId,
    decisionId: runId,
    evidenceRefs: z.array(z.string().trim().max(120)).max(20).optional(),
    riskApproved: z.boolean().optional(),
  }).strip();

  const orderPayload = z.object({
    symbol,
    name: z.string().trim().max(80).optional(),
    side: z.enum(['buy', 'sell', 'BUY', 'SELL']).optional(),
    action: z.enum(['buy', 'sell', 'BUY', 'SELL']).optional(),
    orderType: z.enum(['buy', 'sell', 'BUY', 'SELL']).optional(),
    type: z.enum(['buy', 'sell', 'BUY', 'SELL', 'gte', 'lte']).optional(),
    triggerType: z.enum(['gte', 'lte', 'GTE', 'LTE']).optional(),
    triggerPrice: numberWithin('triggerPrice', config.maxOrderPrice).optional(),
    price: optionalEmptyNumber(numberWithin('price', config.maxOrderPrice)),
    qty: numberWithin('qty', config.maxOrderQty),
    category: z.enum(CATEGORY_VALUES).optional(),
  }).strip();

  const automationRun = z.object({
    id: z.string().trim().min(1).max(96).optional(),
    type: z.enum(['manual', 'schedule', 'condition', 'agent', 'backtest']).optional(),
    accountId: z.string().trim().min(1).max(96).optional(),
    symbol: symbol.optional(),
    payload: z.record(z.string(), z.any()).default({}),
    mode: z.enum(AUTOMATION_MODES).default('dry_run'),
    ts: z.string().trim().max(80).optional(),
  }).strip();

  const agentConfig = z.object({
    enabled: z.boolean().optional(),
    level: z.coerce.number().int().min(1).max(3).optional(),
    strategyId: z.string().trim().min(1).max(80).optional(),
    scanInterval: z.coerce.number().int().min(30).max(86400).optional(),
    strategyInterval: z.coerce.number().int().min(60).max(86400).optional(),
    watchSymbols: z.array(symbol).max(100).optional(),
  }).strip();

  return { symbol, tradePayload, orderPayload, automationRun, agentConfig };
}

function parseBody(schemaName, body) {
  const schema = schemas()[schemaName];
  if (!schema) throw new Error(`Unknown schema: ${schemaName}`);
  const result = schema.safeParse(body || {});
  if (result.success) return { ok: true, data: result.data };
  return {
    ok: false,
    error: result.error.issues.map(issue => issue.message).join('; '),
    issues: result.error.issues.map(issue => ({ path: issue.path.join('.'), message: issue.message })),
  };
}

function parseSymbol(value) {
  const result = schemas().symbol.safeParse(value);
  return result.success ? { ok: true, symbol: result.data } : { ok: false, error: result.error.issues[0]?.message || 'symbol 无效' };
}

module.exports = {
  AUTOMATION_MODES,
  CATEGORY_VALUES,
  SYMBOL_PATTERN,
  parseBody,
  parseSymbol,
  schemas,
};
