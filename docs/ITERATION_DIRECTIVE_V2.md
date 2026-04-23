# Leomoney V2 优化迭代指令

> 目标：在保持当前系统安全、逻辑正确、可审计的前提下，引入 **LLM + 搜索引擎 + 自定义条件入口 + 自动化模拟/验证**，把 Leomoney 从“可手动操作的模拟交易平台”升级为“可回测、可仿真、可审计、可限权执行的自动化策略实验平台”。

---

## 一、先立规矩：V2 只允许 1 条交易真相链路

### 强制原则

1. **交易核心唯一化**
   - `src/server/services/*` 作为唯一交易核心。
   - `lib/trading.js` 只能保留兼容 facade，不允许再维护独立交易状态逻辑。
   - CLI、HTTP、自动化任务、未来 Agent 执行器，全部必须走统一 Application Service。

2. **决策与执行解耦**
   - LLM 不直接下单。
   - 搜索结果不直接触发交易。
   - 所有自动化动作必须经过：
     - 条件引擎（是否满足）
     - 风控引擎（是否允许）
     - 执行闸门（是否可执行）
     - 审计记录（为什么执行）

3. **默认安全模式**
   - 新增自动化功能时，默认 `simulation_only = true`。
   - 只有明确切换到 `paper_execution = true` 时才允许写入模拟持仓。
   - 任何“真实券商下单”能力默认永久禁用，不在 V2 范围内。

4. **所有自动化都必须可回放**
   - 任意一次自动决策都必须能回溯：
     - 当时行情
     - 当时搜索结果
     - 当时 LLM 输入
     - 当时规则命中情况
     - 风控结论
     - 最终动作

---

## 二、当前仓库的核心问题

### P0 - 架构层硬伤

#### 1. 双交易核心并存
- `src/server/services/tradingService.js`
- `src/server/services/orderService.js`
- `src/server/repositories/stateRepository.js`
- `lib/trading.js`

问题：
- 你现在维护了两套状态加载/保存/账户/订单逻辑。
- 新路由层在走 services，新 CLI 仍大量走 `lib/trading.js`。
- 未来一旦自动化任务、LLM 决策、批量仿真混入，两套逻辑会导致：
  - 数据口径不一致
  - 并发覆盖
  - 行为不一致
  - bug 修一边漏一边

**V2 铁律：先收口，再扩展。**

#### 2. 交易写入缺少统一事务边界
- 虽然 `stateRepository.js` 有 `withStateTransaction()`，但 `tradingService.js` 里的 `buy/sell` 仍直接 `loadState()` + `saveState()`。
- 这意味着自动化扫描、API 调用、CLI 调用同时发生时，仍有写覆盖风险。

#### 3. LLM 接口还停留在“提示词输出层”
- 当前 `/api/agent/prompt` 与 `/api/agent/decision-input` 只是把分析结果拼装出来。
- 还没有：
  - 决策 schema 校验
  - 工具调用协议
  - 风险约束协议
  - 上下文注入协议
  - 搜索证据协议

#### 4. 行情/搜索层缺少可信度与降级标记
- `lib/quotes.js` 中贵金属/加密存在降级模拟逻辑。
- 当前结果没有统一 `dataQuality` / `source` / `isSynthetic` 标记。
- 这会让自动化引擎把“模拟价格”误认为“真实市场输入”。

---

## 三、V2 目标架构

```text
Trigger Sources
├── Manual Trigger（手动按钮 / CLI / API）
├── Scheduled Trigger（定时任务）
├── Condition Trigger（价格 / 指标 / 仓位 / 风险）
├── Search Trigger（新闻 / 舆情 / 公告 / 自定义搜索）
└── LLM Trigger（基于分析与上下文的建议）

Decision Pipeline
├── Context Builder
│   ├── account snapshot
│   ├── positions snapshot
│   ├── market snapshot
│   ├── analysis snapshot
│   ├── search evidence
│   └── strategy config
├── Rule Engine
├── Search Engine Adapter
├── LLM Decision Adapter
├── Risk Engine
├── Execution Gate
└── Audit Logger

Execution Modes
├── dry_run
├── simulation_only
└── paper_execution
```

