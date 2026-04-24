/**
 * Leomoney API 客户端
 * 统一请求封装
 */

const API_BASE = '';

export async function apiGet(path) {
  try {
    const r = await fetch(API_BASE + path);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } catch (e) {
    console.warn('API ' + path + ' failed:', e.message);
    return null;
  }
}

export async function apiPost(path, body) {
  try {
    const r = await fetch(API_BASE + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return await r.json();
  } catch (e) {
    return { success: false, error: e.message };
  }
}

export async function apiPatch(path, body) {
  try {
    const r = await fetch(API_BASE + path, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return await r.json();
  } catch (e) {
    return { success: false, error: e.message };
  }
}

export async function apiDelete(path) {
  try {
    const r = await fetch(API_BASE + path, { method: 'DELETE' });
    return await r.json();
  } catch (e) {
    return { success: false, error: e.message };
  }
}
