/**
 * Leomoney 格式化工具
 */

export function formatPrice(p) { return p != null ? p.toFixed(2) : '--'; }
export function formatMoney(m) { return '¥' + m.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
export function formatQty(q) { return q.toLocaleString(); }

// 别名（供 dashboard.js 等模块使用）
export const fmtMoney = formatMoney;
export const fmtQty = formatQty;
export function fmtPct(p) { return p != null ? (p >= 0 ? '+' : '') + p.toFixed(2) + '%' : '--'; }

export function toCNY(amount, currency, fxRates) {
  if (currency === 'CNY' || !currency) return amount;
  const rate = (fxRates || {})[currency] || 1;
  return amount * rate;
}

export function formatMoneyCNY(amount, currency, fxRates) {
  if (currency === 'CNY' || !currency) return formatMoney(amount);
  return formatMoney(toCNY(amount, currency, fxRates));
}

export function getCategoryRules(category) {
  switch (category) {
    case 'crypto': return { unit: '枚', step: 0.01, minQty: 0.01, multiple: false, label: '加密' };
    case 'metals': return { unit: '盎司', step: 1, minQty: 1, multiple: false, label: '贵金属' };
    case 'hkstocks': return { unit: '股', step: 100, minQty: 100, multiple: true, label: '港股' };
    case 'usstocks': return { unit: '股', step: 1, minQty: 1, multiple: false, label: '美股' };
    default: return { unit: '股', step: 100, minQty: 100, multiple: true, label: 'A股' };
  }
}

export function getCurrencySymbol(currency) {
  if (currency === 'USD') return '$';
  if (currency === 'HKD') return 'HK$';
  return '¥';
}
