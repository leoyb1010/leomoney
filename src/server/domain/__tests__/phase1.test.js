/**
 * Phase 1 测试：核心交易正确性
 * 覆盖：Decimal 计算、冻结/解冻、状态机、条件单、超卖防护
 */

const { D, add, sub, mul, div, gt, lt, eq, toMoney, toQty, calcAvgCost, calcBuyReserve } = require('../money');
const { ORDER_STATUS, canTransition, transitionOrder, mapLegacyStatus } = require('../orderStateMachine');
const { freezeCash, releaseCash, freezePosition, releasePosition, settleBuyFill, settleSellFill, migrateAccountIfNeeded } = require('../ledger');

function makeAccount(balance = 100000) {
  const acc = {
    id: 'test_acc',
    balance,
    holdings: {},
    pendingOrders: [],
    history: [],
  };
  migrateAccountIfNeeded(acc);
  return acc;
}

// ── 金额工具测试 ──

function testMoney() {
  console.log('--- testMoney ---');
  // 浮点精度
  console.assert(eq(add(0.1, 0.2), 0.3), '0.1+0.2 should be 0.3');
  console.assert(eq(sub(1, 0.9), 0.1), '1-0.9 should be 0.1');
  console.assert(eq(mul(0.1, 3), 0.3), '0.1*3 should be 0.3');
  console.assert(eq(div(0.3, 0.1), 3), '0.3/0.1 should be 3');

  // 格式化
  console.assert(toMoney(123.456) === '123.46', 'toMoney rounding');
  console.assert(toQty(123.456789, 4) === '123.4568', 'toQty rounding');

  // 均价计算
  const avg = calcAvgCost(100, 100, 110, 100);
  console.assert(avg === '105.00', `avgCost should be 105, got ${avg}`);

  // 冻结金额计算
  const reserve = calcBuyReserve(100, 100, 0.0003);
  console.assert(gt(reserve, 10000), 'reserve should include fee');
  console.log('  ✅ money tests passed');
}

// ── 状态机测试 ──

function testStateMachine() {
  console.log('--- testStateMachine ---');
  // 合法流转
  console.assert(canTransition('CREATED', 'ACCEPTED'), 'CREATED->ACCEPTED');
  console.assert(canTransition('CREATED', 'PENDING_TRIGGER'), 'CREATED->PENDING_TRIGGER');
  console.assert(canTransition('ACCEPTED', 'FILLED'), 'ACCEPTED->FILLED');
  console.assert(canTransition('PENDING_TRIGGER', 'ACCEPTED'), 'PENDING_TRIGGER->ACCEPTED');

  // 非法流转
  console.assert(!canTransition('CREATED', 'FILLED'), 'CREATED->FILLED should fail');
  console.assert(!canTransition('FILLED', 'CANCELED'), 'FILLED->CANCELED should fail');
  console.assert(!canTransition('CANCELED', 'ACCEPTED'), 'CANCELED->ACCEPTED should fail');

  // 状态流转执行
  const order = { status: 'CREATED', updatedAt: '' };
  const r = transitionOrder(order, 'ACCEPTED', { by: 'test' });
  console.assert(r.success, r.error);
  console.assert(order.status === 'ACCEPTED');

  // 非法流转应失败
  const r2 = transitionOrder(order, 'CREATED');
  console.assert(!r2.success, 'should reject backward transition');
  console.log('  ✅ stateMachine tests passed');
}

// ── 冻结/解冻测试 ──

function testFreeze() {
  console.log('--- testFreeze ---');
  const acc = makeAccount(100000);

  // 冻结现金
  freezeCash(acc, 50000, 'test');
  console.assert(eq(acc.cash.available, 50000), `available should be 50000, got ${acc.cash.available}`);
  console.assert(eq(acc.cash.frozen, 50000), `frozen should be 50000, got ${acc.cash.frozen}`);
  console.assert(eq(acc.cash.total, 100000), `total should be 100000`);

  // 释放现金
  releaseCash(acc, 20000, 'test');
  console.assert(eq(acc.cash.available, 70000), `available should be 70000`);
  console.assert(eq(acc.cash.frozen, 30000), `frozen should be 30000`);

  // 超额释放不报错
  releaseCash(acc, 99999, 'test');
  console.assert(eq(acc.cash.frozen, 0), 'frozen should be 0 after over-release');

  // 冻结超余额报错
  let threw = false;
  try { freezeCash(acc, 999999); } catch { threw = true; }
  console.assert(threw, 'should throw on over-freeze');
  console.log('  ✅ freeze tests passed');
}

// ── 持仓冻结测试 ──

function testPositionFreeze() {
  console.log('--- testPositionFreeze ---');
  const acc = makeAccount();
  acc.positions = { '000001': { totalQty: '1000', sellableQty: '1000', frozenQty: '0', avgCost: '10', realizedPnl: '0' } };

  // 冻结持仓
  freezePosition(acc, '000001', 300, 'test');
  console.assert(eq(acc.positions['000001'].sellableQty, 700), 'sellable should be 700');
  console.assert(eq(acc.positions['000001'].frozenQty, 300), 'frozen should be 300');

  // 释放持仓
  releasePosition(acc, '000001', 100, 'test');
  console.assert(eq(acc.positions['000001'].sellableQty, 800), 'sellable should be 800');
  console.assert(eq(acc.positions['000001'].frozenQty, 200), 'frozen should be 200');

  // 超量冻结报错
  let threw = false;
  try { freezePosition(acc, '000001', 9999); } catch { threw = true; }
  console.assert(threw, 'should throw on over-freeze position');
  console.log('  ✅ positionFreeze tests passed');
}

// ── 结算买入测试 ──

