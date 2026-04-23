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

function parsePositiveNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseTradePayload(body) {
  const symbol = typeof body.symbol === 'string' ? body.symbol.trim() : '';
  const qty = parsePositiveNumber(body.qty);
  const price = body.price == null || body.price === '' ? null : parsePositiveNumber(body.price);
  if (!symbol || !qty) return { ok: false, error: '缺少参数: symbol, qty' };
  if (body.price != null && body.price !== '' && !price) return { ok: false, error: 'price 必须大于 0' };
  return {
    ok: true,
    symbol,
    qty,
    price,
    strategy: body.strategy,
    source: body.source,
    mode: body.mode || body.executionMode,
    runId: body.runId,
    decisionId: body.decisionId,
    evidenceRefs: body.evidenceRefs,
    riskApproved: body.riskApproved,
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
  const {
    symbol,
    name,
    side,
    action,
    orderType,
    type,
    triggerType,
    triggerPrice,
    qty,
    category,
    source,
    mode,
    executionMode,
    runId,
    decisionId,
    strategyId,
    evidenceRefs,
    riskApproved,
  } = req.body || {};
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
    source,
    mode: mode || executionMode,
    runId,
    decisionId,
    strategyId,
    evidenceRefs,
    riskApproved,
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

router.post('/watchlist', async (req, res) => {
  const { symbol, name, category, currency } = req.body || {};
  if (!symbol) return res.status(400).json({ success: false, error: '缺少参数: symbol' });
  const result = await addToWatchlist({ symbol, name, category, currency });
  res.status(result.success ? 200 : 400).json(result);
});

router.delete('/watchlist/:symbol', async (req, res) => {
  const result = await removeFromWatchlist(req.params.symbol);
  res.status(result.success ? 200 : 400).json(result);
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
