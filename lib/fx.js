/**
 * Leomoney - 汇率层
 * 统一资产计价货币为 CNY
 * 静态汇率，可后续接入实时汇率 API
 */

// 静态汇率（2026-04 基准，手动可调）
const RATES = {
  CNY: 1,
  USD: 7.25,
  HKD: 0.93,
};

// 获取汇率
function getRate(from) {
  return RATES[from] || 1;
}

// 任意货币转 CNY
function toCNY(amount, fromCurrency) {
  const rate = getRate(fromCurrency);
  return amount * rate;
}

// 获取所有汇率
function getAllRates() {
  return { ...RATES };
}

// 格式化折算提示
function conversionHint(amount, fromCurrency) {
  if (fromCurrency === 'CNY') return '';
  const cny = toCNY(amount, fromCurrency);
  return `约合 ¥${cny.toFixed(2)}`;
}

module.exports = { getRate, toCNY, getAllRates, conversionHint, RATES };
