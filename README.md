# 🦁 Leomoney

AI-Driven Simulated Trading Platform | AI 驱动模拟交易平台

![Leomoney Screenshot](screenshot.png)

## Features

- 👤 **多账户平台** — 创建/切换/删除账户，资金/持仓/自选/条件单/复盘完全隔离
- 🏠 **Dashboard 总览** — 总资产/资金/持仓/KPI + 市场动态 + 关注标的 + 最近成交
- 📋 **条件单管理** — 独立订单页，统计待触发/已执行/失败，完整生命周期管理
- 📊 **全市场行情** — A股/港股/美股/贵金属/加密货币实时数据（新浪财经 API）
- 🔍 **全市场搜索** — 东方财富搜索 API，支持股票/基金/ETF 全品种检索
- 📈 **K线图** — LightweightCharts v4 专业K线图，支持1分/5分/15分/30分/日线多周期切换
- 💰 **模拟交易** — 买入/卖出，100 万虚拟资金起步
- 📊 **资产净值曲线** — Dashboard 净值走势图，支持7天/30天/90天/全部切换
- 🥧 **持仓分布可视化** — 饼图+盈亏条形图，一目了然
- 🕐 **市场状态** — 自动检测 A股/港股/美股/加密交易时段，休市行情冻结
- 🧠 **交易分析** — 胜率/盈亏比/最大回撤/策略统计（按账户隔离）
- 🤖 **Agent 自动交易** — 三级安全模式（监控/顾问/代理）+ 熔断器 + 风控引擎 + 多策略 + 时间轴信号流
- 🏷️ **策略标签** — 交易记录支持 strategy 字段，按策略统计表现
- 📱 **移动端适配** — 底部 Tab Bar + 响应式布局
- 🛡️ **数据安全** — 原子写入 + 3级自动备份 + API 多源容灾

## Tech Stack

- **Backend**: Node.js + Express（路由层 / services 层 / repositories 层 / domain 层四层分离）
- **Frontend**: 纯原生 HTML/CSS/JS，模块化架构（main.js 统一入口 + features/ 功能域模块）
- **Data**: 新浪财经 + 东方财富 API（免费，无需 API Key）
- **AI**: DeepSeek / Qwen / OpenAI / Ollama 多 LLM Provider 支持
- **持久化**: JSON 文件（`data/state.json`，多账户容器格式，旧版自动迁移）

## Quick Start

```bash
npm install
npm start
```

打开 http://localhost:3210

### Agent 模式配置（可选）

Agent 功能需要 LLM API Key 才能激活：

```bash
# DeepSeek（默认）
export LLM_PROVIDER=deepseek
export LLM_API_KEY=your-api-key
export LLM_MODEL=deepseek-chat  # 可选，覆盖默认模型

# 或 OpenAI
export LLM_PROVIDER=openai
export LLM_API_KEY=sk-xxx

# 搜索引擎（可选，增强信息采集）
export SEARCH_API_URL=https://your-search-api
export SEARCH_API_KEY=your-search-key
```

## CLI

```bash
# 查看行情
node cli.js quote 600519

# 全市场搜索
node cli.js search 茅台

# 买入/卖出
node cli.js buy 600519 100 1800
node cli.js sell 600519 100 1900

# 查看持仓
node cli.js portfolio

# OpenClaw 自动化指南
node cli.js auto
```

## OpenClaw Integration

三种接入方式：

1. **CLI 直调** — `node cli.js <command>` （无需启动服务器）
2. **REST API** — `http://localhost:3210/api/*` （需先 `node server.js`）
3. **定时 Cron** — 周期性拉行情 + 条件单检查

详细指南：`node cli.js auto`

---

## 🤖 Agent 自动交易系统

### 三级运行模式

| Level | 名称 | 行为 | 风控 |
|-------|------|------|------|
| **L1** | 监控者 | 只看不动手，推送信号到控制台 | 无执行能力 |
| **L2** | 顾问者 | 生成交易方案，需人工确认后执行 | 基础仓位检查 |
| **L3** | 代理者 | 置信度 ≥ 阈值时自动执行交易 | 严格检查：置信度≥70%、风险≠高、日交易≤10、时段限制、自动止损3%/止盈8% |

