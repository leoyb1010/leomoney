/**
 * 用户可见文案（内部 category 键不变）
 */
const CATEGORY_LABELS = {
  indices: '大盘指数',
  astocks: 'A股',
  hkstocks: '港股',
  usstocks: '美股',
  metals: '大宗商品',
  crypto: '加密',
};

const QUOTE_SOURCE_LABELS = {
  indices: '大盘行情',
  astocks: 'A股行情',
  hkstocks: '港股行情',
  usstocks: '美股行情',
  metals: '大宗商品行情',
  crypto: '加密行情',
};

const PRODUCT_TAGLINE = '美股 · 加密 · 个人模拟仓';
const PRODUCT_NAME = '个人模拟仓';

const VERSION_CHANNEL_LABELS = {
  beta: '测试版',
  'commercial-beta': '商用测试版',
  stable: '稳定版',
};

function channelLabel(channel) {
  return VERSION_CHANNEL_LABELS[channel] || '正式版';
}

function categoryLabel(cat) {
  return CATEGORY_LABELS[cat] || cat;
}

function buildQuoteStatus(market, health = {}) {
  const cryptoOk = health.crypto?.ok !== false;
  return {
    lastUpdate: new Date().toISOString(),
    indices: { source: '大盘行情', status: market?.us?.isOpen || market?.a?.isOpen ? '刷新中' : '休市' },
    usstocks: { source: '美股行情', status: market?.us?.isOpen ? '刷新中' : '休市' },
    crypto: {
      source: '加密行情',
      status: cryptoOk ? '刷新中' : `暂不可用: ${health.crypto?.lastError || '网络'}`,
    },
    metals: { source: '大宗商品参考', status: '周期刷新' },
    astocks: { source: 'A股行情', status: market?.a?.isOpen ? '刷新中' : '休市' },
    hkstocks: { source: '港股行情', status: market?.hk?.isOpen ? '刷新中' : '休市' },
  };
}

module.exports = {
  PRODUCT_NAME,
  PRODUCT_TAGLINE,
  VERSION_CHANNEL_LABELS,
  CATEGORY_LABELS,
  QUOTE_SOURCE_LABELS,
  categoryLabel,
  channelLabel,
  buildQuoteStatus,
};
