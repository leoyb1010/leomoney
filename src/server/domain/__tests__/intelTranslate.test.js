const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  isMostlyEnglish,
  glossaryTranslate,
  localizeTitleSync,
  localizeIntelItems,
} = require('../../../../lib/intelTranslate');

describe('intelTranslate', () => {
  it('detects English vs Chinese titles', () => {
    assert.equal(isMostlyEnglish('Bitcoin surges to record high'), true);
    assert.equal(isMostlyEnglish('比特币创历史新高'), false);
  });

  it('glossary translates common finance terms', () => {
    const zh = glossaryTranslate('Bitcoin hits record high as Fed holds rates');
    assert.ok(zh.includes('比特币'));
    assert.ok(zh.includes('美联储') || zh.includes('Fed'));
  });

  it('localizeTitleSync keeps Chinese as-is', () => {
    const r = localizeTitleSync('美联储维持利率不变');
    assert.equal(r.titleZh, '美联储维持利率不变');
    assert.equal(r.titleEn, null);
  });

  it('localizeIntelItems maps batch without LLM', async () => {
    const items = await localizeIntelItems([
      { title: 'Ethereum price rally continues', source: 'test' },
      { title: '以太坊网络升级完成', source: 'test' },
    ]);
    assert.ok(items[0].titleZh || items[0].title);
    assert.equal(items[1].titleZh, '以太坊网络升级完成');
  });
});