/**
 * Leomoney 统一请求封装
 * 所有 API 调用走这个入口
 */

const API_BASE = '';

/**
 * 统一 GET 请求
 * @param {string} path - API 路径
 * @returns {Promise<{成功: boolean, 数据: any, 错误: Error|null}>}
 */
export async function 请求GET(path) {
  try {
    const response = await fetch(API_BASE + path);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    return { 成功: true, 数据: data, 错误: null };
  } catch (error) {
    console.error('[请求GET]', path, error);
    return { 成功: false, 数据: null, 错误: error };
  }
}

/**
 * 统一 POST 请求
 * @param {string} path - API 路径
 * @param {Object} body - 请求体
 * @returns {Promise<{成功: boolean, 数据: any, 错误: Error|null}>}
 */
export async function 请求POST(path, body) {
  try {
    const response = await fetch(API_BASE + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    return { 成功: true, 数据: data, 错误: null };
  } catch (error) {
    console.error('[请求POST]', path, error);
    return { 成功: false, 数据: { success: false, error: error.message }, 错误: error };
  }
}

/**
 * 统一 DELETE 请求
 * @param {string} path
 * @returns {Promise<{成功: boolean, 数据: any, 错误: Error|null}>}
 */
export async function 请求DELETE(path) {
  try {
    const response = await fetch(API_BASE + path, { method: 'DELETE' });
    const data = await response.json();
    return { 成功: true, 数据: data, 错误: null };
  } catch (error) {
    console.error('[请求DELETE]', path, error);
    return { 成功: false, 数据: { success: false, error: error.message }, 错误: error };
  }
}