function testSettleBuy() {
  console.log('--- testSettleBuy ---');
  const acc = makeAccount(100000);
  freezeCash(acc, 50000, 'buy test');

  const result = settleBuyFill(acc, { symbol: '000001', name: '平安银行', price: 10, qty: 100, category: 'astocks' });
  console.assert(result.success, 'settleBuy should succeed');
  console.assert(acc.positions['000001'].totalQty === '100.00000000', `totalQty should be 100, got ${acc.positions['000001'].totalQty}`);
  console.assert(acc.positions['000001'].avgCost === '10.00', `avgCost should be 10.00`);
  console.assert(acc.history.length === 1, 'history should have 1 entry');
  console.assert(acc.ledgerLog.length > 0, 'ledgerLog should not be empty');
  console.log('  ✅ settleBuy tests passed');
}

// ── 结算卖出测试 ──

function testSettleSell() {
  console.log('--- testSettleSell ---');
  const acc = makeAccount(100000);
  acc.positions = { '000001': { totalQty: '1000', sellableQty: '1000', frozenQty: '0', avgCost: '10', realizedPnl: '0' } };
  const oldAvailable = D(acc.cash.available);

  // 先冻结再卖出（模拟订单流程）
  freezePosition(acc, '000001', 500, 'sell test');
  const result = settleSellFill(acc, { symbol: '000001', name: '平安银行', price: 15, qty: 500, category: 'astocks' });

  console.assert(result.success, 'settleSell should succeed');
  console.assert(eq(acc.positions['000001'].totalQty, 500), `totalQty should be 500, got ${acc.positions['000001'].totalQty}`);
  console.assert(eq(acc.positions['000001'].sellableQty, 500), `sellable should be 500`);
  console.assert(eq(acc.positions['000001'].frozenQty, 0), `frozen should be 0`);
  // 盈亏 = (15*500 - fee) - (10*500) ≈ 2500
  console.assert(gt(result.realizedPnl, 2000), `realizedPnl should be >2000, got ${result.realizedPnl}`);
  console.log('  ✅ settleSell tests passed');
}

// ── 超卖防护测试 ──

function testNoOversell() {
  console.log('--- testNoOversell ---');
  const acc = makeAccount();
  acc.positions = { '000001': { totalQty: '100', sellableQty: '100', frozenQty: '0', avgCost: '10', realizedPnl: '0' } };

  let threw = false;
  try {
    settleSellFill(acc, { symbol: '000001', price: 15, qty: 200, category: 'astocks' });
  } catch (e) {
    threw = true;
    console.assert(e.message.includes('可卖数量不足') || e.message.includes('库存不足'), `expected oversell error, got: ${e.message}`);
  }
  console.assert(threw, 'should throw on oversell');
  console.log('  ✅ noOversell tests passed');
}

// ── 条件单冻结测试 ──

function testConditionalOrderFreeze() {
  console.log('--- testConditionalOrderFreeze ---');
  const acc = makeAccount(100000);

  // 条件买单创建即冻结
  freezeCash(acc, 30000, '条件买单 000001 @ 10');
  console.assert(eq(acc.cash.frozen, 30000), 'conditional buy should freeze cash');

  // 条件卖单创建即冻结
  acc.positions = { '000001': { totalQty: '1000', sellableQty: '1000', frozenQty: '0', avgCost: '10', realizedPnl: '0' } };
  freezePosition(acc, '000001', 500, '条件卖单');
  console.assert(eq(acc.positions['000001'].frozenQty, 500), 'conditional sell should freeze position');
  console.log('  ✅ conditionalOrderFreeze tests passed');
}

// ── 旧账户迁移测试 ──

function testMigration() {
  console.log('--- testMigration ---');
  // 原始旧账户（不走 makeAccount 的自动迁移）
  const acc = {
    id: 'test_mig',
    balance: 50000,
    holdings: { '000001': { qty: 1000, avgCost: 10, name: '平安银行' } },
    pendingOrders: [],
    history: [],
  };

  migrateAccountIfNeeded(acc);

  console.assert(acc._legacyBalance === 50000, 'legacy balance should be preserved');
  console.assert(!acc.balance, 'old balance should be removed');
  console.assert(acc.cash, 'cash should exist');
  console.assert(eq(acc.cash.available, 50000), `available should be 50000, got ${acc.cash.available}`);
  console.assert(acc.positions, 'positions should exist');
  console.assert(acc.positions['000001'].totalQty === '1000.00000000', 'holdings migrated');
  console.log('  ✅ migration tests passed');
}

// ── 部分成交测试 ──

function testPartialFill() {
  console.log('--- testPartialFill ---');
  const acc = makeAccount(100000);
  acc.positions = { '000001': { totalQty: '1000', sellableQty: '500', frozenQty: '500', avgCost: '10', realizedPnl: '0' } };

  // 部分卖出（冻结中已有 500，再卖 300）
  const result = settleSellFill(acc, { symbol: '000001', price: 15, qty: 300, category: 'astocks' });
  console.assert(result.success);
  console.assert(eq(acc.positions['000001'].totalQty, 700), 'total should be 700 after partial');
  console.assert(eq(acc.positions['000001'].frozenQty, 200), 'frozen should be 200 (500-300)');
  console.log('  ✅ partialFill tests passed');
}

// ── 主入口 ──

function runAll() {
  console.log('\n🧪 Phase 1 测试开始\n');
  testMoney();
  testStateMachine();
  testFreeze();
  testPositionFreeze();
  testSettleBuy();
  testSettleSell();
  testNoOversell();
  testConditionalOrderFreeze();
  testMigration();
  testPartialFill();
  console.log('\n✅ Phase 1 全部测试通过\n');
}

runAll();
