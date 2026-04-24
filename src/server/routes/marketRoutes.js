/**
 * Leomoney 市场/行情路由
 */
const express = require('express');
const router = express.Router();
const { getMarketStatus } = require('../../../lib/market');
const { getQuotes, getStockQuote, searchSymbols, getApiHealth } = require('../../../lib/quotes');

router.get('/market', (req, res) => {
  const health = getApiHealth();
  res.json({ success: true, ...getMarketStatus(), apiHealth: health });
});

router.get('/quotes', async (req, res) => {
  try {
    const quotes = await getQuotes();
    const market = getMarketStatus();
    const quoteStatus = {
      lastUpdate: new Date().toISOString(),
      astocks: { source: '新浪实时', status: market.a.isOpen ? '实时刷新' : '休市冻结' },
      hkstocks: { source: '新浪实时', status: market.hk.isOpen ? '实时刷新' : '休市冻结' },
      usstocks: { source: '新浪实时', status: market.us.isOpen ? '实时刷新' : '休市冻结' },
      metals: { source: '新浪期货/模拟', status: '周期刷新' },
      crypto: { source: '新浪期货/模拟波动', status: market.crypto.isOpen ? '模拟刷新' : '模拟刷新' },
    };
    res.json({ success: true, ...quotes, market, quoteStatus });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/quotes/:symbol', async (req, res) => {
  try {
    const quote = await getStockQuote(req.params.symbol);
    if (!quote) return res.status(404).json({ success: false, error: '未找到该资产' });
    res.json({ success: true, quote });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.status(400).json({ success: false, error: '缺少参数: q' });
    const results = await searchSymbols(q);
    res.json({ success: true, keyword: q, count: results.length, results });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
