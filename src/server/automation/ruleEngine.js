const { DecisionSchema } = require('./schemas');

function normalizeDecision(raw, fallbackSymbol) {
  const decision = {
    action: raw?.action || 'HOLD',
    symbol: raw?.symbol || fallbackSymbol,
    confidence: Number(raw?.confidence ?? 0),
    thesis: raw?.thesis || raw?.reason || 'Decision supplied by automation payload',
    evidenceRefs: Array.isArray(raw?.evidenceRefs) ? raw.evidenceRefs : [],
    positionSize: raw?.positionSize || { mode: 'cash_percent', value: 0 },
    riskFlags: Array.isArray(raw?.riskFlags) ? raw.riskFlags : [],
  };
  return DecisionSchema.parse(decision);
}

function compare(left, op, right) {
  if (op === 'eq') return left === right;
  if (op === 'neq') return left !== right;
  const l = Number(left);
  const r = Number(right);
  if (!Number.isFinite(l) || !Number.isFinite(r)) return false;
  if (op === 'gt') return l > r;
  if (op === 'gte') return l >= r;
  if (op === 'lt') return l < r;
  if (op === 'lte') return l <= r;
  return false;
}

function getByPath(source, path) {
  return String(path).split('.').reduce((acc, key) => acc == null ? undefined : acc[key], source);
}

function matchesRule(rule, context) {
  const conditions = rule?.if?.all || [];
  return conditions.every(condition => compare(
    getByPath(context, condition.field),
    condition.op,
    condition.value,
  ));
}

async function runRules(context) {
  const payload = context.trigger?.payload || {};
  if (payload.decision) {
    return normalizeDecision(payload.decision, context.trigger.symbol);
  }

  const rules = Array.isArray(payload.rules) ? payload.rules : [];
  const matched = rules.find(rule => rule.enabled !== false && matchesRule(rule, context));
  if (!matched) return null;

  const action = String(matched.then?.action || 'HOLD').toUpperCase();
  return normalizeDecision({
    action,
    symbol: matched.then?.symbol || context.trigger.symbol,
    confidence: Number(matched.then?.confidence ?? 0.7),
    thesis: matched.then?.thesis || `Matched automation rule ${matched.id || 'inline_rule'}`,
    evidenceRefs: [`rule:${matched.id || 'inline_rule'}`],
    positionSize: {
      mode: matched.then?.qtyMode === 'percent_position' ? 'position_percent' : matched.then?.qtyMode || 'cash_percent',
      value: Number(matched.then?.qtyValue ?? 0),
    },
    riskFlags: matched.then?.riskFlags || [],
  }, context.trigger.symbol);
}

module.exports = { runRules, matchesRule };
