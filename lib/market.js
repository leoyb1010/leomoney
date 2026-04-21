/**
 * Leomoney - 市场状态检测模块
 * 支持 A 股、港股、美股、加密市场
 */

function toMinutes(h, m) { return h * 60 + m; }

// ===== A 股 =====
const A_MORNING_OPEN = toMinutes(9, 30);
const A_MORNING_CLOSE = toMinutes(11, 30);
const A_AFTERNOON_OPEN = toMinutes(13, 0);
const A_AFTERNOON_CLOSE = toMinutes(15, 0);

// ===== 港股 =====
const HK_MORNING_OPEN = toMinutes(9, 30);
const HK_MORNING_CLOSE = toMinutes(12, 0);
const HK_AFTERNOON_OPEN = toMinutes(13, 0);
const HK_AFTERNOON_CLOSE = toMinutes(16, 0);

// ===== 美股 (北京时间) =====
// 夏令时 21:30-04:00, 冬令时 22:30-05:00 — 简化按夏令时处理
const US_EVENING_OPEN = toMinutes(21, 30);
const US_MIDNIGHT = toMinutes(24, 0);
const US_DAWN_CLOSE = toMinutes(4, 0);

function getBJMinutes() {
  const now = new Date();
  const utcM = now.getUTCHours() * 60 + now.getUTCMinutes();
  return (utcM + 8 * 60) % (24 * 60);
}

function getBJDay() {
  // 返回北京时间对应的星期几
  const now = new Date();
  const utcDay = now.getUTCDay();
  const utcH = now.getUTCHours();
  // 如果 UTC 时间 < 16，北京时间还在前一天
  const bjDay = utcH < 16 ? (utcDay + 6) % 7 : utcDay;
  return bjDay;
}

function getMarketStatusA() {
  const day = getBJDay();
  const m = getBJMinutes();
  const isWeekday = day >= 1 && day <= 5;
  const isOpen = isWeekday && ((m >= A_MORNING_OPEN && m <= A_MORNING_CLOSE) || (m >= A_AFTERNOON_OPEN && m <= A_AFTERNOON_CLOSE));
  let status = '已收盘', nextEvent = '明日开盘';
  if (!isWeekday) { status = '休市'; nextEvent = '周一开盘'; }
  else if (m < A_MORNING_OPEN) { status = '盘前'; nextEvent = '上午开盘'; }
  else if (m <= A_MORNING_CLOSE) { status = '交易中'; nextEvent = '午间休市'; }
  else if (m < A_AFTERNOON_OPEN) { status = '午间休市'; nextEvent = '下午开盘'; }
  else if (m <= A_AFTERNOON_CLOSE) { status = '交易中'; nextEvent = '收盘'; }
  return { market: 'A股', isOpen, status, nextEvent };
}

function getMarketStatusHK() {
  const day = getBJDay();
  const m = getBJMinutes();
  const isWeekday = day >= 1 && day <= 5;
  const isOpen = isWeekday && ((m >= HK_MORNING_OPEN && m <= HK_MORNING_CLOSE) || (m >= HK_AFTERNOON_OPEN && m <= HK_AFTERNOON_CLOSE));
  let status = '已收盘', nextEvent = '明日开盘';
  if (!isWeekday) { status = '休市'; nextEvent = '周一开盘'; }
  else if (m < HK_MORNING_OPEN) { status = '盘前'; nextEvent = '上午开盘'; }
  else if (m <= HK_MORNING_CLOSE) { status = '交易中'; nextEvent = '午间休市'; }
  else if (m < HK_AFTERNOON_OPEN) { status = '午间休市'; nextEvent = '下午开盘'; }
  else if (m <= HK_AFTERNOON_CLOSE) { status = '交易中'; nextEvent = '收盘'; }
  return { market: '港股', isOpen, status, nextEvent };
}

function getMarketStatusUS() {
  // 美股按北京时间判断（夏令时 21:30-04:00）
  const now = new Date();
  const utcH = now.getUTCHours();
  const utcM = now.getUTCMinutes();
  const utcDay = now.getUTCDay();
  const bjM = getBJMinutes();

  // 美股交易日：周日晚上到周五早上（北京时间）
  // 即 UTC 周日 13:30 到 UTC 周五 20:00
  let usDay = utcDay;
  if (utcH < 16) usDay = (usDay + 6) % 7;

  const isWeekday = usDay >= 1 && usDay <= 5;
  const isInSession = (bjM >= US_EVENING_OPEN && bjM <= US_MIDNIGHT) || (bjM >= 0 && bjM <= US_DAWN_CLOSE);
  const isOpen = isWeekday && isInSession;

  let status = '已收盘', nextEvent = '今晚开盘';
  if (!isWeekday) { status = '休市'; nextEvent = '周日晚上开盘'; }
  else if (bjM > US_DAWN_CLOSE && bjM < US_EVENING_OPEN) { status = '盘中休市'; nextEvent = '今晚开盘'; }
  else if (isOpen) { status = '交易中'; nextEvent = '明日凌晨收盘'; }
  return { market: '美股', isOpen, status, nextEvent };
}

function getMarketStatusCrypto() {
  // 加密市场 7×24
  return { market: '加密', isOpen: true, status: '交易中', nextEvent: '持续交易' };
}

function getMarketStatus() {
  const a = getMarketStatusA();
  const hk = getMarketStatusHK();
  const us = getMarketStatusUS();
  const crypto = getMarketStatusCrypto();

  // 综合状态：只要任一主要市场交易中就显示“交易中”
  const isOpen = a.isOpen || hk.isOpen || us.isOpen || crypto.isOpen;
  const primary = a.isOpen ? 'A股交易中' : (hk.isOpen ? '港股交易中' : (us.isOpen ? '美股交易中' : (crypto.isOpen ? '加密交易中' : '已收盘')));

  return {
    isOpen,
    status: primary,
    a,
    hk,
    us,
    crypto,
    timestamp: new Date().toISOString(),
  };
}

function shouldRefreshQuotes(category) {
  const s = getMarketStatus();
  if (category === 'crypto') return true;
  if (category === 'astocks') return s.a.isOpen;
  if (category === 'hkstocks') return s.hk.isOpen;
  if (category === 'usstocks') return s.us.isOpen;
  if (category === 'metals') return s.us.isOpen || s.a.isOpen; // 贵金属跟美盘
  return s.isOpen;
}

module.exports = { getMarketStatus, getMarketStatusA, getMarketStatusHK, getMarketStatusUS, shouldRefreshQuotes };
