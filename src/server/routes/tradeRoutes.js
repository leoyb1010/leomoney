/**
 * Leomoney 交易/条件单/自选路由
 */
const express = require('express');
const router = express.Router();
const { getStockQuote } = require('../../../lib/quotes');
const { getQuotes } = require('../../../lib/quotes');
const { buy, sell } = require('../services/tradingService');
const { createOrder, cancelOrder, getPendingOrders, getAllOrders, checkPendingOrders } = require('../services/orderService');
const { getWatchlist, addToWatchlist, removeFromWatchlist } = require('../services/watchlistService');
const { buildAccountSummary } = require('../services/summaryService');
const { getAllRates } = require('../../../lib/fx');

// 现货交易
router.post('/trade/buy', (req, res) => {
  const { symbol, qty, price, strategy } = req.body;
  if (!symbol || !qty) return res.status(400).json({ success: false, error: '缺少参数: symbol, qty' });
  getStockQuote(symbol).then(quote => {
    if (!quote) return res.status(404).json({ success: false, error: '未找到该资产' });
    if (strategy) quote.strategy = strategy;
    const result = buy(quote, qty, price || null);
    res.status(result.success ? 200 : 400).json(result);
  }).catch(err => res.status(500).json({ success: false, error: err.message }));
});

router.post('/trade/sell', (req, res) => {
  const { symbol, qty, price, strategy } = req.body;
  if (!symbol || !qty) return res.status(400).json({ success: false, error: '缺少参数: symbol, qty' });
  getStockQuote(symbol).then(quote => {
    if (!quote) return res.status(404).json({ success: false, error: '未找到该资产' });
    if (strategy) quote.strategy = strategy;
    const result = sell(quote, qty, price || null);
    res.status(result.success ? 200 : 400).json(result);
  }).catch(err => res.status(500).json({ success: false, error: err.message }));
});

// 条件单
router.post('/orders', (req, res) => {
  // 兼容旧版前端: type=gte/ete, price → triggerType, triggerPrice
  const { symbol, name, type, triggerType, triggerPrice, qty } = req.body;
  const finalTriggerType = triggerType || type; // 旧版用 type 作 triggerType
  const finalTriggerPrice = triggerPrice || req.body.price;
  if (!symbol || !finalTriggerType || finalTriggerPrice == null || !qty) {
    return res.status(400).json({ success: false, error: '缺少参数: symbol, type, price, qty' });
  }
  res.json(createOrder({ symbol, name, type: finalTriggerType, triggerType: finalTriggerType, triggerPrice: finalTriggerPrice, qty }));
});

router.get('/orders', (req, res) => {
  res.json({ success: true, orders: getAllOrders() });
});

router.delete('/orders/:id', (req, res) => {
  const result = cancelOrder(req.params.id);
  res.status(result.success ? 200 : 400).json(result);
});

router.post('/orders/check', async (req, res) => {
  try {
    const quotes = await getQuotes();
    const prices = {};
    ['astocks', 'hkstocks', 'usstocks', 'metals', 'crypto'].forEach(cat => {
      (quotes[cat] || []).forEach(s => { prices[s.symbol] = s.price; });
    });
    const executed = checkPendingOrders(prices);
    res.json({ success: true, executed, remaining: getPendingOrders().length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 自选
router.get('/watchlist', (req, res) => {
  res.json({ success: true, watchlist: getWatchlist() });
});

router.post('/watchlist', (req, res) => {
  const { symbol, name, category, currency } = req.body;
  if (!symbol) return res.status(400).json({ success: false, error: '缺少参数: symbol' });
  res.json(addToWatchlist({ symbol, name, category, currency }));
});

router.delete('/watchlist/:symbol', (req, res) => {
  res.json(removeFromWatchlist(req.params.symbol));
});

// 汇总
router.get('/account/summary', async (req, res) => {
  try {
    const summary = await buildAccountSummary(getQuotes, getStockQuote, getAllRates);
    res.json(summary);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 汇率
router.get('/fx', (req, res) => {
  res.json({ success: true, baseCurrency: 'CNY', rates: getAllRates() });
});

module.exports = router;
