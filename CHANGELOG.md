# Changelog

## v4.0.0 (2026-06-03) — V4 full product rebuild

### Product

- Rebuilt the frontend as `web/` React + Vite + TypeScript, built into `public/` for same-origin Express hosting.
- Switched the product default to US stocks + USD, with crypto next and A/HK/commodities under more markets.
- Restored the first-screen market overview strip with US indices, VIX, BTC and ETH.
- Replaced the confusing "权益" label with "美股" across backend labels and tests.
- Added full product navigation: dashboard, markets, symbol detail, trade, positions, orders, assets, watchlist, intel, agent, alerts and settings.
- Added mobile bottom navigation, dark/light theme, USD/CNY/USDT/HKD display currency and configurable up/down colors.

### Trading and portfolio

- Added simple paper buy/sell ticket backed by `/api/trade/buy` and `/api/trade/sell`.
- Added take-profit / stop-loss wording backed by conditional orders.
- Added `POST /api/account/positions/import` for recording existing positions or deducting cash to seed positions.
- Added holdings import UI, one-click close, orders page and recent fills.

### Intel and strategy

- Added structured related-symbol mapping to intel entries and LLM analysis, with quote validation.
- Localized both titles and snippets, with persistent cache in `data/intel-cache.json`.
- Added the rule that financial products, tickers, ETFs, indices, coin names and company names are not forcibly translated.
- Added intel SSE updates and expanded strategy templates: trend following, mean reversion, grid hint and DCA.

### Market data

- Added `GET /api/market/overview`.
- Added Yahoo Chart K-line support for US stocks.
- Added data-quality and source freshness metadata for quote rendering.

### Verification

- Added V4 contract tests for position import.
- Updated `npm run check`, `npm run verify`, README and environment documentation for V4.

## v3.1.0 (2026-05-23) — Commercial Beta hardening

### Product readiness

- Upgraded package and lockfile to `3.1.0`.
- Added `/api/readiness` and `/api/version`; expanded `/api/health` with version channel, simulated-trading declaration, persistence state, backup status, audit status, CORS mode, security posture, LLM readiness and Agent execution policy.
- Added portfolio analytics to account summary: NAV, exposure, cash ratio, Top1 concentration, unrealized PnL ratio and daily summary.
- Updated the static command-center UI copy to identify the v3.1.0 commercial beta and simulated-trading safety boundary.

### Safety, governance, and ops

- Added `.env.example` with CORS, data directory, paper execution, Agent execution, order limit and LLM timeout/retry controls.
- Added security middleware for request IDs, security headers, CORS origin allow-listing and JSON body limits.
- Hardened trade, order, automation, Agent config and market-data request validation.
- Routed legacy Agent proposal execution through `/api/automation/run`; direct Agent paper execution remains dry-run unless explicitly enabled.
- Added audit events for trades and conditional order lifecycle events.
- Added `scripts/secret-scan.js`, `npm run security:secrets`, `npm test`, improved `npm run check`, and GitHub Actions CI.

### Tests

- Added deterministic commercial-readiness tests for validation, order lot sizing, Agent execution policy and portfolio analytics.

---

## v1.9.0 (2026-04-24) — 上线前修复版

### 🔒 P0 安全修复

- **测试基线**：5 个测试文件 60+ 断言从 `console.assert` → `node:test` + `node:assert/strict`，失败现在设非零退出码
- **TLS 安全**：3 处硬编码 `rejectUnauthorized: false` → 环境变量 `TLS_REJECT_UNAUTHORIZED` 控制，默认 `true`

### 🛡️ P1 可靠性修复

- **Analyze 只读语义**：`analyzeSingle()` 和 `runStrategyScan()` 不再直接执行交易，只返回分析结果
- **熔断器真实 PnL**：`breaker.recordTrade()` 注入真实 `pnl`/`pnlPct`，单笔亏损/日亏损保护生效
- **日亏损逻辑**：`dailyLossPct` 只累计亏损（负 pnlPct），盈利不再抵消日亏损阈值
- **风控计数**：`riskManager.recordTrade()` 成功+失败都计数，避免失败交易绕过每日限制
- **SELL 方案数量**：卖出方案基于持仓 `sellableQty`，不再错误使用 `cash.available`

### 🏗️ P2 架构升级

- **多账户隔离**：5 个全局单例（signals/proposals/circuitBreaker/riskManager/agentConfig）→ `Map<accountId, instance>` 隔离
- **Scheduler 监听器去重**：熔断事件监听改用具名函数 + `stopScheduler()` 中 `.off()` 移除，防止累积
- **Proxy 向后兼容**：`breaker`/`riskManager` 用 ES6 Proxy 保持旧代码无需修改

### 📋 配置变更

- `.env` 新增 `TLS_REJECT_UNAUTHORIZED=true`（默认安全）
- 新增 `getBreakerForAccount(accountId)` / `getRiskManagerForAccount(accountId)` API
- 新增 `removeBreakerForAccount` / `removeRiskManagerForAccount` / `removeStoreForAccount` 清理 API

---

## v1.8.0 (2026-04-24) — 五阶段核心重构

- P0 交易正确性：Decimal + 状态机 + 冻结账本 + 条件单修复
- P1 Agent 可靠性：observationBuilder + schema 校验 + 审计链 + 风控闭环
- P2 风控异常：硬风控 12 项 + FIFO 持仓 + 权益曲线最大回撤
- P3 架构回测：事件总线 + 撮合/结算服务拆分 + 回测时间语义
- P4 UI 重构：cash/positions 显示 + 预估冻结 + 风控详情
- 36 项单元测试全部通过

## v1.7.0 (2026-04-24) — Agent 自动交易系统

- Agent L1-3 全量上线
- 熔断器 + 风控引擎 + 策略模板 + 信号引擎 + 调度器 v2
- 16 个 Agent API + 前端控制台
