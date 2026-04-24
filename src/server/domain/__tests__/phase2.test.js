/**
 * Phase 2 测试：Agent 决策链路可靠性
 * 覆盖：observationBuilder / schema 解析 / audit / 风控闭环
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { parseAgentAction, makeHoldAction } = require('../../../../lib/agent/schema');

describe('Phase 2: Schema 解析', () => {
  test('有效 JSON 解析', () => {
    const raw = JSON.stringify({ action: 'BUY', symbol: '600519', qty: 100, confidence: 0.85, thesis: '看好', riskNotes: [] });
    const r = parseAgentAction(raw);
    assert.ok(r.success, `should succeed: ${r.error}`);
    assert.strictEqual(r.action.action, 'BUY', 'action should be BUY');
    assert.strictEqual(r.action.confidence, 0.85, 'confidence should be 0.85');
  });

  test('无效 JSON 降级 HOLD', () => {
    const r = parseAgentAction('not json at all');
    assert.ok(!r.success, 'should fail');
    assert.strictEqual(r.action.action, 'HOLD', 'should downgrade to HOLD');
    assert.ok(r.error.includes('JSON'), `error should mention JSON: ${r.error}`);
  });

  test('非法动作降级 HOLD', () => {
    const raw = JSON.stringify({ action: 'HODL', symbol: '600519', qty: 100, confidence: 0.9 });
    const r = parseAgentAction(raw);
    assert.ok(!r.success, 'should fail');
    assert.strictEqual(r.action.action, 'HOLD', 'should downgrade to HOLD');
  });

  test('置信度超范围降级 HOLD', () => {
    // confidence=150 → /100=1.5 → 仍 >1 → 非法
    const raw = JSON.stringify({ action: 'BUY', symbol: '600519', qty: 100, confidence: 150 });
    const r = parseAgentAction(raw);
    assert.ok(!r.success, 'should fail');
    assert.strictEqual(r.action.action, 'HOLD', 'should downgrade to HOLD');
  });

  test('代码块 JSON 解析', () => {
    const raw = '```json\n{"action":"SELL","symbol":"AAPL","qty":10,"confidence":0.75,"thesis":"test"}\n```';
    const r = parseAgentAction(raw);
    assert.ok(r.success, `should succeed: ${r.error}`);
    assert.strictEqual(r.action.action, 'SELL', 'action should be SELL');
  });

  test('混合文本中 JSON 解析', () => {
    const raw = '分析如下：我认为应该买入。\n```json\n{"action":"BUY","symbol":"000001","qty":500,"confidence":0.8,"thesis":"看好"}\n```\n以上是我的建议。';
    const r = parseAgentAction(raw);
    assert.ok(r.success, `should succeed: ${r.error}`);
    assert.strictEqual(r.action.action, 'BUY', 'action should be BUY');
  });

  test('BUY 缺少 symbol', () => {
    const raw = JSON.stringify({ action: 'BUY', qty: 100, confidence: 0.9 });
    const r = parseAgentAction(raw);
    assert.ok(!r.success, 'should fail');
    assert.ok(r.error.includes('symbol'), 'error should mention symbol');
  });

  test('makeHoldAction', () => {
    const a = makeHoldAction('test reason');
    assert.strictEqual(a.action, 'HOLD', 'should be HOLD');
    assert.strictEqual(a.confidence, 0, 'confidence should be 0');
    assert.ok(a.thesis.includes('test reason'), 'thesis should contain reason');
  });
});
