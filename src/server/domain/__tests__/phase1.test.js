/**
 * Phase 1 测试：核心交易正确性
 * 覆盖：Decimal 计算、冻结/解冻、状态机、条件单、超卖防护
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
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

describe('Phase 1: 金额工具', () => {
  test('浮点精度计算', () => {
    assert.ok(eq(add(0.1, 0.2), 0.3), '0.1+0.2 should be 0.3');
    assert.ok(eq(sub(1, 0.9), 0.1), '1-0.9 should be 0.1');
    assert.ok(eq(mul(0.1, 3), 0.3), '0.1*3 should be 0.3');
    assert.ok(eq(div(0.3, 0.1), 3), '0.3/0.1 should be 3');
  });

  test('格式化', () => {
    assert.strictEqual(toMoney(123.456), '123.46', 'toMoney rounding');
    assert.strictEqual(toQty(123.456789, 4), '123.4568', 'toQty rounding');
  });

  test('均价计算', () => {
    const avg = calcAvgCost(100, 100, 110, 100);
    assert.strictEqual(avg, '105.00', `avgCost should be 105, got ${avg}`);
  });

  test('冻结金额计算', () => {
    const reserve = calcBuyReserve(100, 100, 0.0003);
    assert.ok(gt(reserve, 10000), 'reserve should include fee');
  });
});

// ── 状态机测试 ──

describe('Phase 1: 订单状态机', () => {
  test('合法流转', () => {
    assert.ok(canTransition('CREATED', 'ACCEPTED'), 'CREATED->ACCEPTED');
    assert.ok(canTransition('CREATED', 'PENDING_TRIGGER'), 'CREATED->PENDING_TRIGGER');
    assert.ok(canTransition('ACCEPTED', 'FILLED'), 'ACCEPTED->FILLED');
    assert.ok(canTransition('PENDING_TRIGGER', 'ACCEPTED'), 'PENDING_TRIGGER->ACCEPTED');
  });

  test('非法流转', () => {
    assert.ok(!canTransition('CREATED', 'FILLED'), 'CREATED->FILLED should fail');
    assert.ok(!canTransition('FILLED', 'CANCELED'), 'FILLED->CANCELED should fail');
    assert.ok(!canTransition('CANCELED', 'ACCEPTED'), 'CANCELED->ACCEPTED should fail');
  });

  test('状态流转执行', () => {
    const order = { status: 'CREATED', updatedAt: '' };
    const r = transitionOrder(order, 'ACCEPTED', { by: 'test' });
    assert.ok(r.success, r.error);
    assert.strictEqual(order.status, 'ACCEPTED');
  });

  test('非法流转应失败', () => {
    const order = { status: 'ACCEPTED', updatedAt: '' };
    const r2 = transitionOrder(order, 'CREATED');
    assert.ok(!r2.success, 'should reject backward transition');
  });
});

// ── 冻结/解冻测试 ──

describe('Phase 1: 现金冻结/解冻', () => {
  test('冻结现金', () => {
    const acc = makeAccount(100000);
    freezeCash(acc, 50000, 'test');
    assert.ok(eq(acc.cash.available, 50000), `available should be 50000, got ${acc.cash.available}`);
    assert.ok(eq(acc.cash.frozen, 50000), `frozen should be 50000, got ${acc.cash.frozen}`);
    assert.ok(eq(acc.cash.total, 100000), `total should be 100000`);
  });

  test('释放现金', () => {
    const acc = makeAccount(100000);
    freezeCash(acc, 50000, 'test');
    releaseCash(acc, 20000, 'test');
    assert.ok(eq(acc.cash.available, 70000), `available should be 70000`);
    assert.ok(eq(acc.cash.frozen, 30000), `frozen should be 30000`);
  });

  test('超额释放不报错', () => {
    const acc = makeAccount(100000);
    freezeCash(acc, 50000, 'test');
    releaseCash(acc, 99999, 'test');
    assert.ok(eq(acc.cash.frozen, 0), 'frozen should be 0 after over-release');
  });

  test('冻结超余额报错', () => {
    const acc = makeAccount(100000);
    assert.throws(() => freezeCash(acc, 999999), 'should throw on over-freeze');
  });
});

// ── 持仓冻结测试 ──

describe('Phase 1: 持仓冻结/解冻', () => {
  test('冻结持仓', () => {
    const acc = makeAccount();
    acc.positions = { '000001': { totalQty: '1000', sellableQty: '1000', frozenQty: '0', avgCost: '10', realizedPnl: '0' } };
    freezePosition(acc, '000001', 300, 'test');
    assert.ok(eq(acc.positions['000001'].sellableQty, 700), 'sellable should be 700');
    assert.ok(eq(acc.positions['000001'].frozenQty, 300), 'frozen should be 300');
  });

  test('释放持仓', () => {
    const acc = makeAccount();
    acc.positions = { '000001': { totalQty: '1000', sellableQty: '700', frozenQty: '300', avgCost: '10', realizedPnl: '0' } };
    releasePosition(acc, '000001', 100, 'test');
    assert.ok(eq(acc.positions['000001'].sellableQty, 800), 'sellable should be 800');
    assert.ok(eq(acc.positions['000001'].frozenQty, 200), 'frozen should be 200');
  });

  test('超量冻结报错', () => {
    const acc = makeAccount();
    acc.positions = { '000001': { totalQty: '1000', sellableQty: '800', frozenQty: '200', avgCost: '10', realizedPnl: '0' } };
    assert.throws(() => freezePosition(acc, '000001', 9999), 'should throw on over-freeze position');
  });
});

// ── 结算买入测试 ──

describe('Phase 1: 结算买入', () => {
  test('settleBuyFill', () => {
    const acc = makeAccount(100000);
    freezeCash(acc, 50000, 'buy test');
    const result = settleBuyFill(acc, { symbol: '000001', name: '平安银行', price: 10, qty: 100, category: 'astocks' });
    assert.ok(result.success, 'settleBuy should succeed');
    assert.strictEqual(acc.positions['000001'].totalQty, '100.00000000', `totalQty should be 100, got ${acc.positions['000001'].totalQty}`);
    assert.strictEqual(acc.positions['000001'].avgCost, '10.00', `avgCost should be 10.00`);
    assert.strictEqual(acc.history.length, 1, 'history should have 1 entry');
    assert.ok(acc.ledgerLog.length > 0, 'ledgerLog should not be empty');
  });
});

// ── 结算卖出测试 ──

describe('Phase 1: 结算卖出', () => {
  test('settleSellFill', () => {
    const acc = makeAccount(100000);
    acc.positions = { '000001': { totalQty: '1000', sellableQty: '1000', frozenQty: '0', avgCost: '10', realizedPnl: '0' } };
    const oldAvailable = D(acc.cash.available);
    freezePosition(acc, '000001', 500, 'sell test');
    const result = settleSellFill(acc, { symbol: '000001', name: '平安银行', price: 15, qty: 500, category: 'astocks' });
    assert.ok(result.success, 'settleSell should succeed');
    assert.ok(eq(acc.positions['000001'].totalQty, 500), `totalQty should be 500, got ${acc.positions['000001'].totalQty}`);
    assert.ok(eq(acc.positions['000001'].sellableQty, 500), `sellable should be 500`);
    assert.ok(eq(acc.positions['000001'].frozenQty, 0), `frozen should be 0`);
    assert.ok(gt(result.realizedPnl, 2000), `realizedPnl should be >2000, got ${result.realizedPnl}`);
  });
});

// ── 超卖防护测试 ──

describe('Phase 1: 超卖防护', () => {
  test('超卖应抛错', () => {
    const acc = makeAccount();
    acc.positions = { '000001': { totalQty: '100', sellableQty: '100', frozenQty: '0', avgCost: '10', realizedPnl: '0' } };
    assert.throws(() => {
      settleSellFill(acc, { symbol: '000001', price: 15, qty: 200, category: 'astocks' });
    }, (err) => {
      assert.ok(err.message.includes('可卖数量不足') || err.message.includes('库存不足'), `expected oversell error, got: ${err.message}`);
      return true;
    });
  });
});

// ── 条件单冻结测试 ──

describe('Phase 1: 条件单冻结', () => {
  test('条件买单冻结', () => {
    const acc = makeAccount(100000);
    freezeCash(acc, 30000, '条件买单 000001 @ 10');
    assert.ok(eq(acc.cash.frozen, 30000), 'conditional buy should freeze cash');
  });

  test('条件卖单冻结', () => {
    const acc = makeAccount(100000);
    acc.positions = { '000001': { totalQty: '1000', sellableQty: '1000', frozenQty: '0', avgCost: '10', realizedPnl: '0' } };
    freezePosition(acc, '000001', 500, '条件卖单');
    assert.ok(eq(acc.positions['000001'].frozenQty, 500), 'conditional sell should freeze position');
  });
});

// ── 旧账户迁移测试 ──

describe('Phase 1: 旧账户迁移', () => {
  test('migrateAccountIfNeeded', () => {
    const acc = {
      id: 'test_mig',
      balance: 50000,
      holdings: { '000001': { qty: 1000, avgCost: 10, name: '平安银行' } },
      pendingOrders: [],
      history: [],
    };
    migrateAccountIfNeeded(acc);
    assert.strictEqual(acc._legacyBalance, 50000, 'legacy balance should be preserved');
    assert.ok(!acc.balance, 'old balance should be removed');
    assert.ok(acc.cash, 'cash should exist');
    assert.ok(eq(acc.cash.available, 50000), `available should be 50000, got ${acc.cash.available}`);
    assert.ok(acc.positions, 'positions should exist');
    assert.strictEqual(acc.positions['000001'].totalQty, '1000.00000000', 'holdings migrated');
  });
});

// ── 部分成交测试 ──

describe('Phase 1: 部分成交', () => {
  test('部分卖出', () => {
    const acc = makeAccount(100000);
    acc.positions = { '000001': { totalQty: '1000', sellableQty: '500', frozenQty: '500', avgCost: '10', realizedPnl: '0' } };
    const result = settleSellFill(acc, { symbol: '000001', price: 15, qty: 300, category: 'astocks' });
    assert.ok(result.success);
    assert.ok(eq(acc.positions['000001'].totalQty, 700), 'total should be 700 after partial');
    assert.ok(eq(acc.positions['000001'].frozenQty, 200), 'frozen should be 200 (500-300)');
  });
});
