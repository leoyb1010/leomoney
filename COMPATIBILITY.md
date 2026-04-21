# Leomoney 兼容说明

## API 兼容策略

### 保留不动的 API（15个）

| 路径 | 方法 | 说明 |
|------|------|------|
| `/api/market` | GET | 市场状态 |
| `/api/quotes` | GET | 全部行情 |
| `/api/quotes/:symbol` | GET | 单只行情 |
| `/api/search?q=` | GET | 搜索 |
| `/api/account` | GET | 账户信息（旧口径，totalAssets 用 avgCost） |
| `/api/trade/buy` | POST | 买入 |
| `/api/trade/sell` | POST | 卖出 |
| `/api/orders` | POST | 创建条件单 |
| `/api/orders` | GET | 条件单列表 |
| `/api/orders/:id` | DELETE | 取消条件单 |
| `/api/orders/check` | POST | 检查触发 |
| `/api/account/reset` | POST | 重置 |
| `/api/analysis` | GET | 分析数据 |
| `/api/agent/prompt` | GET | Agent提示词 |
| `/api/agent/decision-input` | POST | Agent决策输入 |

### 新增 API（1个）

| 路径 | 方法 | 说明 |
|------|------|------|
| `/api/account/summary` | GET | 统一账户汇总（用现价算市值） |

## 数据兼容策略

- `data/state.json` 结构不变
- `holdings` 字段不变，新增字段均为可选
- `history` 记录的 `strategy` 字段可选，不影响旧数据
- `pendingOrders` 的 `status` 字段扩展：`pending|executed|cancelled|expired`

## 旧字段保留

所有旧字段名称和位置不变。新增字段均为可选：
- `holdings[symbol].category` — 可选
- `history[].strategy` — 可选
- `history[].unit` — 可选

## 回退方式

1. **CSS 回退**：删除 `tokens.css` 和 `components.css` 引用，`app.css` 中旧变量映射仍生效
2. **前端回退**：新模块文件（core/utils/adapters/presenters）为纯新增，删除不影响
3. **API 回退**：`/api/account/summary` 为新增端点，删除路由不影响旧端点
4. **HTML 回退**：新增 `data-*` 属性不影响功能，`currentSymbolPanel` 有 `style="display:none"` 兜底

## OpenClaw / skill cli 应依赖的稳定选择器

### 区域标识
- `#system-feedback` — 系统消息容器（aria-live）
- `[data-testid="current-symbol-panel"]` — 当前标的
- `[data-testid="trade-panel"]` — 交易面板
- `[data-testid="portfolio-summary"]` — 账户汇总
- `[data-testid="portfolio-list"]` — 持仓列表
- `[data-testid="history-list"]` — 成交列表
- `[data-testid="metric-cards"]` — 分析指标
- `[data-testid="insights-panel"]` — 复盘解释

### 按钮标识
- `[data-testid="submit-buy-order"]` — 买入下单
- `[data-testid="submit-sell-order"]` — 卖出下单
- `[data-testid="submit-order-create"]` — 创建条件单
- `[data-testid="cancel-order"]` — 取消条件单

### 状态文本
- 消息区文本："买入下单成功"、"卖出下单成功"、"条件单创建成功"、"条件单取消成功"
- 涨跌文字："上涨"、"下跌"、"无变化"（在持仓项和当前标的区）
