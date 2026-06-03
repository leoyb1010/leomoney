const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('Research Desk builds grounded multi-role report without direct execution', () => {
  const { buildResearchFromContext } = require('../../../lib/agent/research/researchDesk');
  const { getDefaultResearchConfig } = require('../../../lib/agent/research/memory');
  const context = {
    symbol: 'NVDA',
    quote: {
      symbol: 'NVDA',
      name: 'NVIDIA',
      price: 120,
      prevClose: 116,
      open: 117,
      high: 122,
      low: 116,
      changePercent: 3.45,
      volume: 1000000,
      category: 'usstocks',
      currency: 'USD',
      source: 'fixture',
      dataQuality: { isSynthetic: false, source: 'fixture', note: 'test quote' },
    },
    benchmark: { symbol: 'QQQ', price: 500, prevClose: 495, changePercent: 1 },
    account: { accountId: 'acc_test', cashAvailable: 100000, cashTotal: 100000, positionCount: 0 },
    position: null,
    intel: {
      news: [{ title: 'NVIDIA upgrade after strong AI demand', source: 'fixture' }],
      search: [{ title: 'AI chip demand remains strong', snippet: 'record demand and inflow', url: 'https://example.com' }],
      sourceConfigured: true,
    },
    memory: [],
    sources: { quote: 'fixture', news: 'fixture', search: 'fixture', memory: 'fixture' },
  };

  const result = buildResearchFromContext(context, getDefaultResearchConfig());
  assert.equal(result.analysts.length, 4);
  assert.equal(result.debate.bullResearcher.role, 'bull_researcher');
  assert.equal(result.debate.bearResearcher.role, 'bear_researcher');
  assert.equal(result.manager.role, 'research_manager');
  assert.equal(result.traderDraft.role, 'trader');
  assert.equal(result.portfolioManager.role, 'portfolio_manager');
  assert.match(result.portfolioManager.boundary, /不能直接执行交易/);
  assert.ok(result.boundaries.some(item => item.includes('不强制翻译')));
});

test('Research memory and config persist in LEOMONEY_DATA_DIR', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'leomoney-research-'));
  const previous = process.env.LEOMONEY_DATA_DIR;
  process.env.LEOMONEY_DATA_DIR = tmp;
  try {
    const { appendMemory, getMemory, getResearchConfig, updateResearchConfig } = require('../../../lib/agent/research/memory');
    const updated = updateResearchConfig({ debateRounds: 2, benchmarkMap: { usstocks: 'SPY' } });
    assert.equal(updated.debateRounds, 2);
    assert.equal(getResearchConfig().benchmarkMap.usstocks, 'SPY');

    appendMemory('AAPL', { runId: 'research_fixture', verdict: 'inline', alphaPct: 0.4, lessons: ['复查新闻证据质量'] });
    const rows = getMemory('AAPL');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].symbol, 'AAPL');
    assert.equal(rows[0].verdict, 'inline');
  } finally {
    if (previous === undefined) delete process.env.LEOMONEY_DATA_DIR;
    else process.env.LEOMONEY_DATA_DIR = previous;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
