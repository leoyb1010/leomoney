/**
 * Phase 3 测试：风控与异常处理
 * 覆盖：position FIFO / metrics 最大回撤 / riskControlService
 */

const { consumeLotsFIFO, 计算持仓, 计算盈亏明细 } = require('../../../analytics/position');
const { 计算指标, 计算最大回撤 } = require('../../../analytics/metrics');
const { RiskControlService } = require('../../services/riskControlService');

function testFIFOCost() {
  console.log('--- testFIFOCost ---');
  const lots = [{ price: 10, qty: '100' }, { price: 12, qty: '100' }];
  const result = consumeLotsFIFO(lots, 150);
  // 先消耗 100@10=1000，再消耗 50@12=600，总成本 1600
  console.assert(result.cost.eq(1600), `FIFO cost should be 1600, got ${result.cost}`);
  console.assert(result.remainingLots.length === 1, 'should have 1 remaining lot');
  console.assert(result.remainingLots[0].qty === '50.00000000', `remaining should be 50, got ${result.remainingLots[0].qty}`);
  console.log('  ✅ FIFO cost passed');
}

function testFIFOOversell() {
  console.log('--- testFIFOOversell ---');
  const lots = [{ price: 10, qty: '100' }];
  let threw = false;
  try {
    consumeLotsFIFO(lots, 200);
  } catch (e) {
    threw = true;
    console.assert(e.message.includes('超卖'), `should mention 超卖: ${e.message}`);
  }
  console.assert(threw, 'should throw on oversell');
  console.log('  ✅ FIFO oversell passed');
}

function testPositionWithTrades() {
  console.log('--- testPositionWithTrades ---');
  const trades = [
    { type: 'buy', symbol: 'A', price: 10, qty: 100, time: '2024-01-01' },
    { type: 'buy', symbol: 'A', price: 12, qty: 100, time: '2024-01-02' },
    { type: 'sell', symbol: 'A', price: 15, qty: 150, time: '2024-01-03' },
  ];
  const pos = 计算持仓(trades, 'A');
  console.assert(pos.数量 === '50.00000000', `qty should be 50, got ${pos.数量}`);
  console.assert(pos.平均成本 === '12.00', `avgCost should be 12, got ${pos.平均成本}`);
  console.log('  ✅ position with trades passed');
}

function testMaxDrawdown() {
  console.log('--- testMaxDrawdown ---');
  // 权益曲线：100000 → 110000 → 105000 → 120000 → 115000
  const curve = [100000, 110000, 105000, 120000, 115000];
  const dd = 计算最大回撤(curve);
  // 峰值 110000 到 105000，回撤 -4.545%
  console.assert(dd !== null, 'dd should not be null');
  console.assert(dd < 0, 'dd should be negative');
  console.assert(Math.abs(dd - (-0.04545)) < 0.001, `dd should be ~-4.545%, got ${dd}`);
  console.log('  ✅ max drawdown passed');
}

function testMetricsEquityCurve() {
  console.log('--- testMetricsEquityCurve ---');
  const trades = [
    { type: 'buy', symbol: 'A', price: 10, qty: 100, time: '2024-01-01' },
    { type: 'sell', symbol: 'A', price: 15, qty: 100, time: '2024-01-02', fee: 5 },
    { type: 'buy', symbol: 'B', price: 20, qty: 50, time: '2024-01-03' },
    { type: 'sell', symbol: 'B', price: 18, qty: 50, time: '2024-01-04', fee: 5 },
  ];
  const result = 计算指标(trades, 100000);
  console.assert(result.交易次数 === 2, `should have 2 completed trades, got ${result.交易次数}`);
  console.assert(result.权益曲线.length === 3, `equity curve should have 3 points, got ${result.权益曲线.length}`);
  console.assert(result.权益曲线[0] === 100000, 'first equity should be initial');
  console.log('  ✅ metrics equity curve passed');
}

function testRiskControlHardReject() {
  console.log('--- testRiskControlHardReject ---');
  const svc = new RiskControlService();
  svc.updateConfig({ maxSingleTradeAmount: 50000 });

  // Mock account
  const account = {
    cash: { available: 100000, total: 100000 },
    positions: {},
    pendingOrders: [],
  };
  // 直接测逻辑（不依赖 getAccount）
  const result = svc.preTradeCheck(
    { side: 'BUY', symbol: 'A', price: 1000, qty: 100, category: 'astocks' },
    { isTradable: true, inTradingSession: true }
  );
  console.assert(result.allowed === false, 'should reject large trade');
  console.assert(result.level === 'HARD_REJECT', 'should be HARD_REJECT');
  console.assert(result.machineCode.includes('SINGLE_TRADE_AMOUNT_LIMIT'), `should have SINGLE_TRADE_AMOUNT_LIMIT, got ${result.machineCode}`);
  console.log('  ✅ risk control hard reject passed');
}

function testRiskControlPass() {
  console.log('--- testRiskControlPass ---');
  const svc = new RiskControlService();
  const result = svc.preTradeCheck(
    { side: 'BUY', symbol: 'A', price: 10, qty: 100, category: 'astocks' },
    { isTradable: true, inTradingSession: true }
  );
  console.assert(result.allowed === true, 'should allow small trade');
  console.assert(result.level === 'PASS', 'should be PASS');
  console.log('  ✅ risk control pass passed');
}

function runAll() {
  console.log('\n🧪 Phase 3 测试开始\n');
  testFIFOCost();
  testFIFOOversell();
  testPositionWithTrades();
  testMaxDrawdown();
  testMetricsEquityCurve();
  testRiskControlHardReject();
  testRiskControlPass();
  console.log('\n✅ Phase 3 全部测试通过\n');
}

runAll();