---

## 四、必须新增的模块

### 1. `src/automation/automationEngine.js`
统一自动化入口。

职责：
- 接收 trigger
- 构造上下文
- 依次执行 rule / search / llm / risk / execute
- 返回结构化执行结果

输出建议：
```json
{
  "runId": "auto_xxx",
  "mode": "dry_run | simulation_only | paper_execution",
  "trigger": {"type": "schedule | condition | manual | search | llm"},
  "context": {},
  "decision": {},
  "riskCheck": {},
  "execution": {},
  "audit": {}
}
```

### 2. `src/automation/ruleEngine.js`
支持**自定义条件入口**。

支持三类条件：
1. 静态条件
   - 价格大于/小于
   - 持仓比例
   - 当日盈亏
   - 回撤阈值
2. 组合条件
   - AND / OR / NOT
3. 派生条件
   - MA 交叉
   - 连涨/连跌
   - 波动率升高
   - 策略表现恶化

示例：
```json
{
  "id": "rule_take_profit_1",
  "enabled": true,
  "if": {
    "all": [
      {"field": "symbol", "op": "eq", "value": "600519"},
      {"field": "market.price", "op": "gte", "value": 1800},
      {"field": "position.unrealizedPct", "op": "gte", "value": 0.12}
    ]
  },
  "then": {
    "action": "sell",
    "qtyMode": "percent_position",
    "qtyValue": 0.3
  }
}
```

### 3. `src/automation/searchProviders/`
统一搜索引擎适配层，不要把搜索写死在 LLM prompt 里。

先支持：
- `newsSearchProvider.js`
- `symbolNewsProvider.js`
- `filingSearchProvider.js`
- `macroSearchProvider.js`

搜索结果统一 schema：
```json
{
  "provider": "news",
  "query": "茅台 业绩 预告",
  "items": [
    {
      "title": "...",
      "url": "...",
      "publishedAt": "...",
      "summary": "...",
      "relevance": 0.86,
      "sentiment": "positive | neutral | negative | mixed",
      "symbols": ["600519"]
    }
  ]
}
```

### 4. `src/automation/llm/`
拆分成两个角色：
- `llmDecisionAdapter.js`：把上下文转成结构化决策
- `llmCriticAdapter.js`：对决策进行二次审查，防止幻觉和越权

输出必须强制 JSON Schema，例如：
```json
{
  "action": "buy | sell | hold | no_op",
  "symbol": "600519",
  "confidence": 0.0,
  "reasoning": ["..."],
  "evidenceRefs": ["search:0", "analysis:max_drawdown"],
  "positionSize": {
    "mode": "cash_percent | position_percent | shares",
    "value": 0.2
  },
  "riskFlags": []
}
```

### 5. `src/automation/riskEngine.js`
LLM 再聪明也不能绕过这里。

至少要拦住：
- 超过单标的最大仓位
- 超过账户总风险敞口
- 已触发最大回撤停机
- 当天最大交易次数超限
- 数据质量不足（搜索为空/价格为模拟/行情过旧）
- 冷却时间未过
- 同方向重复交易

### 6. `src/automation/backtest/`
你说要“验证分析策略是否有效”，那就必须有仿真框架。

至少拆成：
- `scenarioRunner.js`
- `eventReplayEngine.js`
- `strategyEvaluator.js`
- `reportBuilder.js`

核心能力：
- 给定一段历史事件流
- 回放价格 / 搜索新闻 / 账户状态
- 调用同一套 automation pipeline
- 输出绩效报告

---

## 五、数据模型必须升级

