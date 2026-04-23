# V2 Safe Core Unification 回滚说明

## 当前分支策略

- 备份检查点分支：`backup/pre-v2-safe-refactor-b21c4cb`
- 功能开发分支：`feat/v2-safe-core-unification`

## 推荐回滚方式

### 方式一：直接回到检查点分支
适合快速恢复到“继续改造前”的稳定状态。

```bash
git checkout backup/pre-v2-safe-refactor-b21c4cb
```

### 方式二：主分支不合并功能分支
如果只是在评审阶段，直接不合并 `feat/v2-safe-core-unification` 即可。

### 方式三：按提交粒度回滚
如需逐步回退，可按功能分支上的提交倒序 revert：

- `06474c394188b4d4d66a4db0d4e7123a9dc15f49` — CLI 对齐事务与元信息
- `2d1e734b62c6cb2bf19585063cb2c84ebab5f812` — tradeRoutes 透传审计元信息
- `b4909952b56b2fbc9bdec577591b03cbcf57c644` — orderService 增强订单/执行审计元信息
- `fd66d43845574b8cdbc2926e830e6eccb923be76` — watchlist 写入纳入事务
- `0aeb9b65bd30482539e78c4e061ba10200354f67` — lib/trading.js 降级为 facade

示例：
```bash
git revert 06474c394188b4d4d66a4db0d4e7123a9dc15f49
```

## 风险最小的恢复顺序

如果怀疑新改造引发问题，建议优先按这个顺序回退：

1. CLI 适配
2. routes 透传元信息
3. orderService 元信息增强
4. watchlist 事务化
5. facade 收口

## 回滚后重点验证

- CLI `buy/sell/order` 是否仍可执行
- `/api/trade/*` 是否正常
- `/api/orders`、`/api/orders/check` 是否正常
- `/api/watchlist` 是否正常
- `data/state.json` 是否仍能正常读写
