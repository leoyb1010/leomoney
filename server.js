/**
 * Leomoney - Express 后端服务（重构版）
 * 轻路由层：只负责初始化、中间件、路由注册、静态资源、错误处理
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const { getMarketStatus } = require('./lib/market');

const marketRoutes = require('./src/server/routes/marketRoutes');
const accountRoutes = require('./src/server/routes/accountRoutes');
const tradeRoutes = require('./src/server/routes/tradeRoutes');
const analysisRoutes = require('./src/server/routes/analysisRoutes');

const app = express();
const PORT = process.env.PORT || 3210;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ===== API 路由注册 =====
app.use('/api', marketRoutes);
app.use('/api', accountRoutes);
app.use('/api', tradeRoutes);
app.use('/api', analysisRoutes);

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 全局错误处理
app.use((err, req, res, next) => {
  console.error('[Server Error]', err);
  res.status(500).json({ success: false, error: err.message || '服务器内部错误' });
});

app.listen(PORT, () => {
  const status = getMarketStatus();
  console.log(`\n🦁 Leomoney v1.5.0 已启动`);
  console.log(`   地址: http://localhost:${PORT}`);
  console.log(`   A股: ${status.a.status} | 港股: ${status.hk.status} | 美股: ${status.us.status} | 加密: ${status.crypto.status}`);
  console.log(`   CLI:  node cli.js --help\n`);
});
