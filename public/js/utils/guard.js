/**
 * Leomoney 容错工具
 * 统一所有防御性数值处理逻辑
 */

/**
 * 安全转数字
 * @param {*} value - 任意值
 * @param {number} fallback - 兜底值
 * @returns {number}
 */
export function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * 安全取数组
 * @param {*} value
 * @returns {Array}
 */
export function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

/**
 * 安全取对象
 * @param {*} value
 * @returns {Object}
 */
export function safeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

/**
 * 安全取字符串
 * @param {*} value
 * @param {string} fallback
 * @returns {string}
 */
export function safeString(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

/**
 * 限制数值范围
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function clamp(value, min, max) {
  const n = toNumber(value);
  return Math.max(min, Math.min(max, n));
}

/**
 * 安全取整数
 * @param {*} value
 * @param {number} fallback
 * @returns {number}
 */
export function toInteger(value, fallback = 0) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}
