/**
 * Leomoney DOM 工具
 * 统一 DOM 操作和安全渲染
 */

/**
 * 安全设置 innerHTML
 * @param {string} id - 元素 ID
 * @param {string} html - HTML 内容
 */
export function 设置HTML(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}

/**
 * 安全设置文本
 * @param {string} id - 元素 ID
 * @param {string} text - 文本内容
 */
export function 设置文本(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

/**
 * 渲染空状态
 * @param {string} message
 * @param {string} icon
 * @returns {string}
 */
export function 渲染空状态(message = '暂无数据', icon = '📭') {
  return `<div class="empty-state" data-role="empty-state">
    <div class="empty-state__icon">${icon}</div>
    <div class="empty-state__text">${message}</div>
  </div>`;
}

/**
 * 渲染错误状态
 * @param {string} message
 * @returns {string}
 */
export function 渲染错误状态(message = '加载失败，请稍后重试') {
  return `<div class="error-state" data-role="error-state">
    <div class="error-state__icon">⚠️</div>
    <div class="error-state__text">${message}</div>
  </div>`;
}

/**
 * 渲染加载状态
 * @param {string} message
 * @returns {string}
 */
export function 渲染加载状态(message = '加载中...') {
  return `<div class="loading-state" data-role="loading-state">
    <div class="loading-state__spinner"></div>
    <div class="loading-state__text">${message}</div>
  </div>`;
}
