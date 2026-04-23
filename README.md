# 🦁 Leomoney

AI-Driven Simulated Trading Platform | AI 驱动模拟交易平台

![Leomoney Screenshot](screenshot.png)

## Features

- 👤 **多账户平台** — 创建/切换/删除账户，资金/持仓/自选/条件单/复盘完全隔离
- 🏠 **Dashboard 总览** — 总资产/资金/持仓/KPI + 市场动态 + 关注标的 + 最近成交
- 📋 **条件单管理** — 独立订单页，统计待触发/已执行/失败，完整生命周期管理
- 📊 **全市场行情** — A股/港股/美股/贵金属/加密货币实时数据（新浪财经 API）
- 🔍 **全市场搜索** — 东方财富搜索 API，支持股票/基金/ETF 全品种检索
- 📈 **K线图** — Canvas 绘制，鼠标悬停十字线+数据浮框交互
- 💰 **模拟交易** — 买入/卖出，100 万虚拟资金起步
- 🕐 **市场状态** — 自动检测 A股/港股/美股/加密交易时段，休市行情冻结
- 🧠 **交易分析** — 胜率/盈亏比/最大回撤/策略统计（按账户隔离）
- 🤖 **Agent 决策** — 结构化决策输入/输出，LLM 可直接对接
- 🏷️ **策略标签** — 交易记录支持 strategy 字段，按策略统计表现

## Tech Stack

- **Backend**: Node.js + Express（路由层 / services 层 / repositories 层 / domain 层四层分离）
- **Frontend**: 纯原生 HTML/CSS/JS，模块化架构（main.js 统一入口 + features/ 功能域模块）
- **Data**: 新浪财经 + 东方财富 API（免费，无需 API Key）
- **持久化**: JSON 文件（`data/state.json`，多账户容器格式，旧版自动迁移）

## Quick Start

```bash
npm install
npm start
```

打开 http://localhost:3210

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

### Agent 决策 API

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/analysis` | GET | 交易分析（当前账户，持仓/指标/盈亏明细/策略统计） |
| `/api/agent/prompt` | GET | 获取 Agent 决策提示词 |
| `/api/agent/decision-input` | POST | 生成 Agent 决策输入数据（当前账户） |

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
│   └── fx.js                 # 汇率层
├── src/
│   ├── server/
│   │   ├── routes/           # 路由层（market/account/trade/analysis）
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
│       └── features/          # 功能模块（market/trade/portfolio/dashboard/...）
├── data/                      # 运行时数据（gitignore）
└── package.json
```

## Changelog

### v1.6.1 — 2026-04-23

**交易核心修补 + 数据一致性收口**

- 修复条件单创建接口字段语义错误，严格区分 `type=buy|sell` 与 `triggerType=gte|lte`
- 条件单服务增加输入校验，拒绝无效订单类型、触发条件、价格和数量
- 条件单执行兼容 `.SS/.HK/.US` 后缀 symbol 匹配，避免运行中订单因代码格式不同而永远不触发
- 账户查询统一过滤 archived 账户，避免“已删除账户”继续参与切换和日常读取
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

- 建立统一设计 token 体系（tokens.css）：色彩/间距/字号/圆角/阴影/动效
- 建立基础组件样式库（components.css）：面板/指标卡/按钮/标签/状态徽标/表单/四态/列表项/系统消息容器
- 前端模块化拆分：core/(api+events+store+constants) + utils/(format+guard+dom+date) + adapters/(market+portfolio+order) + presenters/(account+analytics)
- 新增 `GET /api/account/summary`：统一账户汇总，用现价算真实市值
- 修复持仓口径不一致：前后端统一使用 summary API，兜底旧逻辑
- 当前标的强化区：名称/代码/价格/涨跌/方向文字/持仓浮盈，带 data-symbol
- 交易面板升级：按钮文案明确（买入下单/卖出下单）、可买/可卖数量提示、校验提示区、失败保留输入
- 成交筛选：全部/买入/卖出
- 复盘解释层：中文洞察文案（胜率/盈亏比/回撤分析）
- 导航产品化：行情→市场、持仓→资产、记录→成交、分析→复盘
- Agent 友好：data-testid/data-role/data-symbol/data-side/data-status 全覆盖，aria-label 全覆盖
- 系统消息容器：#system-feedback + aria-live="polite"
- 四份文档：UPGRADE_NOTES / COMPATIBILITY / UI_SYSTEM / AGENT_OPERATION_GUIDE

### v1.2.0 — 2026-04-21

**🧠 交易分析 + Agent 决策层**

- 新增 `src/analytics/` 分析层（position.js / metrics.js / tradeEngine.js）
- FIFO 成本持仓计算 + 已实现盈亏明细
- 交易指标：胜率、盈亏比、最大回撤、平均盈亏、按策略统计
- Agent 决策：结构化提示词 + 决策输入生成 + 统一 JSON 输出格式
- 新增 API：`GET /api/analysis`、`GET /api/agent/prompt`、`POST /api/agent/decision-input`
- 前端新增「分析」页面：指标卡片 + 权益曲线 + 盈亏分布 + 交易明细
- Dashboard 增加：今日盈亏、持仓数量、风险状态浮层
- 交易记录支持可选 `strategy` 字段，API 及 CLI 均可传入
- 项目结构文档更新，README 增加 OpenClaw 集成说明

### v1.1.0 — 2026-04-21

**📈 K线交互 + 条件单 + 全市场搜索**

- K线图 Canvas 绘制，鼠标悬停十字线 + 数据浮框
- 条件单功能：价格触发自动买卖（≥/≤）
- 全市场搜索（东方财富 API）
- 市场状态自动检测（A股/港股/美股/加密时段）
- 修复侧边栏菜单切换失效（CSS 特异性冲突）
- 修复 K线图鼠标悬停无限膨胀（Canvas 尺寸反馈环）
- CLI 新增 `order create/list/cancel`、`search`、`auto` 命令
- GitHub 公开仓库发布

### v1.0.0 — 2026-04-21

**🦁 初始版本**

- 全市场行情：A股/港股/美股/贵金属/加密货币
- 模拟交易：买入/卖出，100 万虚拟资金
- 持仓管理：实时盈亏计算
- K线图基础展示
- Node.js + Express 后端，纯原生前端
- 新浪财经 + 东方财富免费 API
- CLI 命令行工具
- JSON 文件持久化

## License

MIT
