/**
 * Leomoney 交易/条件单/自选路由
 */
const express = require('express');
const router = express.Router();
const { getStockQuote, getQuotes } = require('../../../lib/quotes');
const { buy, sell } = require('../services/tradingService');
const { createOrder, cancelOrder, getPendingOrders, getAllOrders, checkPendingOrders } = require('../services/orderService');
const { getWatchlist, addToWatchlist, removeFromWatchlist } = require('../services/watchlistService');
const { buildAccountSummary } = require('../services/summaryService');
const { getAllRates } = require('../../../lib/fx');
const { parseBody, parseSymbol } = require('../validation');

function parseTradePayload(body) {
  const parsed = parseBody('tradePayload', body);
  if (!parsed.ok) return { ok: false, error: parsed.error, issues: parsed.issues };
  const data = parsed.data;
  return {
    ok: true,
    ...data,
    price: data.price || null,
    mode: data.mode || data.executionMode,
  };
}

async function handleTrade(res, side, body) {
  const parsed = parseTradePayload(body);
  if (!parsed.ok) return res.status(400).json({ success: false, error: parsed.error });

  try {
    const quote = await getStockQuote(parsed.symbol);
    if (!quote) return res.status(404).json({ success: false, error: '未找到该资产' });
    if (parsed.strategy) quote.strategy = parsed.strategy;
    if (parsed.source) quote.source = parsed.source;
    if (parsed.mode) quote.mode = parsed.mode;
    if (parsed.runId) quote.runId = parsed.runId;
    if (parsed.decisionId) quote.decisionId = parsed.decisionId;
    if (Array.isArray(parsed.evidenceRefs)) quote.evidenceRefs = parsed.evidenceRefs;
    if (typeof parsed.riskApproved === 'boolean') quote.riskApproved = parsed.riskApproved;

    const result = side === 'buy'
      ? await buy(quote, parsed.qty, parsed.price)
      : await sell(quote, parsed.qty, parsed.price);
    return res.status(result.success ? 200 : 400).json(result);
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

router.post('/trade/buy', async (req, res) => {
  await handleTrade(res, 'buy', req.body || {});
});

router.post('/trade/sell', async (req, res) => {
  await handleTrade(res, 'sell', req.body || {});
});

router.post('/orders', async (req, res) => {
  const bodyCheck = parseBody('orderPayload', req.body || {});
  if (!bodyCheck.ok) return res.status(400).json({ success: false, error: bodyCheck.error, issues: bodyCheck.issues });
  const { symbol, name, side, action, orderType, type, triggerType, triggerPrice, qty, category } = bodyCheck.data;
  const normalizedOrderType = (orderType || side || action || '').toLowerCase();
  const legacyTriggerType = ['gte', 'lte'].includes(String(type || '').toLowerCase()) ? String(type).toLowerCase() : '';
  const finalType = normalizedOrderType || (['buy', 'sell'].includes(String(type || '').toLowerCase()) ? String(type).toLowerCase() : '');
  const finalTriggerType = String(triggerType || legacyTriggerType || '').toLowerCase();
  const finalTriggerPrice = triggerPrice ?? req.body?.price;

  const result = await createOrder({
    symbol,
    name,
    type: finalType,
    triggerType: finalTriggerType,
    triggerPrice: finalTriggerPrice,
    qty,
    category,
  });
  res.status(result.success ? 200 : 400).json(result);
});

router.get('/orders', (req, res) => {
  res.json({ success: true, orders: getAllOrders() });
});

router.delete('/orders/:id', async (req, res) => {
  const result = await cancelOrder(req.params.id);
  res.status(result.success ? 200 : 400).json(result);
});

router.post('/orders/check', async (req, res) => {
  try {
    const quotes = await getQuotes();
    const prices = {};
    ['astocks', 'hkstocks', 'usstocks', 'metals', 'crypto'].forEach(cat => {
      (quotes[cat] || []).forEach(s => {
        prices[s.symbol] = s.price;
      });
    });
    const executed = await checkPendingOrders(prices);
    res.json({ success: true, executed, remaining: getPendingOrders().length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/watchlist', (req, res) => {
  res.json({ success: true, watchlist: getWatchlist() });
});

router.post('/watchlist', (req, res) => {
  const { symbol, name, category, currency } = req.body;
  const parsed = parseSymbol(symbol);
  if (!parsed.ok) return res.status(400).json({ success: false, error: parsed.error });
  res.json(addToWatchlist({ symbol: parsed.symbol, name, category, currency }));
});

router.delete('/watchlist/:symbol', (req, res) => {
  res.json(removeFromWatchlist(req.params.symbol));
});

router.get('/account/summary', async (req, res) => {
  try {
    const summary = await buildAccountSummary(getQuotes, getStockQuote, getAllRates);
    res.json(summary);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/fx', (req, res) => {
  res.json({ success: true, baseCurrency: 'CNY', rates: getAllRates() });
});

module.exports = router;
