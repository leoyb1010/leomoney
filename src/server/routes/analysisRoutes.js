/**
 * Leomoney 分析/Agent 路由
 */
const express = require('express');
const router = express.Router();
const { 分析交易, 生成Agent总结, 生成决策输入, AGENT_PROMPT } = require('../../../src/analytics/tradeEngine');
const { getAccount } = require('../services/accountService');

router.get('/analysis', (req, res) => {
  try {
    const account = getAccount();
    const trades = account.history || [];
    const 分析结果 = 分析交易(trades);
    const 总结 = 生成Agent总结(分析结果);
    res.json({ success: true, accountId: account.accountId, 分析: 分析结果, 总结 });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/agent/prompt', (req, res) => {
  res.json({ success: true, prompt: AGENT_PROMPT });
});

router.post('/agent/decision-input', (req, res) => {
  try {
    const account = getAccount();
    const trades = account.history || [];
    const 分析结果 = 分析交易(trades);
    const marketData = req.body.market || null;
    const 输入数据 = 生成决策输入(分析结果, marketData);
    res.json({ success: true, accountId: account.accountId, input: 输入数据, prompt: AGENT_PROMPT });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