### 熔断机制

| 触发条件 | 动作 | 恢复 |
|----------|------|------|
| 单笔亏损 > 3% | 熔断，降一级 | 冷却 4h 后试探恢复 |
| 连续 3 次亏损 | 熔断，降一级 | 冷却 4h 后试探恢复 |
| 日亏损 > 5% | 熔断，降一级 | 冷却 4h 后试探恢复 |
| 熔断器 OPEN → HALF_OPEN | 试探期允许 1 笔交易 | 成功则 CLOSED，失败则回 OPEN |

### 预设策略

| 策略 | 风格 | 适合场景 |
|------|------|----------|
| 🛡️ 保守策略 | 低仓位(10%)、严止损(2%)、高置信度(85%) | 震荡市、新手 |
| ⚖️ 均衡策略 | 中仓位(20%)、标准止损(3%)、中置信度(75%) | 通用 |
| 🔥 激进策略 | 高仓位(30%)、宽止损(5%)、低置信度(65%) | 趋势明确、进取型 |
| 📈 动量策略 | 追涨杀跌、均线突破 | 强趋势市场 |
| 📰 事件驱动 | 财报/政策/新闻事件 | 重大事件窗口 |

支持自定义策略 Prompt，注入实时行情/新闻/持仓数据。

### 风控引擎

- **仓位限制**：单笔最大 20%，总仓位上限 70%
- **亏损限制**：日亏损上限 5%
- **时段限制**：仅 A 股交易时段（09:30-11:30, 13:00-15:00）
- **自动止损止盈**：每笔自动交易附带止损 3% / 止盈 8% 条件单
- **交易频率**：日交易上限 10 笔

### Agent API

#### 配置管理

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/agent/config` | GET | 获取 Agent 配置（等级/状态/策略/风控参数） |
| `/api/agent/config` | PATCH | 更新配置（level, enabled, strategy 等） |
| `/api/agent/status` | GET | 获取运行状态（LLM/Agent/熔断器/风控） |

#### 策略管理

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/agent/strategies` | GET | 获取所有策略列表（预设+自定义） |
| `/api/agent/strategies/custom` | POST | 创建自定义策略 |

#### 信号 & 方案

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/agent/signal` | POST | 手动生成信号（传入 symbol） |
| `/api/agent/signals` | GET | 获取信号列表 |
| `/api/agent/proposals` | GET | 获取方案列表 |
| `/api/agent/proposals/:id/approve` | POST | 批准方案（L2 模式） |
| `/api/agent/proposals/:id/reject` | POST | 拒绝方案 |
| `/api/agent/proposals/:id/execute` | POST | 手动执行方案 |

#### 安全控制

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/agent/circuit-breaker` | GET | 获取熔断器状态 |
| `/api/agent/circuit-breaker/reset` | POST | 重置熔断器 |
| `/api/agent/risk` | GET | 获取风控状态 |
| `/api/agent/risk` | PATCH | 更新风控参数 |
| `/api/agent/daily-report` | GET | 获取今日交易报告 |

#### 分析 & 决策（旧接口，兼容保留）

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/analysis` | GET | 交易分析（当前账户） |
| `/api/agent/prompt` | GET | 获取 Agent 决策提示词 |
| `/api/agent/decision-input` | POST | 生成 Agent 决策输入数据 |

### 账户管理 API

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/accounts` | GET | 获取账户列表及当前账户 ID |
| `/api/accounts` | POST | 创建新账户（name, balance, color） |
| `/api/accounts/:id/switch` | POST | 切换当前账户 |
| `/api/accounts/:id` | PATCH | 更新账户信息 |
| `/api/accounts/:id` | DELETE | 归档账户（软删除） |
| `/api/account/reset` | POST | 重置当前账户（不影响其他账户） |

Agent 输出格式：
```json
{
  "action": "买入 | 卖出 | 观望",
  "仓位比例": 0.3,
  "置信度": 0.7,
  "原因": "趋势明确，突破前高",
  "风险等级": "低 | 中 | 高"
}
```

## Project Structure

