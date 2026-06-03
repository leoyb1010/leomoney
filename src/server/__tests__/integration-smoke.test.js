const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { fetchHeadlines, ruleBasedSummary } = require('../../../lib/intelSources');
const { categoryLabel, PRODUCT_TAGLINE, buildQuoteStatus } = require('../../../lib/displayLabels');
const { parseBinanceSymbol } = require('../../../lib/binance');

describe('Integration smoke (offline)', () => {
  it('fetchHeadlines returns real news titles', async () => {
    const r = await fetchHeadlines({ query: '流动性', symbol: 'BTCUSDT', category: 'crypto' });
    assert.ok(r.news.length >= 3, `expected news, got ${r.news.length}`);
    assert.ok(r.news[0].title?.length > 5);
    assert.equal(r.meta.googleEn >= 1, true);
  });

  it('ruleBasedSummary works without LLM', () => {
    const s = ruleBasedSummary({
      query: '测试',
      quote: { symbol: 'TEST', price: 100, changePercent: 1.2 },
      news: [{ title: '头条一' }, { title: '头条二' }],
      search: [],
    });
    assert.ok(s.summary.includes('头条'));
    assert.ok(s.confidence > 0);
  });

  it('display labels avoid exchange brands in UI copy', () => {
    assert.equal(categoryLabel('usstocks'), '美股');
    assert.equal(categoryLabel('crypto'), '加密');
    assert.ok(!PRODUCT_TAGLINE.includes('币安'));
    assert.ok(PRODUCT_TAGLINE.includes('美股'));
    const qs = buildQuoteStatus({ us: { isOpen: true }, a: { isOpen: false } });
    assert.equal(qs.usstocks.source, '美股行情');
    assert.equal(qs.crypto.source, '加密行情');
  });

  it('parses digital asset symbols', () => {
    const p = parseBinanceSymbol('ETHUSDT.P');
    assert.equal(p.product, 'usdt_perp');
    assert.equal(p.symbol, 'ETHUSDT');
  });
});
