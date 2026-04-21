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
```

## Project Structure

```
leomoney/
├── server.js          # Express 服务入口
├── cli.js             # 命令行工具
├── lib/
│   ├── quotes.js      # 行情数据（新浪+东方财富）
│   ├── trading.js     # 交易引擎
│   └── market.js      # 市场状态检测
├── public/
│   ├── index.html     # 主页面
│   ├── css/app.css    # 样式
│   └── js/app.js      # 前端逻辑
├── data/              # 运行时数据（gitignore）
└── package.json
```

## License

MIT