```
leomoney/
├── server.js                 # Express 服务入口（轻路由层）
├── cli.js                    # 命令行工具（OpenClaw 可直接调用）
├── lib/
│   ├── quotes.js             # 行情数据（新浪+东方财富）
│   ├── trading.js            # 交易引擎（兼容层，逐步迁移到 services）
│   ├── market.js             # 市场状态检测
│   ├── fx.js                 # 汇率层
│   ├── scheduler.js          # 后台调度器 v2（条件单+信号+策略+熔断）+ 多账户隔离
│   └── agent/
│       ├── brain.js          # LLM 多 Provider 调用（DeepSeek/Qwen/OpenAI/Ollama）
│       ├── eyes.js           # 信息采集（东财新闻+通用搜索）
│       ├── executor.js       # 决策执行（只读分析+风控门控+止损挂单）
│       ├── circuitBreaker.js # 熔断器（三态状态机+降级+多账户隔离）
│       ├── riskManager.js    # 风控引擎（仓位/亏损/时段+止损止盈+多账户隔离）
│       ├── promptTemplates.js# 策略模板（5 预设+自定义 Prompt）
│       └── signalEngine.js   # 信号引擎（采集→LLM→信号→方案→执行+多账户隔离）
├── src/
│   ├── server/
│   │   ├── routes/           # 路由层（market/account/trade/analysis+agent）
│   │   ├── services/         # 服务层（account/trading/order/watchlist/summary）
│   │   ├── repositories/     # 持久化层（stateRepository）
│   │   └── domain/            # 领域模型（models.js）
│   └── analytics/
│       ├── tradeEngine.js     # 分析总入口 + Agent 决策
│       ├── position.js        # 持仓计算（FIFO 成本）
│       └── metrics.js         # 指标计算（胜率/回撤/策略统计）
├── public/
│   ├── index.html             # 主页面（无内联事件）
│   ├── css/                   # 样式（tokens/components/app）
│   └── js/
│       ├── main.js            # 前端统一入口（事件绑定 + 初始化）
│       ├── app.js             # 兼容壳（15 行）
│       └── features/          # 功能模块
│           ├── market.js      # 行情视图
│           ├── trade.js       # 交易视图
│           ├── portfolio.js   # 资产视图
│           ├── dashboard.js   # Dashboard 总览
│           ├── analysis.js    # 复盘视图
│           └── agent.js       # 🤖 Agent 控制台（新增）
├── data/                      # 运行时数据（gitignore）
└── package.json
```

---

## Changelog

### v2.0.1 — 2026-04-25

**🔧 v2.0 后续修复**

- **K线图高度限制** — 380px + max 45vh，防止撑爆视图
- **LLM 模型升级** — 默认模型切换为 `deepseek-v4-pro`
- **Agent 自动交易修复** — 16个 API 端点补注册到 Express（原全部 404）；配置持久化到 state.json；无持仓/自选时用热门标的兜底扫描；扫描间隔 300s→60s

### v2.0.0 — 2026-04-24

**🦁 全面视觉与工程升级 — v2.0 大版本**

#### 🔴 P1 核心可视化升级
- **LightweightCharts K线图** — 替换原 Canvas 自绘，专业级K线图（十字线、缩放、拖拽），支持1分/5分/15分/30分/日线
- **资产净值曲线** — Dashboard 新增净值走势面积图，7天/30天/90天/全部切换
- **持仓分布可视化** — 环形饼图（市值占比）+ 盈亏横向条形图，资产视图顶部

#### 🟠 P2 Agent 控制台 UI 重构
- **状态卡片网格** — 主卡片（等级徽章+Agent状态+熔断器指示灯）+ 3个指标卡（LLM/今日交易/今日盈亏）
- **信号时间轴** — 信号流改为时间轴样式（圆点+时间+内容卡片），买卖信号一目了然

#### 🟡 P3 视觉系统升级
- **Header 玻璃态** — backdrop-filter 毛玻璃效果
- **渐变按钮** — 买入渐变绿→青、卖出渐变红→紫，hover 发光
- **KPI 卡片悬停** — 上浮+品牌色阴影
- **侧边栏激活态** — 左侧品牌色竖线+图标发光
- **数字变化动效** — numberFlash 动画
- **移动端适配** — 侧边栏变底部 Tab Bar，KPI 2列→1列，弹窗全屏

