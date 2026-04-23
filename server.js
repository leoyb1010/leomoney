/**
 * Leomoney - Express 后端服务（重构版）
 * 轻路由层：只负责初始化、中间件、路由注册、静态资源、错误处理
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const pkg = require('./package.json');
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

app.use('/api', marketRoutes);
app.use('/api', accountRoutes);
app.use('/api', tradeRoutes);
app.use('/api', analysisRoutes);

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, req, res, next) => {
  console.error('[Server Error]', err);
  res.status(500).json({ success: false, error: err.message || '服务器内部错误' });
});

app.listen(PORT, () => {
  const status = getMarketStatus();
  console.log(`\n🦁 Leomoney v${pkg.version} 已启动`);
  console.log(`   地址: http://localhost:${PORT}`);
  console.log(`   A股: ${status.a.status} | 港股: ${status.hk.status} | 美股: ${status.us.status} | 加密: ${status.crypto.status}`);
  console.log(`   CLI:  node cli.js --help`);

  // 启动后台调度器（条件单自动触发 + 策略扫描）
  const { startScheduler } = require('./lib/scheduler');
  startScheduler();

  // Agent 状态
  const { isLLMReady } = require('./lib/agent/brain');
  console.log(`   Agent: ${isLLMReady() ? '✅ LLM 已配置' : '⚠️  LLM 未配置（设置 LLM_API_KEY 启用）'}`);
  console.log();
});
