# LeoMoney 升级说明

## v3.1.0 Commercial Beta 升级目标

将 LeoMoney 从 `v3.0.0-vnext` 准上线指挥舱升级为可供 Beta 用户试运行的 AI 模拟交易/研究平台。升级重点不是 README 包装，而是运行边界、安全默认值、自动化治理、审计、持久化状态、CI 和验证。

## v3.1.0 关键变更

- 版本统一升级到 `3.1.0`：`package.json`、`package-lock.json`、前端状态文案、README 和变更记录同步。
- 新增 `.env.example`，集中声明 `LEOMONEY_DATA_DIR`、`LEOMONEY_ALLOWED_ORIGINS`、`LEOMONEY_PAPER_EXECUTION_ENABLED`、`LEOMONEY_AGENT_PAPER_EXECUTION_ENABLED`、订单上限和 LLM timeout/retry。
- 新增安全中间件：请求 ID、安全响应头、CORS 白名单、JSON body 限制、关闭 Express 指纹。
- 新增 `/api/readiness` 与 `/api/version`，扩展 `/api/health`，将数据目录、备份、审计、Agent、LLM、风控和安全状态暴露给部署探针。
- 交易、条件单、自动化、Agent 配置和行情查询增加边界校验；服务层增加名义金额上限和自动化执行策略检查。
- 旧 Agent proposal 执行路径改为进入自动化执行闸门，默认 dry-run，不再直连 `buy/sell` 绕过 ExecutionGate。
- 交易和条件单生命周期写入 `data/audit/*.jsonl`。
- 账户摘要增加 NAV、仓位暴露、现金比例、集中度、总浮盈浮亏比例和日内摘要。
- 新增密钥扫描、GitHub Actions CI 和商业化边界测试。

## 升级/部署检查

```bash
npm ci
cp .env.example .env
npm run check
npm run security:secrets
PORT=3210 npm start
curl http://localhost:3210/api/readiness
curl http://localhost:3210/api/health
```

公网部署时必须设置：

```bash
LEOMONEY_ALLOWED_ORIGINS=https://your-domain.example
LEOMONEY_DATA_DIR=/var/lib/leomoney
LEOMONEY_AGENT_PAPER_EXECUTION_ENABLED=false
```

## v1.3.0 升级目标

将 Leomoney 从"能运行的工具"升级为"人+Agent 双模式可操作的产品级系统"，全程兼容、可回退。

## 分阶段执行记录

### 第一阶段：审计与标记
- 完成项目全量审计，标记 15 个 API 端点
- 标记前后端口径不一致问题（持仓市值计算）
- 标记关键 UI 区域缺失 data-* 标识的位置

### 第二阶段：token 与基础 UI 层
- 新增 `public/css/tokens.css` — 统一色彩/间距/字号/圆角/阴影/动效变量
- 新增 `public/css/components.css` — 面板/指标卡/按钮/标签/状态徽标/表单/四态/列表项/系统消息容器
- 改造 `public/css/app.css` — 全部硬编码值替换为 token 变量，保留旧变量名映射兼容

### 第三阶段：工具层与 adapter 层
- 新增 `public/js/utils/format.js` — 货币/百分比/涨跌/方向/时间格式化
- 新增 `public/js/utils/guard.js` — toNumber/safeArray/safeObject/clamp
- 新增 `public/js/utils/dom.js` — 渲染空状态/错误状态/加载状态
- 新增 `public/js/utils/date.js` — 日期工具
- 新增 `public/js/core/api.js` — 统一请求封装（请求GET/请求POST/请求DELETE）
- 新增 `public/js/core/events.js` — 事件总线
- 新增 `public/js/core/store.js` — 全局状态仓库
- 新增 `public/js/core/constants.js` — 常量定义
- 新增 `public/js/adapters/marketAdapter.js` — 行情归一化
- 新增 `public/js/adapters/portfolioAdapter.js` — 持仓计算统一
- 新增 `public/js/adapters/orderAdapter.js` — 订单预览与校验
- 新增 `public/js/presenters/accountPresenter.js` — 账户摘要渲染
- 新增 `public/js/presenters/analyticsPresenter.js` — 复盘解释层

### 第四阶段：账户与持仓统一口径
- 后端新增 `GET /api/account/summary` — 用现价算真实市值
- 修复旧 `GET /api/account` 的 totalAssets 注释说明
- 前端 renderPortfolioView 改用 summary API，兜底旧逻辑

### 第五+六+七阶段：前端改造
- 导航产品化：行情→市场、持仓→资产、记录→成交、分析→复盘
- 当前标的强化区：名称/代码/价格/涨跌/方向文字/持仓浮盈
- 交易面板升级：按钮文案明确（"买入下单"/"卖出下单"）、可买/可卖数量提示、校验提示区、失败保留输入
- 系统消息容器：`#system-feedback` + `aria-live="polite"`
- 成交筛选：全部/买入/卖出
- 复盘解释层：中文洞察文案
- data-testid/data-role/data-symbol/data-side/data-status 覆盖所有关键区域
- aria-label 覆盖所有关键按钮

## 兼容策略

- 旧 API 全部保留，不删不改
- 旧 CSS 变量名映射到新 token，不破坏现有样式
- 新增文件全部独立，不影响旧代码
- 前端新逻辑有兜底：summary API 不可用时回退旧计算

## 风险点

- 新 HTML 结构对依赖 DOM 结构的测试脚本可能影响
- tokens.css 引入顺序必须在 app.css 之前