### 1. state.json 不再只存账户状态，还要存自动化配置
建议新增：
```json
{
  "currentAccountId": "acc_xxx",
  "accounts": {},
  "automation": {
    "global": {
      "mode": "simulation_only",
      "maxDailyTrades": 5,
      "maxPositionPct": 0.3,
      "maxDrawdownStop": 0.1
    },
    "strategies": [],
    "rules": [],
    "runs": [],
    "searchProfiles": [],
    "llmProfiles": []
  }
}
```

### 2. 历史成交要记录来源
当前 history 里 `strategy` 字段不够。
至少新增：
```json
{
  "source": "manual | cli | rule | automation | llm",
  "runId": "auto_xxx",
  "decisionId": "dec_xxx",
  "evidenceRefs": ["search:0"],
  "riskApproved": true
}
```

### 3. 订单也要区分来源与执行模式
```json
{
  "createdBy": "manual | automation | llm",
  "mode": "simulation_only | paper_execution",
  "ruleId": "rule_xxx",
  "strategyId": "strat_xxx"
}
```

---

## 六、先做的不是“更强 AI”，而是“更硬的护栏”

### 护栏 1：Schema 验证
- 所有外部输入（API / CLI / LLM 输出 / 搜索结果）统一 schema 校验。
- 当前项目建议引入：
  - `zod`（首选）或 `ajv`

### 护栏 2：幂等执行
自动化任务可能重复触发。
必须加：
- `idempotencyKey`
- 同一 symbol + 同一 trigger window 内防重复执行

### 护栏 3：审计日志
新增：
- `data/audit/*.jsonl`
- 每次自动化 run 一行
- 可后续接前端审计页

### 护栏 4：数据质量标签
行情结果必须带：
```json
{
  "source": "sina | eastmoney | fallback_simulated",
  "isSynthetic": false,
  "fetchedAt": "...",
  "staleAfterMs": 10000
}
```

### 护栏 5：执行闸门
执行前统一检查：
- 市场是否开市
- 是否允许盘后模拟成交
- 是否允许使用模拟价格
- 是否允许跨币种资产直接比较

---

## 七、你要的“自定义条件入口”怎么设计

### 入口 A：规则条件入口（最稳）
适合你手写策略。

示例：
- 当某股票跌破 MA20 且账户现金 > 30% 时买入
- 当持仓浮盈 > 8% 且相关新闻情绪转负时卖出 50%

### 入口 B：搜索分析条件入口
适合事件驱动策略。

示例：
- 搜索“业绩预告 / 回购 / 监管处罚 / 产品发布 / AI 资本开支”
- 将结果结构化为 sentiment / event_type / relevance / confidence
- 作为 rule engine 的输入条件，而不是直接给 LLM 一坨网页文本

### 入口 C：LLM 分析条件入口
适合复杂判断，但必须限权。

LLM 只负责：
- 解释上下文
- 生成候选动作
- 给出证据引用

LLM 不负责：
- 直接改账户状态
- 绕过风险约束
- 自己决定无限制仓位

---

## 八、最狠的落地顺序（按周迭代）

## Phase 1：收口交易真相源（必须先做）

### 目标
把所有交易写操作收敛到同一条链路。

### 任务
1. 让 `lib/trading.js` 退化为 facade：
   - CLI 兼容保留
   - 内部全部转调 `src/server/services/*`
2. `buy/sell` 强制改为 `withStateTransaction()`
3. 补统一 request validation
4. 为 history / orders 增加 `source` / `mode` / `runId` 字段

### 完成标准
- HTTP、CLI、自动化任务调用同一套核心 service
- 不再存在两套独立状态逻辑

---

## Phase 2：建立自动化主干

### 目标
让系统具备 **dry-run / simulation-only** 自动运行能力。

### 任务
1. 新增 `automationEngine`
2. 新增 `ruleEngine`
3. 新增 `riskEngine`
4. 新增 `/api/automation/run`
5. 新增 `/api/automation/rules`
6. 新增 `/api/automation/runs`

