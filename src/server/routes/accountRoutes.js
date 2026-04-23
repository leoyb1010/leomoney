/**
 * Leomoney 账户管理路由
 */
const express = require('express');
const router = express.Router();
const {
  getAccount, getAccounts, createAccount, switchAccount,
  updateAccount, deleteAccount, resetCurrentAccount
} = require('../services/accountService');

router.get('/accounts', (req, res) => {
  res.json({ success: true, accounts: getAccounts(), currentAccountId: getAccount().accountId });
});

router.post('/accounts', async (req, res) => {
  const { accountName, balance, color } = req.body;
  const result = await createAccount(accountName || '新账户', balance || 1000000, color || '#3b82f6');
  res.status(result.success ? 200 : 400).json(result);
});

router.post('/accounts/:id/switch', async (req, res) => {
  const result = await switchAccount(req.params.id);
  res.status(result.success ? 200 : 400).json(result);
});

router.patch('/accounts/:id', async (req, res) => {
  const result = await updateAccount(req.params.id, req.body);
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
