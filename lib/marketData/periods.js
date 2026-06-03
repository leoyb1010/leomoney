const KLINE_PERIODS = {
  '1m': { scale: 1, yahooInterval: '1m', yahooRange: '1d', binance: '1m', stepMs: 60 * 1000 },
  '5m': { scale: 5, yahooInterval: '5m', yahooRange: '5d', binance: '5m', stepMs: 5 * 60 * 1000 },
  '15m': { scale: 15, yahooInterval: '15m', yahooRange: '5d', binance: '15m', stepMs: 15 * 60 * 1000 },
  '30m': { scale: 30, yahooInterval: '30m', yahooRange: '1mo', binance: '30m', stepMs: 30 * 60 * 1000 },
  '1h': { scale: 60, yahooInterval: '60m', yahooRange: '3mo', binance: '1h', stepMs: 60 * 60 * 1000 },
  '1D': { yahooInterval: '1d', yahooRange: '1y', binance: '1d', stepMs: 24 * 60 * 60 * 1000 },
  '1W': { yahooInterval: '1wk', yahooRange: '5y', binance: '1w', stepMs: 7 * 24 * 60 * 60 * 1000 },
  '1M': { yahooInterval: '1mo', yahooRange: '10y', binance: '1M', stepMs: 30 * 24 * 60 * 60 * 1000 },
};

function normalizeKlinePeriod(query = {}) {
  const raw = String(query.period || '').trim();
  if (KLINE_PERIODS[raw]) return raw;
  const scale = Number(query.scale);
  if ([1, 5, 15, 30].includes(scale)) return `${scale}m`;
  if (scale === 60) return '1h';
  return '5m';
}

module.exports = { KLINE_PERIODS, normalizeKlinePeriod };
