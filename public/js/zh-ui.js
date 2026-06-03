/**
 * 用户界面中文文案（API 内部键名仍为英文）
 */
(function initZhUi(global) {
  const ACTION = { BUY: '买入', SELL: '卖出', HOLD: '观望', NO_OP: '无操作' };
  const BREAKER = { CLOSED: '正常', OPEN: '熔断', HALF_OPEN: '试探恢复' };
  const CHANNEL = {
    beta: '测试版',
    'commercial-beta': '商用测试版',
    stable: '稳定版',
  };
  const CURRENCY = {
    CNY: '人民币',
    USD: '美元',
    HKD: '港币',
    USDT: 'USDT',
    EUR: '欧元',
  };
  const CATEGORY = {
    indices: '宏观指数',
    astocks: 'A股',
    hkstocks: '港股',
    usstocks: '权益',
    metals: '大宗',
    crypto: '数字资产',
    all: '全部',
  };
  const AGENT_LEVEL = {
    1: '一级 · 只监控',
    2: '二级 · 生成方案',
    3: '三级 · 写入模拟盘',
  };
  const REASON = {
    'No market context': '未获取到该标的行情',
    'No executable action': '当前决策为观望，无需执行',
    'Market data is synthetic': '行情为模拟或备用数据，已阻止执行',
    'Decision carries HIGH_RISK flag': '决策带有高风险标记，已阻止执行',
    'Calculated quantity is below the minimum tradable lot': '计算数量低于最小可交易单位',
    'LLM_API_KEY': '需配置大模型 API 密钥（环境变量 LLM_API_KEY）',
  };

  function actionLabel(action) {
    const key = String(action || '').toUpperCase();
    return ACTION[key] || (action && /[\u4e00-\u9fff]/.test(String(action)) ? action : '观望');
  }

  function breakerLabel(state) {
    return BREAKER[state] || state || '--';
  }

  function channelLabel(channel) {
    return CHANNEL[channel] || '正式版';
  }

  function currencyLabel(code) {
    const c = String(code || 'CNY').toUpperCase();
    return CURRENCY[c] || c;
  }

  function categoryLabel(cat) {
    return CATEGORY[cat] || cat || '市场';
  }

  function agentLevelLabel(level) {
    return AGENT_LEVEL[level] || `等级 ${level}`;
  }

  function marketStatusLabel(status) {
    const map = {
      ok: '正常',
      live: '实时',
      open: '交易中',
      closed: '已收盘',
      'commercial-beta': '商用测试',
    };
    return map[status] || status || '--';
  }

  function translateReason(reason) {
    if (Array.isArray(reason)) return reason.map(translateReason).join('；');
    const key = String(reason || '').trim();
    if (REASON[key]) return REASON[key];
    if (/[\u4e00-\u9fff]/.test(key)) return key;
    if (key.includes('LLM')) return REASON['LLM_API_KEY'];
    return key || '未通过';
  }

  function formatTime(ts) {
    try {
      return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return '--';
    }
  }

  /** 后端金额为 CNY 本位，按用户选择的展示币种格式化 */
  function formatMoneyFromCny(cnyValue, currency, rates) {
    const n = Number(String(cnyValue ?? '').replace(/,/g, ''));
    if (!Number.isFinite(n)) return '--';
    const cur = String(currency || 'CNY').toUpperCase();
    const rate = rates?.[cur] || (cur === 'CNY' ? 1 : 7.25);
    const amount = cur === 'CNY' ? n : n / rate;
    try {
      if (cur === 'CNY') return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' }).format(amount);
      if (cur === 'USD') return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'USD' }).format(amount);
      if (cur === 'HKD') return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'HKD' }).format(amount);
      if (cur === 'USDT') return `${amount.toFixed(2)} USDT`;
    } catch (_) {
      return `${amount.toFixed(2)} ${cur}`;
    }
    return `${amount.toFixed(2)} ${cur}`;
  }

  function intelSourceLine(meta) {
    if (!meta || meta.googleEn == null) return '';
    const parts = [];
    if (meta.googleEn) parts.push(`国际 ${meta.googleEn} 条`);
    if (meta.googleZh) parts.push(`中文 ${meta.googleZh} 条`);
    if (meta.eastmoney) parts.push(`东财 ${meta.eastmoney} 条`);
    if (meta.searchApi) parts.push(`扩展检索 ${meta.searchApi} 条`);
    return parts.length ? `来源：${parts.join(' · ')}` : '';
  }

  global.ZhUi = {
    ACTION,
    actionLabel,
    breakerLabel,
    channelLabel,
    currencyLabel,
    categoryLabel,
    agentLevelLabel,
    marketStatusLabel,
    translateReason,
    formatTime,
    formatMoneyFromCny,
    intelSourceLine,
  };
})(typeof window !== 'undefined' ? window : global);