### 完成标准
- 可以手动提交一个 trigger
- 系统能输出完整 run result
- 不执行真实下单，只写模拟或 dry-run 报告

---

## Phase 3：接入搜索引擎

### 目标
让自动化可消费外部事件信息。

### 任务
1. 定义统一 search provider interface
2. 加入新闻/公告/主题搜索
3. 为搜索结果做 relevance + sentiment + symbols 提取
4. 允许 rule engine 读取 search evidence

### 完成标准
- 策略可以写出“价格条件 + 新闻条件”组合规则
- 搜索结果可审计、可缓存、可回放

---

## Phase 4：接入 LLM 决策

### 目标
让 LLM 成为**候选决策器**，而不是裸执行器。

### 任务
1. 增加 LLM provider adapter
2. 增加决策 JSON schema 校验
3. 增加 critic 二次审查
4. 增加 prompt/context builder
5. 增加 evidenceRefs 机制

### 完成标准
- LLM 输出必须结构化
- 无 evidence / confidence 太低 / risk 不通过时直接拒绝执行

---

## Phase 5：仿真与策略验证

### 目标
验证你的分析策略是否有效。

### 任务
1. 做 event replay
2. 做策略对比器
3. 做收益、回撤、换手、胜率、收益波动统计
4. 做策略报告页

### 完成标准
- 任意策略都可以在同一历史区间下对比
- 能看出“加了搜索信号是否更好”“加了 LLM 是否更差/更稳”

---

## 九、API 设计建议

### 新增自动化 API

#### `POST /api/automation/run`
手动触发一次自动化。

#### `GET /api/automation/runs`
查询最近自动化执行记录。

#### `POST /api/automation/rules`
新增规则。

#### `PATCH /api/automation/rules/:id`
启停/修改规则。

#### `POST /api/automation/search/analyze`
对关键词/标的执行搜索分析。

#### `POST /api/automation/llm/decide`
生成候选决策，仅返回决策，不直接落单。

#### `POST /api/automation/backtest/run`
回测某套规则/某个 LLM profile。

---

## 十、前端产品化建议

前端至少加 4 个页面：

1. **自动化中心**
   - 当前模式
   - 今日自动运行次数
   - 风险开关
   - 最近 run

2. **规则编辑器**
   - 可视化条件组合
   - JSON 高级模式

3. **决策审计页**
   - 每次自动决策的上下文、证据、风控结论、最终动作

4. **策略实验室**
   - 多策略回测对比
   - 是否启用搜索 / 是否启用 LLM / 不同模型版本对比

---

## 十一、立刻禁止的做法

以下做法一律禁止：

1. 让 LLM 直接写 `state.json`
2. 让 LLM 直接调用 buy/sell 而不经过 risk engine
3. 把网页原文直接拼进 prompt 后立即下单
4. 在无数据质量标记情况下把 fallback 模拟价格用于自动执行
5. 在没有幂等和审计日志的情况下跑定时自动化

---

## 十二、V2 第一批提交必须包含的验收点

### 代码层
- [ ] 去双核心，CLI 走 facade + application service
- [ ] `buy/sell/order` 全部进入事务边界
- [ ] 所有自动化输入有 schema 校验
- [ ] 行情结果有 source/isSynthetic/fetchedAt
- [ ] 历史成交带 source/mode/runId

### 功能层
- [ ] dry-run 自动化运行
- [ ] 规则条件触发
- [ ] 自动化审计日志
- [ ] 风险挡板生效

### 策略验证层
- [ ] 至少 1 个 event replay 场景
- [ ] 至少 2 套规则可对比
- [ ] 能验证“是否接入 LLM/搜索”对结果的影响

---

## 十三、最简执行口令

> **先收口交易核心，再建立自动化总线；先让规则、搜索、LLM 只产生候选决策，再让风险引擎和执行闸门决定是否落地；默认只做仿真，不做越权执行；所有自动化必须可回放、可审计、可对比。**

这条是 Leomoney V2 的最高准则。
