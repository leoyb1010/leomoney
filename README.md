# LeoMoney V4

**美股 · 加密 · 个人模拟交易工作台**。面向个人投资研究，覆盖实时行情、模拟交易、持仓录入、条件单、情报中心、策略 Agent、回测、资产分析和移动端工作流。

> 仅用于策略研究与模拟交易练习，不构成投资建议，不接实盘。

## V4 能力

| 模块 | 内容 |
| --- | --- |
| 总览 | 美股大盘条、BTC/ETH、账户资产、持仓概览、情报摘要、系统健康 |
| 行情 | 默认美股，兼顾加密、大盘指数、A股、港股、大宗商品；搜索、自选、来源和新鲜度 |
| 标的详情 | K 线、多周期、相关情报、快捷交易 |
| 模拟交易 | 市价/限价买卖、仓位比例、预计成交额、止盈止损条件单 |
| 持仓 | 浮动盈亏、一键平仓、CSV/文本导入已有持仓 |
| 订单 | 条件单、撤单、最近成交 |
| 资产 | 多账户、初始资金、现金/持仓占比、集中度分析 |
| 情报 | 中英文情报、标题+摘要中文化、来源透明、标的映射、订阅、深度解读 |
| 策略 | 策略库、运行配置、信号流、方案审批、回测、自动化闸门演练 |
| 设置 | 暗/亮主题、USD/CNY/USDT/HKD、红涨绿跌/绿涨红跌、源健康 |

金融产品、股票、ETF、指数、币种、交易对和公司名称不强制翻译；例如 Apple、NVIDIA、BTC、ETH、SPY、QQQ、S&P 500 可以自然保留英文。

## 快速启动

```bash
npm install
cp .env.example .env
npm start
# http://localhost:3210
```

前端源码在 `web/`，构建产物输出到 `public/`，Express 同源托管。

```bash
npm run web:dev     # Vite 开发模式，代理 /api 到 3210
npm run build       # 构建 React 前端到 public/
npm run check       # typecheck + build + tests + secret scan
npm run verify      # API/静态资源冒烟，需先 npm start
```

## 关键 API

| API | 用途 |
| --- | --- |
| `GET /api/market/overview` | 标普、纳指、道指、VIX、BTC、ETH 概览 |
| `GET /api/quotes` / `GET /api/quotes/:symbol` | 全市场和单标的行情 |
| `GET /api/kline/:symbol` | K 线，美股走 Yahoo Chart，加密走 Binance |
| `POST /api/trade/buy` / `POST /api/trade/sell` | 模拟盘买卖 |
| `POST /api/orders` | 止盈止损/条件单 |
| `POST /api/account/positions/import` | 批量录入已有持仓 |
| `POST /api/intel/scan` / `POST /api/intel/analyze` | 情报扫描和深度解读 |
| `GET /api/agent/*` | 策略、信号、方案、风控、回测 |
| `GET /api/sse?channels=quotes,intel,agent,trade,system` | 实时推送 |

## 环境变量

见 `.env.example`。核心项：

| 变量 | 说明 |
| --- | --- |
| `LLM_API_KEY` | DeepSeek/LLM 密钥；启用情报中文化、摘要、标的映射和 Agent 解读 |
| `LLM_PROVIDER` / `LLM_MODEL` | 默认 `deepseek` / `deepseek-chat` |
| `SEARCH_API_KEY` / `SEARCH_API_URL` | 可选扩展检索 |
| `LEOMONEY_PAPER_EXECUTION_ENABLED` | 是否允许模拟盘写入 |
| `LEOMONEY_AGENT_PAPER_EXECUTION_ENABLED` | Agent 直连写入默认关闭，建议走闸门 |
| `LEOMONEY_ALLOWED_ORIGINS` | 本地含 `3210` 和 Vite `5174` |

未配置 `LLM_API_KEY` 时，情报仍可显示和规则摘要，但深度解读和高质量翻译会降级，界面会明确提示。

## 项目结构

```text
web/                         React + Vite + TypeScript 前端
public/                      构建后的静态资源
lib/quotes.js                多市场行情
lib/intel.js                 情报扫描、订阅、标的映射
lib/agent/                   策略、信号、风控、回测
src/server/domain/           Decimal 账本、冻结、结算、状态机
src/server/routes/           REST API
src/server/services/         账户、交易、订单、汇总服务
```

## 版本

**v4.0.0**

- React/Vite/TypeScript 重构，旧单文件前端退场
- 默认美股 + USD，恢复大盘条，纠正“权益”为“美股”
- 新增完整交易、持仓、订单、资产、自选、情报、策略、提醒、设置页面
- 新增持仓导入 API 和界面
- 情报标题+摘要中文化，保留金融产品名英文，结构化关联标的
- 美股 K 线接入 Yahoo Chart，加密 K 线接入 Binance
- 移动端底部导航、暗/亮主题、涨跌配色可配置

## License

Private / personal use — see repository owner.
