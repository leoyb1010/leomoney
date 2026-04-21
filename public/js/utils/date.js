/**
 * Leomoney 日期工具
 */

/**
 * 获取今日日期字符串 YYYY-MM-DD
 * @returns {string}
 */
export function 今日日期() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * 格式化 ISO 日期为中文短格式
 * @param {string} isoStr
 * @returns {string}
 */
export function 格式化日期(isoStr) {
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return isoStr || '--';
  return d.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
