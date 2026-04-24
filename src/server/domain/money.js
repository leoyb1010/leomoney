/**
 * Leomoney 金额工具模块 — 统一 Decimal 精度计算
 * 所有金额、数量、成本、盈亏计算必须走此模块
 * 禁止在业务逻辑中直接使用 price * qty 等浮点运算
 */

const Decimal = require('decimal.js');

// 配置 Decimal：28 位有效数字，向最近的偶数舍入（银行家舍入）
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_EVEN });

/**
 * 创建 Decimal 实例，安全处理 null/undefined
 */
function D(v) {
  return new Decimal(v ?? 0);
}

// ── 四则运算 ──

function add(a, b) { return D(a).plus(D(b)); }
function sub(a, b) { return D(a).minus(D(b)); }
function mul(a, b) { return D(a).times(D(b)); }
function div(a, b) {
  if (D(b).isZero()) throw new Error('Division by zero');
  return D(a).div(D(b));
}

// ── 比较运算 ──

function gt(a, b)  { return D(a).gt(D(b)); }
function gte(a, b) { return D(a).gte(D(b)); }
function lt(a, b)  { return D(a).lt(D(b)); }
function lte(a, b) { return D(a).lte(D(b)); }
function eq(a, b)  { return D(a).eq(D(b)); }
function isZero(a) { return D(a).isZero(); }
function isPositive(a) { return D(a).gt(0); }

// ── 格式化输出 ──

/**
 * 金额字符串（2 位小数）
 */
function toMoney(v) {
  return D(v).toFixed(2);
}

/**
 * 数量字符串（可指定精度，默认 8 位）
 */
function toQty(v, scale = 8) {
  return D(v).toFixed(scale);
}

/**
 * 百分比字符串（2 位小数 + %）
 */
function toPercent(v) {
  return D(v).times(100).toFixed(2) + '%';
}

/**
 * 安全的持仓均价计算：避免浮点累积误差
 * avgCost = (oldAvgCost * oldQty + price * fillQty) / (oldQty + fillQty)
 */
function calcAvgCost(oldAvgCost, oldQty, fillPrice, fillQty) {
  const totalCost = add(mul(oldAvgCost, oldQty), mul(fillPrice, fillQty));
  const totalQty = add(oldQty, fillQty);
  if (isZero(totalQty)) return toMoney(0);
  return toMoney(div(totalCost, totalQty));
}

/**
 * 计算冻结金额（含手续费预留）
 * 买单预留 = 成交额 * (1 + feeRate)
 * @param {number|string} price - 单价
 * @param {number|string} qty - 数量
 * @param {number|string} feeRate - 手续费率，默认 0.0003（万三）
 * @returns {string} 需冻结金额（2 位小数）
 */
function calcBuyReserve(price, qty, feeRate = 0.0003) {
  const amount = mul(price, qty);
  const fee = mul(amount, feeRate);
  return toMoney(add(amount, fee));
}

/**
 * 计算手续费
 * @param {number|string} amount - 成交额
 * @param {number|string} feeRate - 手续费率
 * @returns {string} 手续费（2 位小数）
 */
function calcFee(amount, feeRate = 0.0003) {
  return toMoney(mul(amount, feeRate));
}

module.exports = {
  D, Decimal,
  add, sub, mul, div,
  gt, gte, lt, lte, eq, isZero, isPositive,
  toMoney, toQty, toPercent,
  calcAvgCost, calcBuyReserve, calcFee,
};
