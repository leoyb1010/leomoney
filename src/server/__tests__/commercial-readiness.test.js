const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

const { parseBody } = require('../validation');
const { createRateLimiter, securityHeaders } = require('../security');
const { normalizeOrderInput } = require('../services/orderService');
const { validateTradeIntent } = require('../services/tradingService');
const { buildPortfolioAnalyticsFromSummary } = require('../services/summaryService');

describe('Commercial readiness validation', () => {
  test('trade payload rejects malformed symbols and oversized notionals', () => {
    const badSymbol = parseBody('tradePayload', { symbol: '../../etc/passwd', qty: 100, price: 10 });
    assert.equal(badSymbol.ok, false);
    assert.match(badSymbol.error, /symbol/);

    const oversized = parseBody('tradePayload', { symbol: '600519', qty: 100000, price: 100000 });
    assert.equal(oversized.ok, true, 'route schema validates field bounds; service notional gate handles total notional');
    const intent = validateTradeIntent({ symbol: '600519', price: 100000, source: 'manual' }, 100000, 100000, 'buy');
    assert.equal(intent.ok, false);
    assert.match(intent.error, /名义金额/);
  });

  test('conditional order validation uses decimal lot checks', () => {
    const invalidLot = normalizeOrderInput({
      symbol: '600519',
      side: 'buy',
      triggerType: 'lte',
      triggerPrice: 1200,
      qty: 150,
      category: 'astocks',
    });
    assert.equal(invalidLot.ok, false);
    assert.match(invalidLot.error, /100/);

    const valid = normalizeOrderInput({
      symbol: '600519',
      side: 'buy',
      triggerType: 'lte',
      triggerPrice: 1200,
      qty: 100,
      category: 'astocks',
    });
    assert.equal(valid.ok, true);
  });

  test('automated and agent trades cannot bypass execution policy', () => {
    const noMode = validateTradeIntent({
      symbol: '600519',
      price: 100,
      source: 'automation',
      riskApproved: true,
    }, 100, 100, 'buy');
    assert.equal(noMode.ok, false);
    assert.match(noMode.error, /paper_execution/);

    const directAgent = validateTradeIntent({
      symbol: '600519',
      price: 100,
      source: 'agent',
      mode: 'paper_execution',
      riskApproved: true,
    }, 100, 100, 'buy');
    assert.equal(directAgent.ok, false);
    assert.match(directAgent.error, /Agent/);
  });
});

describe('Portfolio analytics', () => {
  test('computes NAV exposure and concentration deterministically', () => {
    const analytics = buildPortfolioAnalyticsFromSummary({
      totalAssets: '200000.00',
      holdingValue: '80000.00',
      balance: '120000.00',
      cash: { total: '120000.00' },
      totalUnrealizedPnL: '5000.00',
      todayRealizedPnL: '120.00',
      pendingOrders: [{ id: 'o1' }],
      holdings: [
        { symbol: '600519', name: '贵州茅台', marketValueCNY: 50000, costBasisCNY: 46000 },
        { symbol: '000001', name: '平安银行', marketValueCNY: 30000, costBasisCNY: 29000 },
      ],
    });

    assert.equal(analytics.nav, '200000.00');
    assert.equal(analytics.exposurePct, 40);
    assert.equal(analytics.cashPct, 60);
    assert.equal(analytics.concentrationTop1Pct, 25);
    assert.equal(analytics.largestPosition.symbol, '600519');
    assert.equal(analytics.dailySummary.pendingOrders, 1);
  });
});

describe('HTTP commercial hardening', () => {
  test('security headers include clickjacking and CSP protections', () => {
    const headers = {};
    const res = { setHeader: (key, value) => { headers[key] = value; } };
    securityHeaders({}, res, () => {});

    assert.equal(headers['X-Content-Type-Options'], 'nosniff');
    assert.equal(headers['X-Frame-Options'], 'DENY');
    assert.match(headers['Content-Security-Policy'], /frame-ancestors 'none'/);
  });

  test('API rate limiter returns 429 after configured threshold', () => {
    const limiter = createRateLimiter({ rateLimitWindowMs: 60000, rateLimitMaxRequests: 1 });
    const req = { path: '/market', ip: '127.0.0.1', socket: {}, requestId: 'req_limit_test' };
    const first = invokeMiddleware(limiter, req);
    const second = invokeMiddleware(limiter, req);

    assert.equal(first.nextCalled, true);
    assert.equal(second.statusCode, 429);
    assert.equal(second.body.code, 'RATE_LIMITED');
    assert.ok(Number(second.headers['Retry-After']) >= 1);
  });
});

function invokeMiddleware(middleware, req) {
  const result = { headers: {}, nextCalled: false, statusCode: null, body: null };
  const res = {
    setHeader(key, value) { result.headers[key] = value; },
    status(code) {
      result.statusCode = code;
      return this;
    },
    json(body) {
      result.body = body;
      return this;
    },
  };
  middleware(req, res, () => { result.nextCalled = true; });
  return result;
}
