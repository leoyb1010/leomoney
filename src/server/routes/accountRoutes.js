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

router.post('/accounts', (req, res) => {
  const { accountName, balance, color } = req.body;
  const result = createAccount(accountName || '新账户', balance || 1000000, color || '#3b82f6');
  res.json(result);
});

router.post('/accounts/:id/switch', (req, res) => {
  const result = switchAccount(req.params.id);
  res.json(result);
});

router.patch('/accounts/:id', (req, res) => {
  const result = updateAccount(req.params.id, req.body);
  res.json(result);
});

router.delete('/accounts/:id', (req, res) => {
  const result = deleteAccount(req.params.id);
  res.json(result);
});

router.get('/account', (req, res) => {
  res.json({ success: true, ...getAccount() });
});

router.post('/account/reset', (req, res) => {
  res.json(resetCurrentAccount());
});

module.exports = router;
