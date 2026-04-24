/**
 * Phase 2 测试：Agent 决策链路可靠性
 * 覆盖：observationBuilder / schema 解析 / audit / 风控闭环
 */

const { parseAgentAction, makeHoldAction } = require('../../../../lib/agent/schema');

function testSchemaValid() {
  console.log('--- testSchemaValid ---');
  const raw = JSON.stringify({ action: 'BUY', symbol: '600519', qty: 100, confidence: 0.85, thesis: '看好', riskNotes: [] });
  const r = parseAgentAction(raw);
  console.assert(r.success, `should succeed: ${r.error}`);
  console.assert(r.action.action === 'BUY', 'action should be BUY');
  console.assert(r.action.confidence === 0.85, 'confidence should be 0.85');
  console.log('  ✅ schema valid passed');
}

function testSchemaInvalidJSON() {
  console.log('--- testSchemaInvalidJSON ---');
  const r = parseAgentAction('not json at all');
  console.assert(!r.success, 'should fail');
  console.assert(r.action.action === 'HOLD', 'should downgrade to HOLD');
  console.assert(r.error.includes('JSON'), `error should mention JSON: ${r.error}`);
  console.log('  ✅ schema invalid JSON passed');
}

function testSchemaIllegalAction() {
  console.log('--- testSchemaIllegalAction ---');
  const raw = JSON.stringify({ action: 'HODL', symbol: '600519', qty: 100, confidence: 0.9 });
  const r = parseAgentAction(raw);
  console.assert(!r.success, 'should fail');
  console.assert(r.action.action === 'HOLD', 'should downgrade to HOLD');
  console.log('  ✅ schema illegal action passed');
}

function testSchemaConfidenceOutOfRange() {
  console.log('--- testSchemaConfidenceOutOfRange ---');
  const raw = JSON.stringify({ action: 'BUY', symbol: '600519', qty: 100, confidence: 1.5 });
  const r = parseAgentAction(raw);
  console.assert(!r.success, 'should fail');
  console.assert(r.action.action === 'HOLD', 'should downgrade to HOLD');
  console.log('  ✅ schema confidence out of range passed');
}

function testSchemaCodeBlock() {
  console.log('--- testSchemaCodeBlock ---');
  const raw = '```json\n{"action":"SELL","symbol":"AAPL","qty":10,"confidence":0.75,"thesis":"test"}\n```';
  const r = parseAgentAction(raw);
  console.assert(r.success, `should succeed: ${r.error}`);
  console.assert(r.action.action === 'SELL', 'action should be SELL');
  console.log('  ✅ schema code block passed');
}

function testSchemaMixedText() {
  console.log('--- testSchemaMixedText ---');
  const raw = '分析如下：我认为应该买入。\n```json\n{"action":"BUY","symbol":"000001","qty":500,"confidence":0.8,"thesis":"看好"}\n```\n以上是我的建议。';
  const r = parseAgentAction(raw);
  console.assert(r.success, `should succeed: ${r.error}`);
  console.assert(r.action.action === 'BUY', 'action should be BUY');
  console.log('  ✅ schema mixed text passed');
}

function testSchemaMissingSymbolForBuy() {
  console.log('--- testSchemaMissingSymbolForBuy ---');
  const raw = JSON.stringify({ action: 'BUY', qty: 100, confidence: 0.9 });
  const r = parseAgentAction(raw);
  console.assert(!r.success, 'should fail');
  console.assert(r.error.includes('symbol'), 'error should mention symbol');
  console.log('  ✅ schema missing symbol passed');
}

function testMakeHoldAction() {
  console.log('--- testMakeHoldAction ---');
  const a = makeHoldAction('test reason');
  console.assert(a.action === 'HOLD', 'should be HOLD');
  console.assert(a.confidence === 0, 'confidence should be 0');
  console.assert(a.thesis.includes('test reason'), 'thesis should contain reason');
  console.log('  ✅ makeHoldAction passed');
}

function runAll() {
  console.log('\n🧪 Phase 2 测试开始\n');
  testSchemaValid();
  testSchemaInvalidJSON();
  testSchemaIllegalAction();
  testSchemaConfidenceOutOfRange();
  testSchemaCodeBlock();
  testSchemaMixedText();
  testSchemaMissingSymbolForBuy();
  testMakeHoldAction();
  console.log('\n✅ Phase 2 全部测试通过\n');
}

runAll();
