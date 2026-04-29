# LeoMoney

LeoMoney 是一套面向个人投资者和量化研究者的 AI-Native 模拟交易系统。当前版本已经升级为中文交易指挥舱：覆盖实时行情、K 线、模拟交易、多账户、Agent 风控、自动化执行闸门、审计日志和决策回放。

> 重要提示：本项目用于模拟交易、策略研究和自动化实验，不构成投资建议，也不应直接替代真实交易风控。

![LeoMoney Screenshot](screenshot.png)

## 当前版本

- 版本：`v3.0.0`
- 默认端口：`3210`
- 主入口：`server.js`
- 前端入口：`public/index.html`
- 数据目录：`data/`，已加入 `.gitignore`
- 支持市场：A 股、港股、美股、贵金属、加密资产、主要指数

## 核心能力

- 中文交易终端：深色高信息密度界面，左侧专业导航，顶部账户与风控状态，主区行情/K 线/持仓/交易，右侧 Agent 与审计流。
- 实时行情：聚合新浪财经、东方财富等免费数据源，支持指数、A 股、港股、美股、贵金属和加密资产。
- 专业 K 线：新增 `/api/kline/:symbol` 接口，优先拉取新浪分钟线，失败时使用可审计的降级数据。
- 多账户系统：账户之间资金、持仓、订单、统计相互隔离，支持切换、创建、归档和重置。
- 模拟交易内核：买入、卖出、冻结资金、冻结持仓、部分成交、订单状态机、FIFO 成本、持仓盈亏。
- Agent 自动化总线：手动触发、条件触发、计划任务、Agent 信号、回测事件都进入统一自动化流水线。
- ExecutionGate 执行闸门：LLM 或规则不能直接下单，必须通过 Schema、规则、熔断器、风控、审计后才可执行。
- 审计与回放：每次自动化运行都会写入审计事件，可通过 runId 回放触发、上下文、决策、风控和执行结果。
- SSE 实时推送：行情、Agent、交易通知和系统状态可实时推送到前端。
- 安全降级：LLM 不可用、行情异常、风控拒绝、熔断开启时自动进入 HOLD 或 dry-run 状态。

## 快速启动

```bash
npm install
npm start
```

打开：

```text
http://localhost:3210
```

健康检查：

```bash
curl http://localhost:3210/api/health
```

行情检查：

```bash
curl http://localhost:3210/api/quotes
curl "http://localhost:3210/api/kline/sh000001?scale=5&limit=80"
```

## 常用脚本

```bash
npm start              # 启动 Web 服务
npm run dev            # 同 npm start
npm run check          # 语法检查 + 后端领域测试
npm run find:mojibake  # 扫描乱码文案
node cli.js --help     # 查看 CLI 能力
```

## Agent 配置

Agent 能力需要配置 LLM API Key。没有配置时，系统仍可运行交易终端、行情、模拟交易、审计和规则自动化；LLM 相关能力会显示为未就绪。

DeepSeek 示例：

```bash
set LLM_PROVIDER=deepseek
set LLM_API_KEY=your-api-key
set LLM_MODEL=deepseek-chat
npm start
```

OpenAI 示例：

```bash
set LLM_PROVIDER=openai
set LLM_API_KEY=sk-your-key
npm start
```

Linux/macOS 使用：

```bash
export LLM_PROVIDER=deepseek
export LLM_API_KEY=your-api-key
npm start
```

## 自动化执行链路

LeoMoney VNext 的自动化不允许绕过交易内核。所有自动决策都走同一条流水线：

```text
Trigger
  -> ContextBuilder
  -> RuleEngine / AgentDecision
  -> DecisionSchema
  -> ExecutionGate
  -> RiskManager
  -> CircuitBreaker
  -> TradingService
  -> AuditLog
  -> Replay
```

执行模式：

| 模式 | 说明 |
| --- | --- |
| `dry_run` | 只生成方案、风控和审计，不真实写入交易 |
| `paper_execution` | 通过风控后执行模拟交易 |

示例：

```bash
curl -X POST http://localhost:3210/api/automation/run \
  -H "Content-Type: application/json" \
  -d "{\"symbol\":\"600519\",\"mode\":\"dry_run\"}"
```

查看审计：

```bash
curl "http://localhost:3210/api/audit/events?limit=20"
curl "http://localhost:3210/api/replay/run_xxx"
```

## 主要 API

### 系统

