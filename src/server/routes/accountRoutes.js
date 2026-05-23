/**
 * Leomoney 账户管理路由
 */
const express = require('express');
const router = express.Router();
const {
  getAccount, getAccounts, createAccount, switchAccount,
  updateAccount, deleteAccount, resetCurrentAccount
} = require('../services/accountService');
const { getRuntimeConfig } = require('../config');

router.get('/accounts', (req, res) => {
  res.json({ success: true, accounts: getAccounts(), currentAccountId: getAccount().accountId });
});

router.post('/accounts', async (req, res) => {
  const { accountName, balance, color } = req.body;
  const config = getRuntimeConfig();
  const numericBalance = Number(balance || 1000000);
  if (!Number.isFinite(numericBalance) || numericBalance <= 0 || numericBalance > config.maxOrderNotionalCny * 100) {
    return res.status(400).json({ success: false, error: '初始资金不合法或超过系统上限' });
  }
  const safeName = String(accountName || '新账户').trim().slice(0, 60);
  const safeColor = /^#[0-9a-fA-F]{6}$/.test(String(color || '')) ? color : '#3b82f6';
  const result = await createAccount(safeName, numericBalance, safeColor);
  res.status(result.success ? 200 : 400).json(result);
});

router.post('/accounts/:id/switch', async (req, res) => {
  const result = await switchAccount(req.params.id);
  res.status(result.success ? 200 : 400).json(result);
});

router.patch('/accounts/:id', async (req, res) => {
  const updates = {};
  if (req.body.accountName !== undefined) updates.accountName = String(req.body.accountName).trim().slice(0, 60);
  if (req.body.avatar !== undefined) updates.avatar = String(req.body.avatar).trim().slice(0, 300);
  if (req.body.color !== undefined && /^#[0-9a-fA-F]{6}$/.test(String(req.body.color))) updates.color = req.body.color;
  const result = await updateAccount(req.params.id, updates);
  res.status(result.success ? 200 : 400).json(result);
});

router.delete('/accounts/:id', async (req, res) => {
  const result = await deleteAccount(req.params.id);
  res.status(result.success ? 200 : 400).json(result);
});

router.get('/account', (req, res) => {
  res.json({ success: true, ...getAccount() });
});

router.post('/account/reset', async (req, res) => {
  const result = await resetCurrentAccount();
  res.status(result.success ? 200 : 400).json(result);
});

module.exports = router;
