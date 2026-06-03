import type { Currency, Quote, UpDownMode } from './types';

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

export function toNumber(value: unknown, fallback = 0) {
  const n = Number(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : fallback;
}

export function convertFromCny(cnyValue: unknown, currency: Currency, rates?: Record<string, number>) {
  const n = toNumber(cnyValue);
  const rate = currency === 'CNY' ? 1 : (rates?.[currency] || (currency === 'HKD' ? 0.93 : 7.25));
  return currency === 'CNY' ? n : n / rate;
}

export function moneyFromCny(cnyValue: unknown, currency: Currency = 'USD', rates?: Record<string, number>) {
  const amount = convertFromCny(cnyValue, currency, rates);
  if (currency === 'USDT') return `${amount.toFixed(2)} USDT`;
  return new Intl.NumberFormat(currency === 'CNY' ? 'zh-CN' : 'en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'CNY' ? 0 : 2,
  }).format(amount);
}

export function money(value: unknown, currency: Currency | string = 'USD') {
  const n = toNumber(value);
  if (currency === 'USDT') return `${n.toFixed(2)} USDT`;
  try {
    return new Intl.NumberFormat(currency === 'CNY' ? 'zh-CN' : 'en-US', {
      style: 'currency',
      currency: currency === 'USDT' ? 'USD' : String(currency || 'USD'),
      maximumFractionDigits: currency === 'CNY' ? 0 : 2,
    }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}

export function pct(value: unknown, digits = 2) {
  const n = toNumber(value);
  return `${n >= 0 ? '+' : ''}${n.toFixed(digits)}%`;
}

export function signed(value: unknown, digits = 2) {
  const n = toNumber(value);
  return `${n >= 0 ? '+' : ''}${n.toFixed(digits)}`;
}

export function upClass(value: unknown, mode: UpDownMode) {
  const n = toNumber(value);
  if (n === 0) return 'flat';
  const positiveClass = mode === 'cn' ? 'up-cn' : 'up-us';
  const negativeClass = mode === 'cn' ? 'down-cn' : 'down-us';
  return n > 0 ? positiveClass : negativeClass;
}

export function ageText(ts?: string | number) {
  if (!ts) return '--';
  const time = typeof ts === 'number' ? ts : new Date(ts).getTime();
  const diff = Math.max(0, Date.now() - time);
  if (diff < 5000) return '刚刚';
  if (diff < 60000) return `${Math.round(diff / 1000)} 秒前`;
  if (diff < 3600000) return `${Math.round(diff / 60000)} 分钟前`;
  return `${Math.round(diff / 3600000)} 小时前`;
}

export function categoryLabel(cat?: string, lang: 'zh' | 'en' = 'zh') {
  const zh: Record<string, string> = {
    indices: '大盘指数',
    astocks: 'A股',
    hkstocks: '港股',
    usstocks: '美股',
    metals: '大宗商品',
    crypto: '加密',
  };
  const en: Record<string, string> = {
    indices: 'Indices',
    astocks: 'A-shares',
    hkstocks: 'HK stocks',
    usstocks: 'US stocks',
    metals: 'Commodities',
    crypto: 'Crypto',
  };
  return (lang === 'en' ? en : zh)[cat || ''] || cat || '--';
}

export function quoteKey(q: Quote) {
  return `${q.category}:${q.symbol}`;
}
