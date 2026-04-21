/**
 * Leomoney 格式化工具
 * 统一所有数值/货币/百分比的格式化逻辑
 */

/**
 * 格式化货币
 * @param {number} value - 数值
 * @param {string} currency - 货币符号，默认 ¥
 * @returns {string}
 */
export function 格式化货币(value, currency = '¥') {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return `${currency}0.00`;
  return `${currency}${num.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * 格式化带符号货币（正数带+号）
 * @param {number} value
 * @param {string} currency
 * @returns {string}
 */
export function 格式化带符号货币(value, currency = '¥') {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return `${currency}0.00`;
  const sign = num >= 0 ? '+' : '-';
  return `${sign}${currency}${Math.abs(num).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * 格式化百分比
 * @param {number} value - 百分比值（如 5.5 表示 5.5%）
 * @returns {string}
 */
export function 格式化百分比(value) {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return '0.00%';
  return `${num >= 0 ? '+' : ''}${num.toFixed(2)}%`;
}

/**
 * 格式化价格
 * @param {number} value
 * @param {string} currency
 * @returns {string}
 */
export function 格式化价格(value, currency = '¥') {
  const num = Number(value);
  if (!Number.isFinite(num)) return '--';
  if (num >= 1000) return `${currency}${num.toLocaleString('zh-CN', { maximumFractionDigits: 0 })}`;
  return `${currency}${num.toFixed(2)}`;
}

/**
 * 格式化数量
 * @param {number} value
 * @returns {string}
 */
export function 格式化数量(value) {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return '0';
  return num.toLocaleString('zh-CN');
}

/**
 * 格式化涨跌色类名
 * @param {number} change - 涨跌值
 * @returns {'up'|'down'}
 */
export function 涨跌类名(change) {
  return change >= 0 ? 'up' : 'down';
}

/**
 * 格式化涨跌文字
 * @param {number} change - 涨跌值
 * @returns {'上涨'|'下跌'|'无变化'}
 */
export function 涨跌文字(change) {
  if (change > 0) return '上涨';
  if (change < 0) return '下跌';
  return '无变化';
}

/**
 * 格式化方向文字
 * @param {'buy'|'sell'} type
 * @returns {'买入'|'卖出'}
 */
export function 方向文字(type) {
  return type === 'buy' ? '买入' : '卖出';
}

/**
 * 格式化时间
 * @param {string} isoStr - ISO 时间字符串
 * @returns {string}
 */
export function 格式化时间(isoStr) {
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return isoStr || '--';
  return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}
