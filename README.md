# 🦁 Leomoney

AI-Driven Simulated Trading Platform | AI 驱动模拟交易平台

## Features

- 📊 **全市场行情** — A股/港股/美股/贵金属/加密货币实时数据（新浪财经 API）
- 🔍 **全市场搜索** — 东方财富搜索 API，支持股票/基金/ETF 全品种检索
- 📈 **K线图** — Canvas 绘制，鼠标悬停十字线+数据浮框交互
- 💰 **模拟交易** — 买入/卖出，100 万虚拟资金起步
- 📋 **条件单** — 价格触发自动执行（≥/≤）
- 📁 **持仓管理** — 实时盈亏计算/资产总览
- 🕐 **市场状态** — 自动检测 A股/港股/美股/加密交易时段，休市行情冻结
- 🧠 **交易分析** — 胜率/盈亏比/最大回撤/策略统计
- 🤖 **Agent 决策** — 结构化决策输入/输出，LLM 可直接对接
- 🏷️ **策略标签** — 交易记录支持 strategy 字段，按策略统计表现

## Tech Stack

- **Backend**: Node.js + Express
- **Frontend**: 纯原生 HTML/CSS/JS（无框架依赖）
- **Data**: 新浪财经 + 东方财富 API（免费，无需 API Key）
- **持久化**: JSON 文件（`data/state.json`）

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
| `/api/analysis` | GET | 交易分析（持仓/指标/盈亏明细/策略统计） |
| `/api/agent/prompt` | GET | 获取 Agent 决策提示词 |
| `/api/agent/decision-input` | POST | 生成 Agent 决策输入数据 |

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
├── server.js              # Express 服务入口
├── cli.js                 # 命令行工具（OpenClaw 可直接调用）
├── lib/
│   ├── quotes.js          # 行情数据（新浪+东方财富）
│   ├── trading.js         # 交易引擎
│   └── market.js          # 市场状态检测
├── src/
│   └── analytics/
│       ├── tradeEngine.js  # 分析总入口 + Agent 决策
│       ├── position.js     # 持仓计算（FIFO 成本）
│       └── metrics.js      # 指标计算（胜率/回撤/策略统计）
├── public/
│   ├── index.html          # 主页面
│   ├── css/app.css         # 样式
│   └── js/app.js           # 前端逻辑
├── data/                   # 运行时数据（gitignore）
└── package.json
```

## Changelog

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
