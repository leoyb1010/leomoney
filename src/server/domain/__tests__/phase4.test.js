/**
 * Phase 4 测试：架构与回测可信度
 * 覆盖：事件流 / 撮合 / 结算 / 回测时间语义
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { eventBus, DomainEventBus, EVENT_TYPES } = require('../events');
const { matchPaperOrder, matchBacktestOrder } = require('../../services/matchingService');
const { settleBuy, settleSell } = require('../../services/settlementService');

describe('Phase 4: 事件总线', () => {
  test('事件收发', () => {
    const bus = new DomainEventBus();
    let received = null;
    bus.on(EVENT_TYPES.ORDER_CREATED, (e) => { received = e; });
    bus.emit(EVENT_TYPES.ORDER_CREATED, { symbol: 'A', qty: 100 });
    assert.ok(received !== null, 'should receive event');
    assert.strictEqual(received.type, EVENT_TYPES.ORDER_CREATED, 'type should match');
    assert.strictEqual(received.payload.symbol, 'A', 'payload should match');
  });

  test('订单生命周期追踪', () => {
    const bus = new DomainEventBus();
    bus.emit(EVENT_TYPES.ORDER_CREATED, { orderId: 'o1', symbol: 'A' });
    bus.emit(EVENT_TYPES.ORDER_FILLED, { orderId: 'o1', symbol: 'A', qty: 100 });
    bus.emit(EVENT_TYPES.FILL_SETTLED, { orderId: 'o1', symbol: 'A' });
    const trace = bus.traceOrderLifecycle('o1');
    assert.strictEqual(trace.length, 3, `should have 3 events, got ${trace.length}`);
    // 事件按时间倒序返回，最后一个是 CREATED
    assert.strictEqual(trace[2].type, EVENT_TYPES.ORDER_CREATED, 'last should be created');
  });
});

describe('Phase 4: 撮合引擎', () => {
  test('Paper 撮合', () => {
    const order = { id: 'o1', symbol: '600519', name: '茅台', side: 'buy', qty: 100 };
    const quote = { price: 1500, category: 'astocks' };
    const result = matchPaperOrder(order, quote);
    assert.ok(result.success, `should succeed: ${result.error}`);
    assert.strictEqual(result.fill.price, '1500.00', `price should be 1500, got ${result.fill.price}`);
    assert.strictEqual(result.fill.qty, '100.00000000', `qty should be 100`);
  });

  test('Backtest 撮合（open/close/限价）', () => {
    const order = { id: 'o2', symbol: 'A', side: 'buy', qty: 100 };
    const bar = { open: 10, high: 12, low: 9, close: 11, timestamp: '2024-01-01' };

    const r1 = matchBacktestOrder(order, bar, 'open');
    assert.ok(r1.success && r1.fill.price === '10.00', 'open mode should use open price');

    const r2 = matchBacktestOrder(order, bar, 'close');
    assert.ok(r2.success && r2.fill.price === '11.00', 'close mode should use close price');

    // 限价单未触及
    const limitOrder = { ...order, limitPrice: 9 };
    const r3 = matchBacktestOrder(limitOrder, bar, 'close');
    assert.ok(!r3.success, 'limit order should fail if not touched');
  });
});

describe('Phase 4: 结算服务', () => {
  test('settleBuy', () => {
    const account = {
      id: 'acc1',
      cash: { available: '100000.00', frozen: '15000.00', total: '115000.00' },
      positions: {},
      history: [],
    };
    const fill = {
      symbol: 'A', name: 'Test', price: 100, qty: 100,
      totalAmount: '10000.00', fee: '3.00', orderId: 'o1',
    };
    const result = settleBuy(account, fill);
    assert.ok(result.success, `should succeed: ${result.error}`);
    assert.strictEqual(account.positions.A.totalQty, '100.00000000', 'should have 100 qty');
    assert.strictEqual(account.cash.frozen, '4997.00', `frozen should be 4997 (15000-10000-fee), got ${account.cash.frozen}`);
  });

  test('settleSell', () => {
    const account = {
      id: 'acc1',
      cash: { available: '100000.00', frozen: '0.00', total: '100000.00' },
      positions: {
        A: { symbol: 'A', totalQty: '100.00000000', sellableQty: '100.00000000', frozenQty: '0.00000000', avgCost: '100.00', realizedPnl: '0.00' },
      },
      history: [],
    };
    const fill = {
      symbol: 'A', name: 'Test', price: 150, qty: 50,
      totalAmount: '7500.00', fee: '2.25', orderId: 'o2',
    };
    const result = settleSell(account, fill);
    assert.ok(result.success, `should succeed: ${result.error}`);
    assert.strictEqual(account.positions.A.totalQty, '50.00000000', 'should have 50 qty left');
    assert.strictEqual(result.realizedPnl, '2497.75', `pnl should be 2497.75, got ${result.realizedPnl}`);
  });
});

describe('Phase 4: 回测时间语义', () => {
  test('不能看到未来数据', () => {
    const bars = [
      { close: 10, timestamp: '2024-01-01' },
      { close: 11, timestamp: '2024-01-02' },
      { close: 12, timestamp: '2024-01-03' },
    ];
    const strategy = (idx, availableBars) => {
      const current = availableBars[availableBars.length - 1];
      const prev = availableBars.length > 1 ? availableBars[availableBars.length - 2] : null;
      return prev && current.close > prev.close ? 'BUY' : 'HOLD';
    };

    const decisions = [];
    for (let i = 0; i < bars.length; i++) {
      const available = bars.slice(0, i + 1);
      decisions.push(strategy(i, available));
    }

    assert.strictEqual(decisions[0], 'HOLD', 'first bar should be HOLD');
    assert.strictEqual(decisions[1], 'BUY', 'second bar should be BUY');
    assert.strictEqual(decisions[2], 'BUY', 'third bar should be BUY');
  });
});
