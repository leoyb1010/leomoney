/**
 * Phase 3 测试：风控与异常处理
 * 覆盖：position FIFO / metrics 最大回撤 / riskControlService
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { consumeLotsFIFO, 计算持仓, 计算盈亏明细 } = require('../../../analytics/position');
const { 计算指标, 计算最大回撤 } = require('../../../analytics/metrics');
const { RiskControlService } = require('../../services/riskControlService');

describe('Phase 3: FIFO 成本计算', () => {
  test('FIFO 先进先出', () => {
    const lots = [{ price: 10, qty: '100' }, { price: 12, qty: '100' }];
    const result = consumeLotsFIFO(lots, 150);
    // 先消耗 100@10=1000，再消耗 50@12=600，总成本 1600
    assert.ok(result.cost.eq(1600), `FIFO cost should be 1600, got ${result.cost}`);
    assert.strictEqual(result.remainingLots.length, 1, 'should have 1 remaining lot');
    assert.strictEqual(result.remainingLots[0].qty, '50.00000000', `remaining should be 50, got ${result.remainingLots[0].qty}`);
  });

  test('FIFO 超卖', () => {
    const lots = [{ price: 10, qty: '100' }];
    assert.throws(() => {
      consumeLotsFIFO(lots, 200);
    }, (err) => {
      assert.ok(err.message.includes('超卖'), `should mention 超卖: ${err.message}`);
      return true;
    });
  });
});

describe('Phase 3: 持仓计算', () => {
  test('多笔交易持仓', () => {
    const trades = [
      { type: 'buy', symbol: 'A', price: 10, qty: 100, time: '2024-01-01' },
      { type: 'buy', symbol: 'A', price: 12, qty: 100, time: '2024-01-02' },
      { type: 'sell', symbol: 'A', price: 15, qty: 150, time: '2024-01-03' },
    ];
    const pos = 计算持仓(trades, 'A');
    assert.strictEqual(pos.数量, '50.00000000', `qty should be 50, got ${pos.数量}`);
    assert.strictEqual(pos.平均成本, '12.00', `avgCost should be 12, got ${pos.平均成本}`);
  });
});

describe('Phase 3: 最大回撤', () => {
  test('权益曲线回撤', () => {
    // 权益曲线：100000 → 110000 → 105000 → 120000 → 115000
    const curve = [100000, 110000, 105000, 120000, 115000];
    const dd = 计算最大回撤(curve);
    // 峰值 110000 到 105000，回撤 -4.545%
    assert.ok(dd !== null, 'dd should not be null');
    assert.ok(dd < 0, 'dd should be negative');
    assert.ok(Math.abs(dd - (-0.04545)) < 0.001, `dd should be ~-4.545%, got ${dd}`);
  });
});

describe('Phase 3: 指标与权益曲线', () => {
  test('计算指标', () => {
    const trades = [
      { type: 'buy', symbol: 'A', price: 10, qty: 100, time: '2024-01-01' },
      { type: 'sell', symbol: 'A', price: 15, qty: 100, time: '2024-01-02', fee: 5 },
      { type: 'buy', symbol: 'B', price: 20, qty: 50, time: '2024-01-03' },
      { type: 'sell', symbol: 'B', price: 18, qty: 50, time: '2024-01-04', fee: 5 },
    ];
    const result = 计算指标(trades, 100000);
    assert.strictEqual(result.交易次数, 2, `should have 2 completed trades, got ${result.交易次数}`);
    assert.strictEqual(result.权益曲线.length, 3, `equity curve should have 3 points, got ${result.权益曲线.length}`);
    assert.strictEqual(result.权益曲线[0], 100000, 'first equity should be initial');
  });
});

describe('Phase 3: 风控服务', () => {
  test('大额交易硬拒绝', () => {
    const svc = new RiskControlService();
    svc.updateConfig({ maxSingleTradeAmount: 50000 });
    const account = {
      cash: { available: 100000, total: 100000 },
      positions: {},
      pendingOrders: [],
    };
    const result = svc.preTradeCheck(
      { side: 'BUY', symbol: 'A', price: 1000, qty: 100, category: 'astocks' },
      { isTradable: true, inTradingSession: true }
    );
    assert.strictEqual(result.allowed, false, 'should reject large trade');
    assert.strictEqual(result.level, 'HARD_REJECT', 'should be HARD_REJECT');
    assert.ok(result.machineCode.includes('SINGLE_TRADE_AMOUNT_LIMIT'), `should have SINGLE_TRADE_AMOUNT_LIMIT, got ${result.machineCode}`);
  });

  test('小额交易通过', () => {
    const svc = new RiskControlService();
    const result = svc.preTradeCheck(
      { side: 'BUY', symbol: 'A', price: 10, qty: 100, category: 'astocks' },
      { isTradable: true, inTradingSession: true }
    );
    assert.strictEqual(result.allowed, true, 'should allow small trade');
    assert.strictEqual(result.level, 'PASS', 'should be PASS');
  });
});
