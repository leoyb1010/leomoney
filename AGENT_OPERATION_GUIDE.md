# Leomoney Agent 操作指南

> 本文档面向 OpenClaw / skill cli 自动化操作场景

## 一、关键页面区域标识

| 区域 | 选择器 | 说明 |
|------|--------|------|
| 系统消息 | `#system-feedback` | aria-live="polite"，所有操作结果都会写到这里 |
| 当前标的 | `[data-testid="current-symbol-panel"]` | 包含标的名称/代码/价格/涨跌/持仓 |
| 交易面板 | `[data-testid="trade-panel"]` | 买入/卖出/条件单三个 Tab |
| 账户汇总 | `[data-testid="portfolio-summary"]` | 总资产/现金/市值/盈亏 |
| 持仓列表 | `[data-testid="portfolio-list"]` | 每项有 data-symbol |
| 成交列表 | `[data-testid="history-list"]` | 每项有 data-side 和 data-status |
| 分析指标 | `[data-testid="metric-cards"]` | 胜率/盈亏比/回撤等 |
| 复盘解释 | `[data-testid="insights-panel"]` | 中文洞察文案 |

## 二、关键按钮标识

| 按钮 | 选择器 | 说明 |
|------|--------|------|
| 买入下单 | `[data-testid="submit-buy-order"]` | data-side="buy" |
| 卖出下单 | `[data-testid="submit-sell-order"]` | data-side="sell" |
| 创建条件单 | `[data-testid="submit-order-create"]` | — |
| 取消条件单 | `[data-testid="cancel-order"]` | 每个条件单项内 |
| 重置账户 | `[data-testid="reset-account"]` | Header 右侧 |
| 刷新分析 | `[data-testid="analysis-refresh"]` | 复盘页 |

## 三、关键状态文本

### 操作结果（在 #system-feedback 中读取）

| 结果 | 文本 |
|------|------|
| 买入成功 | "买入下单成功" |
| 卖出成功 | "卖出下单成功" |
| 买入失败 | "下单失败：可用资金不足" |
| 卖出失败 | "下单失败：持仓不足" |
| 条件单创建 | "条件单创建成功" |
| 条件单取消 | "条件单取消成功" |
| 条件单失败 | "条件单创建失败" |

### 涨跌状态（在持仓项和当前标的区）

| 状态 | 文本 |
|------|------|
| 上涨 | "上涨" |
| 下跌 | "下跌" |
| 无变化 | "无变化" |

⚠️ **不要依赖颜色判断涨跌**。涨跌状态同时有颜色和文字。

## 四、典型操作流程

### 流程一：买入股票

1. 选择标的：`[data-testid="current-symbol-panel"]` 确认当前标的
2. 切换买入 Tab：`[data-testid="trade-tab-buy"]`
3. 填写价格：`[data-testid="trade-price"]`
4. 填写数量：`[data-testid="trade-qty"]`
5. 确认预估金额：`[data-testid="trade-total"]`
6. 确认校验提示：`[data-testid="trade-validation"]`（无 error 类名则通过）
7. 点击买入：`[data-testid="submit-buy-order"]`
8. 验证结果：读取 `#system-feedback` 文本

### 流程二：创建条件单

1. 确认当前标的：`[data-testid="current-symbol-panel"]`
2. 切换条件单 Tab：`[data-testid="trade-tab-order"]`
3. 填写触发价格：`[data-testid="order-trigger-price"]`
4. 选择方向：`[data-testid="order-direction"]`
5. 填写数量：`[data-testid="order-qty"]`
6. 点击创建：`[data-testid="submit-order-create"]`
7. 验证：`#system-feedback` 显示 "条件单创建成功"

### 流程三：查看持仓

1. 切换到资产页：`[data-view="portfolio"]`
2. 读取汇总：`[data-testid="portfolio-summary"]`
3. 读取持仓项：`[data-testid="holding-item"]`（每项有 data-symbol）
4. 每项浮盈亏有文字 "上涨" 或 "下跌"

## 五、成功/失败判断方式

- **成功**：`#system-feedback` 包含 "成功" 文本，className 包含 `success`
- **失败**：`#system-feedback` 包含 "失败" 或 "不足" 文本，className 包含 `error`
- **信息**：`#system-feedback` className 包含 `info`

## 六、推荐等待与轮询策略

1. 点击按钮后等待 500ms-1s，再检查 `#system-feedback`
2. 行情数据每 5 秒自动刷新，无需手动刷新
3. 持仓/成交数据在操作后自动刷新
4. 不要依赖 setTimeout 硬等待，优先用 `aria-live` 区域变化检测

## 七、不要依赖的脆弱 UI 特征

- ❌ 不要靠颜色判断涨跌（颜色可能随主题变化）
- ❌ 不要靠 DOM 顺序定位元素（列表顺序可能变）
- ❌ 不要靠 emoji 图标定位（可能替换）
- ❌ 不要靠 hover 状态获取信息（hover 信息可能隐藏）
- ✅ 用 `data-testid` 定位
- ✅ 用 `data-symbol` 识别标的
- ✅ 用 `data-side` 识别方向
- ✅ 用文本内容判断状态
