function hasEnv(name) {
  return Boolean(String(process.env[name] || '').trim());
}

const FREE_MARKET_DATA_SOURCES = [
  {
    id: 'binance_public',
    label: 'Binance public market API',
    assetClasses: ['crypto'],
    coverage: 'Crypto spot and perpetual quotes/K-lines',
    cost: 'Free public API, rate limited',
    status: 'active',
  },
  {
    id: 'nasdaq_historical',
    label: 'Nasdaq public historical API',
    assetClasses: ['usstocks'],
    coverage: 'US stock daily/weekly/monthly historical bars',
    cost: 'Free public web endpoint, unofficial and may throttle',
    status: 'active',
  },
  {
    id: 'yahoo_chart',
    label: 'Yahoo Finance Chart API',
    assetClasses: ['usstocks', 'indices', 'hkstocks', 'astocks'],
    coverage: 'Intraday and historical chart bars',
    cost: 'Free public web endpoint, unofficial and may throttle',
    status: 'active',
  },
  {
    id: 'tencent_kline',
    label: 'Tencent public K-line',
    assetClasses: ['astocks', 'hkstocks', 'indices'],
    coverage: 'A/HK/index daily/weekly/monthly bars',
    cost: 'Free public web endpoint, unofficial and may throttle',
    status: 'active',
  },
  {
    id: 'sina_minute',
    label: 'Sina public minute line',
    assetClasses: ['astocks', 'indices'],
    coverage: 'A-share and index minute bars',
    cost: 'Free public web endpoint, unofficial and may throttle',
    status: 'active',
  },
];

const PAID_MARKET_DATA_SOURCES = [
  {
    id: 'alpaca',
    label: 'Alpaca Market Data',
    assetClasses: ['usstocks', 'options', 'crypto'],
    bestFor: 'US equities realtime SIP through a broker-style API',
    cost: 'Basic free IEX; Algo Trader Plus $99/mo for all US stock exchanges',
    env: ['ALPACA_API_KEY', 'ALPACA_API_SECRET'],
    signupUrl: 'https://alpaca.markets/',
    pricingUrl: 'https://docs.alpaca.markets/docs/about-market-data-api',
  },
  {
    id: 'polygon_massive',
    label: 'Massive/Polygon',
    assetClasses: ['usstocks', 'options', 'indices', 'forex', 'crypto'],
    bestFor: 'US realtime equities, historical aggregates, websocket scale',
    cost: 'Stocks Starter $29/mo, Developer $79/mo, Advanced $199/mo',
    env: ['POLYGON_API_KEY'],
    signupUrl: 'https://massive.com/',
    pricingUrl: 'https://massive.com/pricing',
  },
  {
    id: 'twelve_data',
    label: 'Twelve Data',
    assetClasses: ['global_stocks', 'forex', 'crypto', 'commodities'],
    bestFor: 'Broad global coverage with a single retail-friendly API',
    cost: 'Basic free 800/day; Grow from $29/mo or $79/mo depending billing view; Pro/Ultra higher tiers',
    env: ['TWELVE_DATA_API_KEY'],
    signupUrl: 'https://twelvedata.com/',
    pricingUrl: 'https://twelvedata.com/pricing',
  },
  {
    id: 'alpha_vantage',
    label: 'Alpha Vantage',
    assetClasses: ['usstocks', 'forex', 'crypto', 'indicators'],
    bestFor: 'Low-cost historical bars and indicators',
    cost: 'Free 25 requests/day; premium $49.99-$249.99/mo by request rate',
    env: ['ALPHA_VANTAGE_API_KEY'],
    signupUrl: 'https://www.alphavantage.co/',
    pricingUrl: 'https://www.alphavantage.co/premium/',
  },
  {
    id: 'eodhd',
    label: 'EODHD',
    assetClasses: ['global_stocks', 'fundamentals', 'news'],
    bestFor: 'Global EOD data, fundamentals, news, and add-on live data',
    cost: 'Free plan available; paid access from about GBP 19.99/mo',
    env: ['EODHD_API_KEY'],
    signupUrl: 'https://eodhd.com/',
    pricingUrl: 'https://eodhd.com/',
  },
  {
    id: 'databento',
    label: 'Databento',
    assetClasses: ['futures', 'equities', 'options', 'fx'],
    bestFor: 'Institutional-grade historical/live market microstructure data',
    cost: 'Usage-based $/GB; new users get $125 historical-data credits',
    env: ['DATABENTO_API_KEY'],
    signupUrl: 'https://databento.com/',
    pricingUrl: 'https://databento.com/pricing',
  },
  {
    id: 'intrinio',
    label: 'Intrinio',
    assetClasses: ['fundamentals', 'usstocks', 'options'],
    bestFor: 'Business licensed fundamentals, options, and US equities datasets',
    cost: 'Examples include US Fundamentals $9,600/yr; datasets priced separately',
    env: ['INTRINIO_API_KEY'],
    signupUrl: 'https://intrinio.com/',
    pricingUrl: 'https://intrinio.com/pricing',
  },
  {
    id: 'tushare',
    label: 'Tushare Pro',
    assetClasses: ['astocks', 'hkstocks', 'fundamentals'],
    bestFor: 'A-share daily/history/fundamental datasets',
    cost: 'Points/subscription model; common add-ons from hundreds to thousands RMB/year',
    env: ['TUSHARE_TOKEN'],
    signupUrl: 'https://tushare.pro/',
    pricingUrl: 'https://tushare.pro/document/1?doc_id=290',
  },
  {
    id: 'futu_openapi',
    label: 'Futu OpenAPI',
    assetClasses: ['hkstocks', 'astocks', 'usstocks', 'broker'],
    bestFor: 'HK/A quote permissions plus broker-side account integration',
    cost: 'Some mainland-IP personal HK LV2/A LV1 permissions are free; other quote cards bought in app',
    env: ['FUTU_OPEND_HOST', 'FUTU_OPEND_PORT'],
    signupUrl: 'https://www.futunn.com/OpenAPI',
    pricingUrl: 'https://openapi.futunn.com/futu-api-doc/intro/fee.html',
  },
];

function withRuntimeStatus(source) {
  const env = source.env || [];
  const configured = env.length === 0 || env.every(hasEnv);
  return {
    ...source,
    configured,
    missingEnv: env.filter(name => !hasEnv(name)),
  };
}

function getMarketDataPlan() {
  return {
    free: FREE_MARKET_DATA_SOURCES.map(withRuntimeStatus),
    paid: PAID_MARKET_DATA_SOURCES.map(withRuntimeStatus),
    chain: [
      'fresh_memory_cache',
      'free_public_provider',
      'configured_broker_or_paid_provider',
      'secondary_free_provider',
      'local_preview_fallback',
    ],
    preferredProvider: process.env.MARKET_DATA_PREFERRED_PROVIDER || 'free_first',
    cacheTtlMs: Number(process.env.MARKET_DATA_KLINE_CACHE_TTL_MS || 15000),
  };
}

module.exports = {
  FREE_MARKET_DATA_SOURCES,
  PAID_MARKET_DATA_SOURCES,
  getMarketDataPlan,
};
