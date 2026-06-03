/**
 * 用户可见文案（内部 category 键不变）
 */
const CATEGORY_LABELS = {
  indices: '宏观指数',
  astocks: 'A股',
  hkstocks: '港股',
  usstocks: '权益',
  metals: '大宗',
  crypto: '数字资产',
};

const QUOTE_SOURCE_LABELS = {
  indices: '指数行情',
  astocks: 'A股行情',
  hkstocks: '港股行情',
  usstocks: '权益行情',
  metals: '大宗行情',
  crypto: '数字资产行情',
};

const PRODUCT_TAGLINE = '个人模拟仓 · 分析师工作台';
const PRODUCT_NAME = 'Leo Desk';

function categoryLabel(cat) {
  return CATEGORY_LABELS[cat] || cat;
}

function buildQuoteStatus(market, health = {}) {
  const cryptoOk = health.crypto?.ok !== false;
  return {
    lastUpdate: new Date().toISOString(),
    indices: { source: '综合指数', status: market?.a?.isOpen ? '刷新中' : '休市' },
    usstocks: { source: '权益行情', status: market?.us?.isOpen ? '刷新中' : '休市' },
    crypto: {
      source: '数字资产行情',
      status: cryptoOk ? '刷新中' : `暂不可用: ${health.crypto?.lastError || '网络'}`,
    },
    metals: { source: '大宗参考', status: '周期刷新' },
    astocks: { source: 'A股行情', status: market?.a?.isOpen ? '刷新中' : '休市' },
    hkstocks: { source: '港股行情', status: market?.hk?.isOpen ? '刷新中' : '休市' },
  };
}

module.exports = {
  PRODUCT_NAME,
  PRODUCT_TAGLINE,
  CATEGORY_LABELS,
  QUOTE_SOURCE_LABELS,
  categoryLabel,
  buildQuoteStatus,
};