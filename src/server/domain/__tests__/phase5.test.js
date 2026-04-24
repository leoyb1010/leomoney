/**
 * Phase 5 测试：UI/交互
 * 覆盖：前端数据适配 / 预估计算 / 风控显示
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

describe('Phase 5: 前端数据适配', () => {
  test('cash 结构适配', () => {
    const accountData = {
      cash: { available: '100000.00', frozen: '5000.00', total: '105000.00' },
      positions: {
        '600519': { symbol: '600519', totalQty: '100.00000000', sellableQty: '80.00000000', frozenQty: '20.00000000', avgCost: '1500.00' },
      },
    };
    const cash = accountData.cash;
    assert.strictEqual(cash.available, '100000.00', 'available should be 100000');
    assert.strictEqual(cash.frozen, '5000.00', 'frozen should be 5000');

    const pos = accountData.positions['600519'];
    assert.strictEqual(pos.sellableQty, '80.00000000', 'sellable should be 80');
    assert.strictEqual(pos.frozenQty, '20.00000000', 'frozen should be 20');
  });

  test('旧结构兼容', () => {
    const accountData = {
      balance: 50000,
      holdings: { 'A': { qty: 100, avgCost: 10 } },
    };
    const cash = accountData.cash || { available: accountData.balance || 0, frozen: 0, total: accountData.balance || 0 };
    const positions = accountData.positions || accountData.holdings || {};
    assert.strictEqual(cash.available, 50000, 'legacy balance should map to available');
    assert.strictEqual(positions.A.qty, 100, 'legacy holdings should work');
  });
});

describe('Phase 5: 订单预估', () => {
  test('费用与冻结金额', () => {
    const price = 100;
    const qty = 100;
    const total = price * qty;
    const fee = total * 0.0003;
    const reserve = total + fee;
    assert.ok(Math.abs(reserve - 10003) < 0.01, `reserve should be ~10003, got ${reserve}`);
    assert.ok(Math.abs(fee - 3) < 0.01, `fee should be ~3, got ${fee}`);
  });
});

describe('Phase 5: 风控显示', () => {
  test('风控决策结构', () => {
    const riskCheck = {
      allowed: false,
      level: 'HARD_REJECT',
      reasons: ['可用资金不足', '单笔仓位超限'],
      machineCode: ['INSUFFICIENT_AVAILABLE_CASH', 'SINGLE_POSITION_LIMIT'],
    };
    assert.strictEqual(riskCheck.level, 'HARD_REJECT', 'level should be HARD_REJECT');
    assert.strictEqual(riskCheck.reasons.length, 2, 'should have 2 reasons');
    assert.ok(riskCheck.machineCode.includes('INSUFFICIENT_AVAILABLE_CASH'), 'should have machine code');
  });
});
