const path = require('path');

const VERSION_CHANNEL = process.env.LEOMONEY_VERSION_CHANNEL || 'commercial-beta';
const PRODUCT_NAME = 'LeoMoney V4';
const DEFAULT_PORT = 3210;

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function parseNumber(value, fallback, { min, max } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  if (min !== undefined && parsed < min) return fallback;
  if (max !== undefined && parsed > max) return fallback;
  return parsed;
}

function parseOrigins(value) {
  return String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function getDataDir() {
  return path.resolve(process.env.LEOMONEY_DATA_DIR || path.join(__dirname, '..', '..', 'data'));
}

function getRuntimeConfig() {
  const allowedOrigins = parseOrigins(process.env.LEOMONEY_ALLOWED_ORIGINS);
  const paperExecutionEnabled = parseBoolean(process.env.LEOMONEY_PAPER_EXECUTION_ENABLED, true);
  const agentPaperExecutionEnabled = parseBoolean(process.env.LEOMONEY_AGENT_PAPER_EXECUTION_ENABLED, false);

  return {
    productName: PRODUCT_NAME,
    versionChannel: VERSION_CHANNEL,
    port: parseNumber(process.env.PORT, DEFAULT_PORT, { min: 1, max: 65535 }),
    dataDir: getDataDir(),
    requestBodyLimit: process.env.LEOMONEY_REQUEST_BODY_LIMIT || '256kb',
    rateLimitWindowMs: parseNumber(process.env.LEOMONEY_RATE_LIMIT_WINDOW_MS, 60000, { min: 1000 }),
    rateLimitMaxRequests: parseNumber(process.env.LEOMONEY_RATE_LIMIT_MAX_REQUESTS, 600, { min: 0 }),
    allowedOrigins,
    corsMode: allowedOrigins.length > 0 ? 'restricted' : 'development-open',
    simulatedTradingOnly: true,
    paperExecutionEnabled,
    agentPaperExecutionEnabled,
    maxOrderQty: parseNumber(process.env.LEOMONEY_MAX_ORDER_QTY, 100000000, { min: 1 }),
    maxOrderNotionalCny: parseNumber(process.env.LEOMONEY_MAX_ORDER_NOTIONAL_CNY, 5000000, { min: 1 }),
    maxOrderPrice: parseNumber(process.env.LEOMONEY_MAX_ORDER_PRICE, 10000000, { min: 0.000001 }),
    llm: {
      provider: process.env.LLM_PROVIDER || 'deepseek',
      baseUrl: process.env.LLM_BASE_URL || process.env.OPENAI_BASE_URL || null,
      anthropicBaseUrl: process.env.LLM_ANTHROPIC_BASE_URL || null,
      model: process.env.LLM_MODEL || null,
      timeoutMs: parseNumber(process.env.LLM_TIMEOUT_MS, 30000, { min: 1000, max: 120000 }),
      maxRetries: parseNumber(process.env.LLM_MAX_RETRIES, 1, { min: 0, max: 5 }),
      apiKeyConfigured: !!process.env.LLM_API_KEY,
    },
  };
}

module.exports = {
  DEFAULT_PORT,
  PRODUCT_NAME,
  VERSION_CHANNEL,
  getDataDir,
  getRuntimeConfig,
  parseBoolean,
  parseNumber,
};