#### 🟢 P4 工程健壮性
- **原子写入** — state.json 先写临时文件再重命名，防崩溃致数据丢失
- **3级自动备份** — 每次写入前轮转 backup.1→2→3，损坏时自动从备份恢复
- **启动完整性检查** — server.js 启动验证 state.json JSON 合法性
- **API 多源容灾** — 新浪/东方财富 API 健康追踪，连续3次失败自动降级，5分钟后恢复尝试
- **API 状态指示器** — Header 显示数据源健康状态（绿/黄/红点）

### v1.9.0 — 2026-04-24

**🔒 上线前修复 — 安全/可靠性/架构全面加固**

#### P0 安全修复
- **测试基线**：5 个测试文件 60+ 断言从 `console.assert` → `node:test` + `node:assert/strict`，失败设非零退出码
- **TLS 安全**：3 处硬编码 `rejectUnauthorized: false` → 环境变量 `TLS_REJECT_UNAUTHORIZED` 控制，默认 `true`

#### P1 可靠性修复
- **Analyze 只读语义**：`analyzeSingle()` 不再执行交易，只返回分析结果
- **熔断器真实 PnL**：`breaker.recordTrade()` 注入真实 `pnl`/`pnlPct`，单笔/日亏损保护生效
- **日亏损逻辑**：`dailyLossPct` 只累计亏损，盈利不再抵消
- **风控计数**：`riskManager.recordTrade()` 成功+失败都计数
- **SELL 方案数量**：卖出方案基于持仓 `sellableQty`，不再用 `cash.available`

#### P2 架构升级
- **多账户隔离**：5 个全局单例 → `Map<accountId, instance>` 隔离，Proxy 向后兼容
- **Scheduler 监听器去重**：具名函数 + `.off()` 移除，防止重启累积
- 新增环境变量：`TLS_REJECT_UNAUTHORIZED`（默认 true）

### v1.8.0 — 2026-04-24

**🔧 五阶段核心交易正确性重构**

本次重构按 Phase 1→5 顺序完成，每阶段独立提交、独立测试、独立可运行。

#### Phase 1 — P0 核心交易正确性
- **Decimal 金额计算** (`src/server/domain/money.js`) — 消灭浮点误差，统一金额/数量/成本/盈亏计算
- **订单状态机** (`src/server/domain/orderStateMachine.js`) — 10 状态 + 流转表，禁止非法状态跳转
- **冻结/解冻账本** (`src/server/domain/ledger.js`) — 买单冻结现金（含手续费预留），卖单冻结持仓，撤单/结算失败自动回滚
- **条件单修复** — 创建即冻结资源，触发只做状态流转，不再临时抢资源
- **旧账户自动迁移** — balance→cash / holdings→positions

#### Phase 2 — P1 Agent 决策链路可靠性
- **Observation Builder** (`lib/agent/observationBuilder.js`) — 统一构建行情/账户/持仓/订单/风控/时段完整快照
- **Schema 校验** (`lib/agent/schema.js`) — LLM 输出严格解析，非法 JSON/字段/动作 安全降级为 HOLD
- **审计链** (`lib/agent/audit.js`) — observation→prompt→raw→parsed→risk→execution 完整链路持久化到 `data/audit/`
- **执行链路修复** — 所有交易调用加 await，执行前重新读取账户状态 + 二次风控

#### Phase 3 — P2 风控与异常处理
- **硬风控服务** (`src/server/services/riskControlService.js`) — 12 项前置检查（单笔限额/仓位/日累计/禁买名单/价格跳变/空值保护/最低净值/挂单冲突等）
- **持仓 FIFO 成本法** (`src/analytics/position.js`) — 超卖直接报错
- **最大回撤修复** (`src/analytics/metrics.js`) — 基于权益曲线计算，新增手续费占比

#### Phase 4 — P3 架构与回测可信度
- **事件总线** (`src/server/domain/events.js`) — 15 种事件类型 + 内存缓存 + 文件持久化 + 订单生命周期追踪
- **撮合服务** (`src/server/services/matchingService.js`) — 模拟盘即时撮合 / 回测 bar 撮合 / 限价+涨跌停检查
- **结算服务** (`src/server/services/settlementService.js`) — 买入/卖出结算，事件发射
- **回测时间语义** — t 时刻只能看到 t 及之前的数据