| 接口 | 方法 | 说明 |
| --- | --- | --- |
| `/api/health` | GET | 系统健康、市场状态、Agent、风控、SSE、审计状态 |
| `/api/vnext/status` | GET | VNext 能力清单 |

### 行情

| 接口 | 方法 | 说明 |
| --- | --- | --- |
| `/api/quotes` | GET | 全市场行情 |
| `/api/quote/:symbol` | GET | 单资产行情 |
| `/api/search?q=茅台` | GET | 搜索资产 |
| `/api/kline/:symbol` | GET | K 线数据，支持 `scale` 和 `limit` |

### 账户与交易

| 接口 | 方法 | 说明 |
| --- | --- | --- |
| `/api/accounts` | GET/POST | 账户列表、创建账户 |
| `/api/accounts/:id/switch` | POST | 切换账户 |
| `/api/account` | GET | 当前账户资产、持仓、订单 |
| `/api/buy` | POST | 模拟买入 |
| `/api/sell` | POST | 模拟卖出 |
| `/api/orders` | GET | 订单列表 |

### Agent 与风控

| 接口 | 方法 | 说明 |
| --- | --- | --- |
| `/api/agent/status` | GET | Agent 运行状态 |
| `/api/agent/config` | GET/PATCH | Agent 配置 |
| `/api/agent/signal` | POST | 生成 Agent 信号 |
| `/api/agent/proposals` | GET | 交易方案 |
| `/api/agent/circuit-breaker` | GET | 熔断器状态 |
| `/api/agent/risk` | GET/PATCH | 风控参数 |

### 自动化与审计

| 接口 | 方法 | 说明 |
| --- | --- | --- |
| `/api/automation/run` | POST | 触发自动化流水线 |
| `/api/audit/events` | GET | 审计事件列表 |
| `/api/replay/:runId` | GET | 自动化运行回放 |

## 项目结构

```text
leomoney/
├─ server.js                         # Express 服务入口
├─ cli.js                            # 命令行工具
├─ lib/
│  ├─ quotes.js                      # 行情数据源
│  ├─ market.js                      # 市场状态
│  ├─ trading.js                     # 兼容交易入口
│  ├─ scheduler.js                   # 后台调度
│  └─ agent/                         # Agent、熔断器、风控、信号
├─ public/
│  └─ index.html                     # 中文交易指挥舱
├─ scripts/
│  └─ find-mojibake.js               # 乱码扫描
├─ src/
│  ├─ analytics/                     # 指标、持仓、交易分析
│  └─ server/
│     ├─ audit/                      # 审计日志与回放
│     ├─ automation/                 # 自动化总线与执行闸门
│     ├─ domain/                     # 金额、订单、事件、账户领域模型
│     ├─ repositories/               # JSON 原子持久化
│     ├─ routes/                     # API 路由
│     └─ services/                   # 账户、交易、订单、结算、风控服务
└─ data/                             # 运行时数据，不提交 Git
```

## 测试与验证

```bash
npm run check
```

当前远端 main 已验证：

- 依赖安装成功
- `npm audit` 0 个漏洞
- 语法检查通过
- 后端领域测试 48/48 通过
- `/api/health` 返回 200
- `/api/quotes` 返回 39 个资产
- `/api/kline/sh000001?scale=5&limit=80` 返回 240 个 K 线点

## 部署建议

本机测试：

```bash
npm install
npm start
```

服务器部署：

```bash
git clone https://github.com/leoyb1010/leomoney.git
cd leomoney
npm ci
PORT=3210 npm start
```

生产环境建议：

- 使用 PM2、systemd 或 Docker 守护进程运行。
- 将 `data/` 放到持久化磁盘。
- 配置反向代理，例如 Nginx/Caddy。
- 为公网启用 HTTPS。
- 为 Agent API Key 使用环境变量，不要写入仓库。

## 下一阶段路线

- SQLite WAL 数据层，替代 JSON 主存储。
- React/TypeScript 前端拆分，保留当前中文指挥舱体验。
- Agent DAG：Observe、Analyze、Critic、RiskOfficer、Proposal、ExecutionGate、MemoryWrite。
- 事件驱动回测：手续费、滑点、T+1、涨跌停、冻结资金、成交失败。
- 交易时光机：对任意 runId 回放完整市场上下文与 Agent 决策链。

## License

当前仓库未声明开源许可证。对外开源或商业化前建议补充明确 License。
