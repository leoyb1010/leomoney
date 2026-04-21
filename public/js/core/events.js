/**
 * Leomoney 事件总线
 * 跨模块通信的统一入口
 */

const listeners = {};

/**
 * 监听事件
 * @param {string} event - 事件名
 * @param {Function} callback
 */
export function on(event, callback) {
  if (!listeners[event]) listeners[event] = [];
  listeners[event].push(callback);
}

/**
 * 触发事件
 * @param {string} event - 事件名
 * @param {*} data - 事件数据
 */
export function emit(event, data) {
  if (!listeners[event]) return;
  listeners[event].forEach(cb => {
    try { cb(data); } catch (e) { console.error('[EventBus]', event, e); }
  });
}

/**
 * 移除事件监听
 * @param {string} event
 * @param {Function} callback
 */
export function off(event, callback) {
  if (!listeners[event]) return;
  listeners[event] = listeners[event].filter(cb => cb !== callback);
}