#### Phase 5 — P4 UI/交互/可视化
- **Header 余额** — 显示 可用/冻结/总资金
- **持仓卡片** — 显示 总/可卖/冻结数量
- **下单面板** — 实时显示预估手续费 + 预冻结金额，买入查可用资金，卖出查可卖数量
- **Agent 方案卡** — 显示风控结果（level/reasons/machineCode）+ 执行结果

测试覆盖：
- Phase 1: 10 项测试（Decimal/状态机/冻结/结算/超卖/迁移/部分成交）
- Phase 2: 8 项测试（schema 解析/降级/代码块/混合文本）
- Phase 3: 7 项测试（FIFO/超卖/最大回撤/硬风控）
- Phase 4: 7 项测试（事件流/撮合/结算/未来数据防护）
- Phase 5: 4 项测试（结构适配/兼容/预估/风控显示）

### v1.7.0 — 2026-04-23

**🤖 Agent 自动交易系统 Level 1-3 全量上线**

核心新增：

- **熔断器** (`lib/agent/circuitBreaker.js`) — 三态状态机 (CLOSED → OPEN → HALF_OPEN)，自动降级 L3→L2→L1，事件通知机制
- **风控引擎** (`lib/agent/riskManager.js`) — 仓位限制（单笔20%/总仓70%）、日亏损5%上限、交易时段检查、自动生成止损3%/止盈8%条件单
- **策略模板** (`lib/agent/promptTemplates.js`) — 5个预设策略（保守/均衡/激进/动量/事件驱动）+ 自定义 Prompt 支持
- **信号引擎** (`lib/agent/signalEngine.js`) — 信息采集 → LLM 分析 → 信号生成 → 交易方案 → 执行完整链路

模块升级：

- **调度器 v2** (`lib/scheduler.js`) — 三级调度（条件单30s + 信号扫描5min + 熔断监控60s）+ Agent 配置管理
- **路由 v2** (`analysisRoutes.js`) — 新增 16 个 Agent API 端点（配置/策略/信号/方案/熔断/风控/日报）
- **前端** — Agent 控制台视图（配置面板 + 信号流 + 方案卡 + 操作日志 + 安全控制），侧栏🤖入口

三级安全模式：

| Level | 行为 | 风控等级 |
|-------|------|----------|
| L1 监控者 | 只推送信号，不执行 | 无 |
| L2 顾问者 | 生成方案，人工确认执行 | 基础检查 |
| L3 代理者 | 自动执行（置信度≥70%、风险≠高） | 严格风控+自动止损止盈+熔断保护 |

环境变量：

- `LLM_PROVIDER` — 默认 deepseek，可选 qwen/openai/local
- `LLM_API_KEY` — LLM API 密钥（**必须**）
- `LLM_MODEL` — 覆盖默认模型（如 deepseek-v4-flash）
- `SEARCH_API_URL` — 搜索引擎 API（可选，tavily 或 URL）
- `SEARCH_API_KEY` — 搜索引擎密钥（可选）
- `TLS_REJECT_UNAUTHORIZED` — TLS 证书校验（默认 true，设 false 仅用于开发）

### v1.6.1 — 2026-04-23

**交易核心修补 + 数据一致性收口**

- 修复条件单创建接口字段语义错误，严格区分 `type=buy|sell` 与 `triggerType=gte|lte`
- 条件单服务增加输入校验，拒绝无效订单类型、触发条件、价格和数量
- 条件单执行兼容 `.SS/.HK/.US` 后缀 symbol 匹配，避免运行中订单因代码格式不同而永远不触发
- 账户查询统一过滤 archived 账户，避免"已删除账户"继续参与切换和日常读取
- 账户写操作改为串行 state transaction，降低 JSON 持久化并发覆盖风险
- `todayRealizedPnL` 改为复用成交盈亏明细计算，不再错误读取当前剩余持仓均价
- server 启动日志改为读取 `package.json` 版本，消除运行版本和 README/package 不一致
- 移除行情请求中的 `rejectUnauthorized: false`，恢复默认 TLS 校验

