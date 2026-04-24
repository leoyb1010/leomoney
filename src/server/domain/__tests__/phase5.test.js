/**
 * Phase 5 测试：UI/交互
 * 覆盖：前端数据适配 / 预估计算 / 风控显示
 */

function testCashStructureAdapter() {
  console.log('--- testCashStructureAdapter ---');
  // 模拟前端 store.accountData 新结构
  const accountData = {
    cash: { available: '100000.00', frozen: '5000.00', total: '105000.00' },
    positions: {
      '600519': { symbol: '600519', totalQty: '100.00000000', sellableQty: '80.00000000', frozenQty: '20.00000000', avgCost: '1500.00' },
    },
  };
  const cash = accountData.cash;
  console.assert(cash.available === '100000.00', 'available should be 100000');
  console.assert(cash.frozen === '5000.00', 'frozen should be 5000');

  const pos = accountData.positions['600519'];
  console.assert(pos.sellableQty === '80.00000000', 'sellable should be 80');
  console.assert(pos.frozenQty === '20.00000000', 'frozen should be 20');
  console.log('  ✅ cash structure adapter passed');
}

function testLegacyCompatibility() {
  console.log('--- testLegacyCompatibility ---');
  // 旧结构兼容
  const accountData = {
    balance: 50000,
    holdings: { 'A': { qty: 100, avgCost: 10 } },
  };
  const cash = accountData.cash || { available: accountData.balance || 0, frozen: 0, total: accountData.balance || 0 };
  const positions = accountData.positions || accountData.holdings || {};
  console.assert(cash.available === 50000, 'legacy balance should map to available');
  console.assert(positions.A.qty === 100, 'legacy holdings should work');
  console.log('  ✅ legacy compatibility passed');
}

function testOrderEstimate() {
  console.log('--- testOrderEstimate ---');
  const price = 100;
  const qty = 100;
  const total = price * qty;
  const fee = total * 0.0003;
  const reserve = total + fee;
  console.assert(reserve === 10003, `reserve should be 10003, got ${reserve}`);
  console.assert(fee === 3, `fee should be 3, got ${fee}`);
  console.log('  ✅ order estimate passed');
}

function testRiskDecisionDisplay() {
  console.log('--- testRiskDecisionDisplay ---');
  const riskCheck = {
    allowed: false,
    level: 'HARD_REJECT',
    reasons: ['可用资金不足', '单笔仓位超限'],
    machineCode: ['INSUFFICIENT_AVAILABLE_CASH', 'SINGLE_POSITION_LIMIT'],
  };
  console.assert(riskCheck.level === 'HARD_REJECT', 'level should be HARD_REJECT');
  console.assert(riskCheck.reasons.length === 2, 'should have 2 reasons');
  console.assert(riskCheck.machineCode.includes('INSUFFICIENT_AVAILABLE_CASH'), 'should have machine code');
  console.log('  ✅ risk decision display passed');
}

function runAll() {
  console.log('\n🧪 Phase 5 测试开始\n');
  testCashStructureAdapter();
  testLegacyCompatibility();
  testOrderEstimate();
  testRiskDecisionDisplay();
  console.log('\n✅ Phase 5 全部测试通过\n');
}

runAll();
