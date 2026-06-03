# Leo Desk

**个人模拟仓 · 分析师工作台** — 实时行情、模拟成交、中文情报解读与信号生成，本地一体化运行。

> 仅用于策略研究与模拟交易练习，不构成投资建议，不接实盘。

## 定位

| 角色 | 能力 |
| --- | --- |
| **模拟仓** | 多账户、买卖、持仓、条件单、风控闸门、审计回放 |
| **分析师** | 实时情报检索、规则/LLM 解读、策略信号 |
| **行情** | 权益（公开源）+ 数字资产（Binance 现货/合约，约 300+ 交易对） |

界面与文案为 **中文**（`zh-ui.js`），不出现交易所品牌；底层通过公开 API 拉取 **权益** 与 **数字资产** 数据。

## 快速启动

```bash
npm install
cp .env.example .env   # 按需填写 LLM / 检索密钥
npm start
# http://localhost:3210
```

浏览器建议 **硬刷新**（`Cmd+Shift+R`）以加载最新静态资源。

## 验证

```bash
npm run check              # 语法 + 单元测试 + 密钥扫描
npm run test:integration   # 离线路报源测试
npm run verify             # 端到端 API 冒烟（需先 npm start）
```

## 环境变量

见 `.env.example`。核心项：

| 变量 | 说明 |
| --- | --- |
| `LLM_API_KEY` | 分析师深度解读、英文情报标题批量翻译、Agent 信号（可选） |
| `SEARCH_API_KEY` / `SEARCH_API_URL` | 扩展网页检索（可选） |
| `LEOMONEY_PAPER_EXECUTION_ENABLED` | `true` 时允许模拟写入 |
| `PORT` | 默认 `3210` |

未配置 `LLM_API_KEY` 时：情报仍可用 **规则词表** 将常见英文标题转为中文；配置后英文标题会经 LLM 批量翻译，质量更好。

## 主要界面

- **总览** — 资产、K 线、快捷下单；顶栏可选 **计价单位**（CNY / USD / USDT / HKD）
- **行情** — 权益 / 数字资产 / 宏观
- **模拟交易** — 人工或自动化闸门
- **分析师** — 策略与 Agent 配置
- **分析师情报**（顶栏）— 实时头条、中文摘要、解读、信号

## 分析师情报

- **数据源**：Google News（中/英）、东方财富搜索、可选 Search API
- **中文化**：`lib/intelTranslate.js` — 词表 + 可选 LLM 批量翻译；保留 `titleEn` 原文对照
- **API**：`POST /api/intel/scan`、`POST /api/intel/analyze`、`GET /api/intel/feed`

## 项目结构（节选）

```
lib/
  intel.js, intelSources.js, intelTranslate.js   # 情报管线
  quotes.js, binance.js, yahooUs.js              # 行情
public/
  css/leo-tokens.css, leo-app.css                  # 设计令牌与界面
  js/zh-ui.js, intel-hub.js                        # 中文 UI + 情报面板
src/server/routes/                               # REST API
```

## 版本

**v3.3.0 — Leo Desk**

- 品牌与文案中文化，统一排版令牌（`leo-tokens` / `leo-app`）
- 情报面板可读性修复 + **英文头条自动中文化**
- 全量 Binance 可交易对行情、计价单位切换
- `npm run verify` 覆盖静态资源与情报 API

## License

Private / personal use — see repository owner.