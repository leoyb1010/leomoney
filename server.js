/**
 * Leomoney - Express 后端服务
 * REST API 供前端和 CLI/OpenClaw 调用
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const { getMarketStatus, shouldRefreshQuotes } = require('./lib/market');
const { getQuotes, getStockQuote, searchSymbols } = require('./lib/quotes');
const { getAccount, buy, sell, reset, createOrder, cancelOrder, getPendingOrders, checkPendingOrders, loadState } = require('./lib/trading');
const { 分析交易, 生成Agent总结, 生成决策输入, AGENT_PROMPT } = require('./src/analytics/tradeEngine');

const app = express();
const PORT = process.env.PORT || 3210;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ===== API ROUTES =====

app.get('/api/market', (req, res) => {
  res.json({ success: true, ...getMarketStatus() });
});

app.get('/api/quotes', async (req, res) => {
  try {
    const quotes = await getQuotes();
    res.json({ success: true, ...quotes, market: getMarketStatus() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/quotes/:symbol', async (req, res) => {
  try {
    const quote = await getStockQuote(req.params.symbol);
    if (!quote) return res.status(404).json({ success: false, error: '未找到该资产' });
    res.json({ success: true, quote });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.status(400).json({ success: false, error: '缺少参数: q' });
    const results = await searchSymbols(q);
    res.json({ success: true, keyword: q, count: results.length, results });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/account', (req, res) => {
  res.json({ success: true, ...getAccount() });
});

app.post('/api/trade/buy', (req, res) => {
  const { symbol, qty, price, strategy } = req.body;
  if (!symbol || !qty) return res.status(400).json({ success: false, error: '缺少参数: symbol, qty' });
  getStockQuote(symbol).then(quote => {
    if (!quote) return res.status(404).json({ success: false, error: '未找到该资产' });
    if (strategy) quote.strategy = strategy;
    const result = buy(quote, qty, price || null);
    res.status(result.success ? 200 : 400).json(result);
  }).catch(err => res.status(500).json({ success: false, error: err.message }));
});

app.post('/api/trade/sell', (req, res) => {
  const { symbol, qty, price, strategy } = req.body;
  if (!symbol || !qty) return res.status(400).json({ success: false, error: '缺少参数: symbol, qty' });
  getStockQuote(symbol).then(quote => {
    if (!quote) return res.status(404).json({ success: false, error: '未找到该资产' });
    if (strategy) quote.strategy = strategy;
    const result = sell(quote, qty, price || null);
    res.status(result.success ? 200 : 400).json(result);
  }).catch(err => res.status(500).json({ success: false, error: err.message }));
});

// ===== 条件单 API =====
app.post('/api/orders', (req, res) => {
  const { symbol, name, type, triggerType, triggerPrice, qty } = req.body;
  if (!symbol || !type || !triggerType || triggerPrice == null || !qty) {
    return res.status(400).json({ success: false, error: '缺少参数: symbol, type, triggerType, triggerPrice, qty' });
  }
  const result = createOrder({ symbol, name, type, triggerType, triggerPrice, qty });
  res.json(result);
});

app.get('/api/orders', (req, res) => {
  res.json({ success: true, orders: getPendingOrders() });
});

app.delete('/api/orders/:id', (req, res) => {
  const result = cancelOrder(req.params.id);
  res.status(result.success ? 200 : 400).json(result);
});

// ===== 条件单触发检查 =====
app.post('/api/orders/check', async (req, res) => {
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

app.post('/api/account/reset', (req, res) => {
  res.json(reset());
});

// ===== 分析 API（新增，不改动已有路由） =====
app.get('/api/analysis', (req, res) => {
  try {
    const state = loadState();
    const trades = state.history || [];
    const 分析结果 = 分析交易(trades);
    const 总结 = 生成Agent总结(分析结果);
    res.json({ success: true, 分析: 分析结果, 总结 });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/agent/prompt', (req, res) => {
  res.json({ success: true, prompt: AGENT_PROMPT });
});

app.post('/api/agent/decision-input', (req, res) => {
  try {
    const state = loadState();
    const trades = state.history || [];
    const 分析结果 = 分析交易(trades);
    const marketData = req.body.market || null;
    const 输入数据 = 生成决策输入(分析结果, marketData);
    res.json({ success: true, input: 输入数据, prompt: AGENT_PROMPT });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  const status = getMarketStatus();
  console.log(`\n🦁 Leomoney v1.1.0 已启动`);
  console.log(`   地址: http://localhost:${PORT}`);
  console.log(`   A股: ${status.a.status} | 港股: ${status.hk.status} | 美股: ${status.us.status} | 加密: ${status.crypto.status}`);
  console.log(`   CLI:  node cli.js --help\n`);
});
