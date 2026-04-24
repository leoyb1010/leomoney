# Changelog

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
