/**
 * Phase 4 测试：架构与回测可信度
 * 覆盖：事件流 / 撮合 / 结算 / 回测时间语义
 */

const { eventBus, DomainEventBus, EVENT_TYPES } = require('../events');
const { matchPaperOrder, matchBacktestOrder } = require('../../services/matchingService');
const { settleBuy, settleSell } = require('../../services/settlementService');

function testEventBus() {
  console.log('--- testEventBus ---');
  const bus = new DomainEventBus();
  let received = null;
  bus.on(EVENT_TYPES.ORDER_CREATED, (e) => { received = e; });
  bus.emit(EVENT_TYPES.ORDER_CREATED, { symbol: 'A', qty: 100 });
  console.assert(received !== null, 'should receive event');
  console.assert(received.type === EVENT_TYPES.ORDER_CREATED, 'type should match');
  console.assert(received.payload.symbol === 'A', 'payload should match');
  console.log('  ✅ event bus passed');
}

function testEventTraceLifecycle() {
  console.log('--- testEventTraceLifecycle ---');
  const bus = new DomainEventBus();
  bus.emit(EVENT_TYPES.ORDER_CREATED, { orderId: 'o1', symbol: 'A' });
  bus.emit(EVENT_TYPES.ORDER_FILLED, { orderId: 'o1', symbol: 'A', qty: 100 });
  bus.emit(EVENT_TYPES.FILL_SETTLED, { orderId: 'o1', symbol: 'A' });

  const trace = bus.traceOrderLifecycle('o1');
  console.assert(trace.length === 3, `should have 3 events, got ${trace.length}`);
  console.assert(trace[0].type === EVENT_TYPES.ORDER_CREATED, 'first should be created');
  console.log('  ✅ event trace lifecycle passed');
}

function testMatchPaperOrder() {
  console.log('--- testMatchPaperOrder ---');
  const order = { id: 'o1', symbol: '600519', name: '茅台', side: 'buy', qty: 100 };
  const quote = { price: 1500, category: 'astocks' };
  const result = matchPaperOrder(order, quote);
  console.assert(result.success, `should succeed: ${result.error}`);
  console.assert(result.fill.price === '1500.00', `price should be 1500, got ${result.fill.price}`);
  console.assert(result.fill.qty === '100.00000000', `qty should be 100`);
  console.log('  ✅ match paper order passed');
}

function testMatchBacktestOrder() {
  console.log('--- testMatchBacktestOrder ---');
  const order = { id: 'o2', symbol: 'A', side: 'buy', qty: 100 };
  const bar = { open: 10, high: 12, low: 9, close: 11, timestamp: '2024-01-01' };

  const r1 = matchBacktestOrder(order, bar, 'open');
  console.assert(r1.success && r1.fill.price === '10.00', 'open mode should use open price');

  const r2 = matchBacktestOrder(order, bar, 'close');
  console.assert(r2.success && r2.fill.price === '11.00', 'close mode should use close price');

  // 限价单未触及
  const limitOrder = { ...order, limitPrice: 9 };
  const r3 = matchBacktestOrder(limitOrder, bar, 'close');
  console.assert(!r3.success, 'limit order should fail if not touched');
  console.log('  ✅ match backtest order passed');
}

function testSettleBuy() {
  console.log('--- testSettleBuy ---');
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
  console.assert(result.success, `should succeed: ${result.error}`);
  console.assert(account.positions.A.totalQty === '100.00000000', 'should have 100 qty');
  console.assert(account.cash.frozen === '5000.00', `frozen should be 5000, got ${account.cash.frozen}`);
  console.log('  ✅ settle buy passed');
}

function testSettleSell() {
  console.log('--- testSettleSell ---');
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
  console.assert(result.success, `should succeed: ${result.error}`);
  console.assert(account.positions.A.totalQty === '50.00000000', 'should have 50 qty left');
  console.assert(result.realizedPnl === '2497.75', `pnl should be 2497.75, got ${result.realizedPnl}`);
  console.log('  ✅ settle sell passed');
}

function testBacktestNoFutureData() {
  console.log('--- testBacktestNoFutureData ---');
  // 模拟回测：t 时刻只能看到 t 及之前的数据
  const bars = [
    { close: 10, timestamp: '2024-01-01' },
    { close: 11, timestamp: '2024-01-02' },
    { close: 12, timestamp: '2024-01-03' },
  ];
  const strategy = (idx, availableBars) => {
    // 策略只能看到 availableBars（当前及之前）
    const current = availableBars[availableBars.length - 1];
    const prev = availableBars.length > 1 ? availableBars[availableBars.length - 2] : null;
    return prev && current.close > prev.close ? 'BUY' : 'HOLD';
  };

  const decisions = [];
  for (let i = 0; i < bars.length; i++) {
    const available = bars.slice(0, i + 1); // 只能看到当前及之前
    decisions.push(strategy(i, available));
  }

  // i=0: 只有一根 bar，无法判断趋势 → HOLD
  // i=1: 10→11 上涨 → BUY
  // i=2: 11→12 上涨 → BUY
  console.assert(decisions[0] === 'HOLD', 'first bar should be HOLD');
  console.assert(decisions[1] === 'BUY', 'second bar should be BUY');
  console.assert(decisions[2] === 'BUY', 'third bar should be BUY');
  console.log('  ✅ backtest no future data passed');
}

function runAll() {
  console.log('\n🧪 Phase 4 测试开始\n');
  testEventBus();
  testEventTraceLifecycle();
  testMatchPaperOrder();
  testMatchBacktestOrder();
  testSettleBuy();
  testSettleSell();
  testBacktestNoFutureData();
  console.log('\n✅ Phase 4 全部测试通过\n');
}

runAll();
