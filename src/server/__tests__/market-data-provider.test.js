const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeKlinePeriod } = require('../../../lib/marketData/periods');
const { getMarketDataPlan } = require('../../../lib/marketData/catalog');
const { getKline } = require('../../../lib/marketData/klineProviders');

describe('Market data provider chain', () => {
  it('normalizes legacy scale parameters to K-line periods', () => {
    assert.equal(normalizeKlinePeriod({ scale: 1 }), '1m');
    assert.equal(normalizeKlinePeriod({ scale: 60 }), '1h');
    assert.equal(normalizeKlinePeriod({ period: '1D' }), '1D');
    assert.equal(normalizeKlinePeriod({ period: 'bad' }), '5m');
  });

  it('exposes free and paid provider runtime status', () => {
    const plan = getMarketDataPlan();
    assert.ok(plan.free.some(provider => provider.id === 'yahoo_chart'));
    assert.ok(plan.paid.some(provider => provider.id === 'alpaca'));
    assert.ok(plan.paid.some(provider => provider.id === 'polygon_massive'));
    const alpaca = plan.paid.find(provider => provider.id === 'alpaca');
    assert.deepEqual(alpaca.env, ['ALPACA_API_KEY', 'ALPACA_API_SECRET']);
    assert.ok(Array.isArray(alpaca.missingEnv));
    assert.equal(plan.chain.includes('local_preview_fallback'), true);
  });

  it('returns a local preview fallback when no provider supports the asset', async () => {
    const quote = {
      symbol: 'TEST',
      name: 'Test Asset',
      category: 'unknown',
      price: 100,
      prevClose: 95,
      open: 98,
      high: 103,
      low: 94,
      volume: 1000,
    };
    const first = await getKline({ quote, period: '1D', limit: 20 });
    assert.equal(first.provider, 'local_preview_fallback');
    assert.equal(first.fallback, true);
    assert.equal(first.points.length, 20);
    assert.equal(first.points.at(-1).close, 100);

    const second = await getKline({ quote, period: '1D', limit: 20 });
    assert.equal(second.cached, true);
    assert.equal(second.points.length, 20);
  });
});