### v1.6.0 — 2026-04-22

**架构重构 + Dashboard + 订单管理页**

- 后端分层：server.js 重构为轻路由层，trading.js 拆分为 accountService/tradingService/orderService/watchlistService/summaryService，stateRepository 统一持久化层
- 前端模块化：main.js 统一入口，features/ 接管所有业务逻辑，app.js 退化为 15 行兼容壳
- index.html 去除所有内联 onclick/oninput，改为 JS 事件委托绑定
- 新增 Dashboard 总览首页（KPI + 市场动态 + 关注标的 + 最近成交）
- 新增独立订单管理页（条件单统计 + 生命周期管理 + 取消功能）
- Sidebar 重整：总览 > 市场 > 交易 > 资产 > 订单 > 复盘
- 修复条件单 API 参数名（triggerType/triggerPrice → 兼容 type/price）
- 修复 getStockQuote symbol 归一化（.SS/.HK/.US 后缀匹配）
- 切换账户后 Dashboard/Orders 同步刷新

### v1.5.0 — 2026-04-22

**👤 多账户平台化升级**

- 底层存储从单账户 state 重构为 accounts 容器模型：`{ currentAccountId, accounts: { id: {...} } }`
- 旧版单账户 state.json 自动迁移为"默认账户"，零人工干预
- 新增账户管理 API：GET/POST/PATCH/DELETE /api/accounts，POST /accounts/:id/switch
- 所有业务函数（buy/sell/createOrder/getWatchlist 等）改为基于 currentAccountId 操作
- 条件单检查改为遍历所有账户独立触发，执行结果落回对应账户
- 重置账户只影响当前账户，不再全局重置
- 前端新增账户切换下拉（Header 右侧）：切换/新建/删除/颜色标签
- 新增账户创建弹窗（名称+初始资金+主题色选择）
- 新增账户删除确认弹窗，至少保留1个账户
- 切换账户后全站数据同步刷新（资金/持仓/自选/条件单/复盘）
- createAccount 支持 color 参数传递
- 修复 server.js POST /api/accounts 参数解构错误

### v1.4.0 — 2026-04-22

**⭐ 自选系统 + 行情状态 + 交易规则 + 汇率感知**

- 自选系统：watchlist CRUD + 热门/自选切换 + 当前标的加自选 + 空状态
- 汇率层：lib/fx.js + toCNY + /api/fx + /api/account/summary 折算口径
- 多市场交易规则：getCategoryRules() 按品类步进/单位
- 行情状态可视化：市场检测 + 休市冻结提示
- 建立统一设计 token 体系（tokens.css）
- 建立基础组件样式库（components.css）
- 前端模块化拆分：core/(api+events+store+constants) + utils/(format+guard+dom+date) + adapters/(market+portfolio+order) + presenters/(account+analytics)
- 新增 `GET /api/account/summary`
- 修复持仓口径不一致
- Agent 友好：data-testid/data-role/data-symbol 全覆盖

### v1.2.0 — 2026-04-21

**🧠 交易分析 + Agent 决策层**

- 新增 `src/analytics/` 分析层（position.js / metrics.js / tradeEngine.js）
- FIFO 成本持仓计算 + 已实现盈亏明细
- 交易指标：胜率、盈亏比、最大回撤、平均盈亏、按策略统计
- Agent 决策：结构化提示词 + 决策输入生成 + 统一 JSON 输出格式
- 新增 API：`GET /api/analysis`、`GET /api/agent/prompt`、`POST /api/agent/decision-input`
- 前端新增「分析」页面

### v1.1.0 — 2026-04-21

**📈 K线交互 + 条件单 + 全市场搜索**

- K线图 Canvas 绘制，鼠标悬停十字线 + 数据浮框
- 条件单功能：价格触发自动买卖（≥/≤）
- 全市场搜索（东方财富 API）
- 市场状态自动检测

### v1.0.0 — 2026-04-21

**🦁 初始版本**

- 全市场行情 + 模拟交易 + 持仓管理 + K线图
- Node.js + Express 后端，纯原生前端
- 新浪财经 + 东方财富免费 API
- CLI 命令行工具 + JSON 文件持久化

## License

MIT
