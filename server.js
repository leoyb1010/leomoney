/**
 * Leomoney - Express 后端服务（重构版）
 * 轻路由层：只负责初始化、中间件、路由注册、静态资源、错误处理
 */

require('dotenv').config({ override: true });

const express = require('express');
const path = require('path');
const pkg = require('./package.json');
const { getMarketStatus } = require('./lib/market');
const { getRuntimeConfig } = require('./src/server/config');
const { applySecurity } = require('./src/server/security');

const marketRoutes = require('./src/server/routes/marketRoutes');
const accountRoutes = require('./src/server/routes/accountRoutes');
const tradeRoutes = require('./src/server/routes/tradeRoutes');
const analysisRoutes = require('./src/server/routes/analysisRoutes');
const agentRoutes = require('./src/server/routes/agentRoutes');
const systemRoutes = require('./src/server/routes/systemRoutes');
const intelRoutes = require('./src/server/routes/intelRoutes');

const { sseService } = require('./lib/sse');

function createApp(runtimeConfig = getRuntimeConfig()) {
  const app = express();
  app.locals.runtimeConfig = runtimeConfig;

  applySecurity(app, runtimeConfig);
  app.use(express.json({ limit: runtimeConfig.requestBodyLimit }));
  app.use(express.static(path.join(__dirname, 'public')));

  app.use('/api', marketRoutes);
  app.use('/api', accountRoutes);
  app.use('/api', tradeRoutes);
  app.use('/api', analysisRoutes);
  app.use('/api', agentRoutes);
  app.use('/api', systemRoutes);
  app.use('/api', intelRoutes);

  // SSE 实时推送
  app.get('/api/sse', (req, res) => {
    const channels = req.query.channels?.split(',') || ['quotes', 'agent', 'trade', 'system'];
    sseService.addClient(res, channels);
  });

  app.get('/api/*', (req, res) => {
    res.status(404).json({
      success: false,
      error: '接口不存在',
      code: 'NOT_FOUND',
      requestId: req.requestId,
    });
  });

  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    console.error('[Server Error]', err);
    const statusCode = err.statusCode
      || (err.type === 'entity.too.large' ? 413 : null)
      || (err.type === 'entity.parse.failed' ? 400 : 500);
    const error = err.type === 'entity.parse.failed' ? '请求 JSON 格式错误' : err.message;
    res.status(statusCode).json({
      success: false,
      error: statusCode === 500 ? (error || '服务器内部错误') : error,
      code: err.type === 'entity.parse.failed' ? 'INVALID_JSON' : err.code,
      requestId: req.requestId,
    });
  });

  return app;
}

function startServer(runtimeConfig = getRuntimeConfig()) {
  const app = createApp(runtimeConfig);
  const server = app.listen(runtimeConfig.port, () => {
  const status = getMarketStatus();

  // 数据文件完整性检查（v3 增强：自动备份恢复 + Schema 校验）
  try {
    const { startupIntegrityCheck } = require('./src/server/repositories/stateRepository');
    const check = startupIntegrityCheck();
    if (check.valid) {
      console.log(`   ✅ ${check.message}`);
    } else {
      console.warn(`   ⚠️  ${check.message}`);
    }
  } catch (e) {
    console.warn('   ⚠️  完整性检查异常:', e.message);
  }

  console.log(`\n📊 Leo Desk v${pkg.version} 已启动 — 个人模拟仓 · 分析师`);
  console.log(`   地址: http://localhost:${runtimeConfig.port}`);
  console.log(`   权益: ${status.us.status} | 数字资产: ${status.crypto.status} | 宏观: ${status.a.status}`);
  console.log(`   CLI:  node cli.js --help`);

  // 启动后台调度器（条件单自动触发 + 策略扫描）
  const { startScheduler } = require('./lib/scheduler');
  startScheduler();

  // 启动 SSE 实时推送
  sseService.startAll();

  const { startIntelPolling } = require('./lib/intel');
  startIntelPolling();

  // Agent 状态
  const { isLLMReady } = require('./lib/agent/brain');
  console.log(`   Agent: ${isLLMReady() ? '✅ LLM 已配置' : '⚠️  LLM 未配置（设置 LLM_API_KEY 启用）'}`);
  console.log();
  });

  return server;
}

let server = null;

function shutdown(signal) {
  console.log(`[Server] 收到 ${signal}，正在停止后台任务...`);
  try {
    const { stopScheduler } = require('./lib/scheduler');
    stopScheduler();
  } catch (err) {
    console.warn('[Server] 停止调度器失败:', err.message);
  }
  try {
    const { sseService } = require('./lib/sse');
    sseService.stopAll();
  } catch (err) {
    console.warn('[Server] 停止 SSE 失败:', err.message);
  }
  if (!server) process.exit(0);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}

if (require.main === module) {
  server = startServer();
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

module.exports = {
  createApp,
  startServer,
};
