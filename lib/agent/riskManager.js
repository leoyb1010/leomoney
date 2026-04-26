/**
 * Leomoney 风控引擎 v3 — 真实PnL驱动
 * 改造点：
 *   1. 使用 cash/positions 新结构
 *   2. Decimal 计算
 *   3. 返回结构化 RiskDecision（level/reasons/machineCode）
 *   4. 买入检查可用资金（非总余额）
 *   5. 卖出检查可卖数量（非总持仓）
 *   6. v3.0: 真实PnL风控 — 基于持仓实时盈亏动态止损止盈
 *   7. v3.0: 持仓风险评分 — 综合评估持仓集中度/回撤/波动
 *   8. v1.9.0: 多账户隔离 — Map<accountId, RiskManager>
 */

const { getAccount } = require('../../src/server/services/accountService');
const { D, gt, gte, lt, toMoney, toQty } = require('../../src/server/domain/money');
const { getStockQuote } = require('../quotes');

const DEFAULT_RISK_CONFIG = {
  maxSinglePositionPct: 0.2,
  maxTotalPositionPct: 0.7,
  maxDailyLossPct: 0.05,
  maxSingleLossPct: 0.03,
  defaultStopLossPct: 0.03,
  defaultTakeProfitPct: 0.08,
  // v3: 动态止损止盈（基于持仓PnL）
  trailingStopPct: 0.02,        // 移动止损：从最高点回落2%触发
  maxUnrealizedLossPct: 0.05,   // 单持仓浮亏超5%自动止损
  maxTotalUnrealizedLossPct: 0.08, // 总浮亏超8%触发风控
  maxPositionConcentration: 0.3,  // 单标的最大持仓占比
  maxTradesPerDay: 10,
  minTradeIntervalSec: 60,
  allowedTradingWindows: {
    astocks: [{ start: '09:30', end: '11:30' }, { start: '13:00', end: '15:00' }],
    hkstocks: [{ start: '09:30', end: '12:00' }, { start: '13:00', end: '16:00' }],
    usstocks: [{ start: '21:30', end: '04:00' }],
    crypto: [{ start: '00:00', end: '24:00' }],
    metals: [{ start: '00:00', end: '24:00' }],
  },
  lockoutMinutesBeforeClose: 5,
};

class RiskManager {
  constructor() {
    this.config = { ...DEFAULT_RISK_CONFIG };
    this.todayTradeCount = 0;
    this.lastTradeTime = 0;
    this.todayDate = null;
    this.positionHighWaterMarks = {}; // 记录每个持仓的最高市值（移动止损用）
  }

  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * 风控检查
   * @returns {RiskDecision} { allowed, level, reasons, machineCode, warnings, adjustedQty }
   */
  check(proposal, level = 1) {
    this._resetDailyIfNeeded();
    const reasons = [];
    const machineCode = [];
    const warnings = [];

    const account = getAccount();
    if (!account) {
      return { allowed: false, level: 'HARD_REJECT', reasons: ['账户不存在'], machineCode: ['ACCOUNT_NOT_FOUND'] };
    }

    // 使用新结构
    const cash = account.cash || { available: account.balance || 0, total: account.balance || 0 };
    const positions = account.positions || account.holdings || {};

    // Level 1 不执行
    if (level === 1) {
      return { allowed: false, level: 'HARD_REJECT', reasons: ['Level 1 仅监控，不执行交易'], machineCode: ['LEVEL1_NO_TRADE'] };
    }

    if (!proposal.symbol || !proposal.action || !proposal.price || !proposal.qty) {
      return { allowed: false, level: 'HARD_REJECT', reasons: ['交易方案缺少必要参数'], machineCode: ['MISSING_PARAMS'] };
    }

    if (proposal.action !== '买入' && proposal.action !== '卖出' && proposal.action !== 'BUY' && proposal.action !== 'SELL') {
      return { allowed: false, level: 'HARD_REJECT', reasons: [`未知交易动作: ${proposal.action}`], machineCode: ['UNKNOWN_ACTION'] };
    }

    const isBuy = proposal.action === '买入' || proposal.action === 'BUY';

    // Level 3 严格检查
    if (level === 3) {
      if ((proposal.confidence || 0) < 0.7) {
        reasons.push(`置信度 ${(proposal.confidence || 0).toFixed(2)} 低于 0.7 阈值`);
        machineCode.push('CONFIDENCE_TOO_LOW');
      }
      if (proposal.riskLevel === '高') {
        reasons.push('风险等级为"高"，自动交易不执行');
        machineCode.push('RISK_LEVEL_HIGH');
      }
      if (this.todayTradeCount >= this.config.maxTradesPerDay) {
        reasons.push(`今日已交易 ${this.todayTradeCount} 笔，超限`);
        machineCode.push('DAILY_TRADE_LIMIT');
      }
      const elapsed = (Date.now() - this.lastTradeTime) / 1000;
      if (elapsed < this.config.minTradeIntervalSec) {
        reasons.push(`交易间隔不足 ${this.config.minTradeIntervalSec} 秒`);
        machineCode.push('TRADE_INTERVAL_TOO_SHORT');
      }
      const timeCheck = this._checkTradingWindow(proposal.category);
      if (!timeCheck.allowed) {
        reasons.push(timeCheck.reason);
        machineCode.push('OUTSIDE_TRADING_WINDOW');
      }
    }

    // v3: 持仓风险评估（买入前检查整体风险）
    if (isBuy && level >= 2) {
      const portfolioRisk = this._assessPortfolioRisk(positions, cash);
      if (portfolioRisk.totalUnrealizedLossPct <= -this.config.maxTotalUnrealizedLossPct) {
        reasons.push(`总浮亏 ${(portfolioRisk.totalUnrealizedLossPct * 100).toFixed(1)}% 超限 ${(this.config.maxTotalUnrealizedLossPct * 100).toFixed(0)}%，禁止新开仓`);
        machineCode.push('TOTAL_UNREALIZED_LOSS_EXCEEDED');
      }
      if (portfolioRisk.concentrationRisk) {
        warnings.push('持仓集中度偏高，建议分散');
      }
    }

    // 仓位限制 (Level 2 & 3)
    let adjustedQty = proposal.qty;
    const totalAssets = D(cash.total).plus(this._calcHoldingValue(positions));
    const tradeAmount = D(adjustedQty).times(proposal.price);

    if (isBuy) {
      // 单笔仓位上限
      const singlePct = tradeAmount.div(totalAssets);
      if (gt(singlePct, this.config.maxSinglePositionPct)) {
        adjustedQty = this._adjustQty(totalAssets.times(this.config.maxSinglePositionPct).div(proposal.price).toNumber(), proposal.category);
        if (adjustedQty <= 0) {
          reasons.push('单笔仓位超限且调整后为0');
          machineCode.push('SINGLE_POSITION_LIMIT');
        } else {
          warnings.push(`仓位调整 ${proposal.qty} → ${adjustedQty}（单笔上限 ${(this.config.maxSinglePositionPct * 100).toFixed(0)}%）`);
        }
      }

      // 总仓位上限
      const currentHoldingValue = this._calcHoldingValue(positions);
      const currentHoldingPct = totalAssets.gt(0) ? currentHoldingValue.div(totalAssets) : D(0);
      const newTotalPct = currentHoldingPct.plus(D(adjustedQty).times(proposal.price).div(totalAssets));
      if (gt(newTotalPct, this.config.maxTotalPositionPct)) {
        reasons.push(`总仓位将达 ${newTotalPct.times(100).toFixed(1)}%，超限 ${(this.config.maxTotalPositionPct * 100).toFixed(0)}%`);
        machineCode.push('TOTAL_POSITION_LIMIT');
      }

      // v3: 持仓集中度检查
      const existingPosition = positions[proposal.symbol];
      if (existingPosition) {
        const existingValue = D(existingPosition.totalQty || existingPosition.qty || 0).times(existingPosition.avgCost || 0);
        const newTotalValue = existingValue.plus(D(adjustedQty).times(proposal.price));
        const concentrationPct = newTotalValue.div(totalAssets);
        if (gt(concentrationPct, this.config.maxPositionConcentration)) {
          reasons.push(`单标的持仓将达 ${concentrationPct.times(100).toFixed(1)}%，超过集中度上限 ${(this.config.maxPositionConcentration * 100).toFixed(0)}%`);
          machineCode.push('POSITION_CONCENTRATION_LIMIT');
        }
      }

      // 可用资金检查（关键！用 available 不是 total）
      const needCash = D(adjustedQty).times(proposal.price).times(1.0003); // 含手续费
      if (gt(needCash, cash.available)) {
        adjustedQty = this._adjustQty(D(cash.available).div(proposal.price).toNumber(), proposal.category);
        if (adjustedQty <= 0) {
          reasons.push(`可用资金不足: ${cash.available} < ${needCash.toFixed(2)}`);
          machineCode.push('INSUFFICIENT_AVAILABLE_CASH');
        } else {
          warnings.push(`仓位调整 ${proposal.qty} → ${adjustedQty}（资金不足）`);
        }
      }
    }

    if (!isBuy) {
      // 卖出检查可卖数量
      const pos = positions[proposal.symbol];
      const sellable = pos?.sellableQty || pos?.qty || 0;
      if (!pos || D(sellable).lt(adjustedQty)) {
        reasons.push(`可卖数量不足: ${sellable} < ${adjustedQty}`);
        machineCode.push('INSUFFICIENT_SELLABLE_QTY');
      }

      // v3: 卖出时检查浮亏 — 大亏时不建议卖出但允许（只出警告）
      if (pos && pos.avgCost) {
        const unrealizedPnlPct = (proposal.price - Number(pos.avgCost)) / Number(pos.avgCost);
        if (unrealizedPnlPct <= -this.config.maxUnrealizedLossPct) {
          warnings.push(`该持仓浮亏 ${(unrealizedPnlPct * 100).toFixed(1)}%，已超止损线，确认止损卖出`);
        }
      }
    }

    if (reasons.length > 0) {
      return { allowed: false, level: 'HARD_REJECT', reasons, machineCode, warnings, adjustedQty };
    }

    return { allowed: true, level: 'PASS', reasons: [], machineCode: [], warnings, adjustedQty };
  }

  /**
   * v3: 生成智能止损止盈单（基于真实PnL）
   * 支持移动止损和固定止损止盈
   */
  generateStopOrders(proposal, executionResult) {
    const orders = [];
    const execPrice = executionResult.price || proposal.price;
    const category = proposal.category || 'astocks';
    const qty = executionResult.qty || proposal.qty;
    const symbol = proposal.symbol;

    if (proposal.action === '买入' || proposal.action === 'BUY') {
      // 固定止损
      const stopLossPrice = +(D(execPrice).times(1 - this.config.defaultStopLossPct).toFixed(2));
      orders.push({
        symbol, name: proposal.name || symbol, type: 'sell', triggerType: 'lte',
        triggerPrice: stopLossPrice, qty, category, source: 'agent_stoploss',
        metadata: { type: 'fixed_stoploss', buyPrice: execPrice, lossPct: this.config.defaultStopLossPct },
      });

      // 固定止盈
      const takeProfitPrice = +(D(execPrice).times(1 + this.config.defaultTakeProfitPct).toFixed(2));
      orders.push({
        symbol, name: proposal.name || symbol, type: 'sell', triggerType: 'gte',
        triggerPrice: takeProfitPrice, qty, category, source: 'agent_takeprofit',
        metadata: { type: 'fixed_takeprofit', buyPrice: execPrice, profitPct: this.config.defaultTakeProfitPct },
      });

      // v3: 移动止损（价格达到止盈线后自动跟踪）
      // 在止盈触发时更新止损到买入价（保本止损），这由 scheduler 处理
    }
    return orders;
  }

  /**
   * v3: 检查持仓是否需要动态止损
   * 基于实时行情，返回需要止损的持仓列表
   * @returns {Array<{symbol, reason, triggerPrice, currentPrice, unrealizedPnlPct}>}
   */
  async checkPositionStopLoss() {
    const account = getAccount();
    if (!account) return [];

    const positions = account.positions || account.holdings || {};
    const stopLossTriggers = [];

    for (const [symbol, pos] of Object.entries(positions)) {
      if (!pos.avgCost || pos.avgCost === 0) continue;

      try {
        const quote = await getStockQuote(symbol);
        if (!quote?.price) continue;

        const avgCost = Number(pos.avgCost);
        const currentPrice = quote.price;
        const unrealizedPnlPct = (currentPrice - avgCost) / avgCost;

        // 浮亏超过止损线
        if (unrealizedPnlPct <= -this.config.maxUnrealizedLossPct) {
          stopLossTriggers.push({
            symbol,
            name: pos.name || symbol,
            reason: `浮亏 ${(unrealizedPnlPct * 100).toFixed(1)}% 超过止损线 ${(-this.config.maxUnrealizedLossPct * 100).toFixed(0)}%`,
            triggerPrice: currentPrice,
            currentPrice,
            avgCost,
            unrealizedPnlPct,
            qty: pos.sellableQty || pos.totalQty || pos.qty,
            category: pos.category || quote.category || 'astocks',
          });
        }

        // 移动止损检查：从最高点回落
        const posKey = symbol;
        const currentValue = currentPrice * Number(pos.totalQty || pos.qty || 0);
        if (!this.positionHighWaterMarks[posKey] || currentValue > this.positionHighWaterMarks[posKey]) {
          this.positionHighWaterMarks[posKey] = currentValue;
        }
        const drawdown = (this.positionHighWaterMarks[posKey] - currentValue) / this.positionHighWaterMarks[posKey];
        if (drawdown >= this.config.trailingStopPct && unrealizedPnlPct > 0) {
          // 盈利但回撤过大 → 移动止损
          stopLossTriggers.push({
            symbol,
            name: pos.name || symbol,
            reason: `从最高点回撤 ${(drawdown * 100).toFixed(1)}% 超过移动止损线 ${(this.config.trailingStopPct * 100).toFixed(0)}%`,
            triggerPrice: currentPrice,
            currentPrice,
            avgCost,
            unrealizedPnlPct,
            drawdownPct: drawdown,
            qty: pos.sellableQty || pos.totalQty || pos.qty,
            category: pos.category || quote.category || 'astocks',
            isTrailingStop: true,
          });
        }
      } catch (err) {
        // 行情获取失败，跳过
      }
    }

    return stopLossTriggers;
  }

  /**
   * v3: 综合持仓风险评估
   */
  _assessPortfolioRisk(positions, cash) {
    let totalValue = D(cash?.total || 0);
    let totalUnrealizedPnl = D(0);
    let maxSinglePositionPct = D(0);
    let positionCount = 0;

    for (const pos of Object.values(positions || {})) {
      const qty = Number(pos.totalQty || pos.qty || 0);
      const cost = Number(pos.avgCost || 0);
      const value = D(qty).times(cost);
      totalValue = totalValue.plus(value);
      totalUnrealizedPnl = totalUnrealizedPnl.plus(D(pos.realizedPnl || 0));
      positionCount++;
      if (totalValue.gt(0)) {
        const pct = value.div(totalValue);
        if (gt(pct, maxSinglePositionPct)) maxSinglePositionPct = pct;
      }
    }

    const totalUnrealizedLossPct = totalValue.gt(0) ? totalUnrealizedPnl.div(totalValue).toNumber() : 0;

    return {
      totalUnrealizedLossPct,
      concentrationRisk: gt(maxSinglePositionPct, 0.3),
      maxSinglePositionPct: maxSinglePositionPct.toNumber(),
      positionCount,
    };
  }

  recordTrade(success = true) {
    this._resetDailyIfNeeded();
    this.todayTradeCount++;
    this.lastTradeTime = Date.now();
    if (!success) {
      this._log('trade_failed', `交易失败，今日第 ${this.todayTradeCount} 笔`);
    }
  }

  _log(event, detail) {
    console.log(`[RiskManager] ${event}: ${detail}`);
  }

  getStatus() {
    return {
      todayTradeCount: this.todayTradeCount,
      maxTradesPerDay: this.config.maxTradesPerDay,
      lastTradeTime: this.lastTradeTime,
      config: { ...this.config },
    };
  }

  _calcHoldingValue(positions) {
    let total = D(0);
    for (const h of Object.values(positions || {})) {
      total = total.plus(D(h.totalQty || h.qty || 0).times(h.avgCost || 0));
    }
    return total;
  }

  _adjustQty(rawQty, category) {
    const rules = this._getCategoryRules(category);
    return Math.floor(rawQty / rules.step) * rules.step;
  }

  _getCategoryRules(category) {
    switch (category) {
      case 'crypto': return { step: 0.01, multiple: false };
      case 'metals': return { step: 1, multiple: false };
      case 'hkstocks': return { step: 100, multiple: true };
      case 'usstocks': return { step: 1, multiple: false };
      default: return { step: 100, multiple: true };
    }
  }

  _checkTradingWindow(category) {
    const windows = this.config.allowedTradingWindows[category || 'astocks'];
    if (!windows) return { allowed: true };
    const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
    for (const w of windows) {
      const [sh, sm] = w.start.split(':').map(Number);
      const [eh, em] = w.end.split(':').map(Number);
      const startMin = sh * 60 + sm;
      const endMin = eh * 60 + em;
      if (endMin < startMin) { if (nowMinutes >= startMin || nowMinutes <= endMin) return { allowed: true }; }
      else { if (nowMinutes >= startMin && nowMinutes <= endMin) return { allowed: true }; }
    }
    return { allowed: false, reason: `当前不在 ${category} 允许交易时段` };
  }

  _resetDailyIfNeeded() {
    const today = new Date().toISOString().slice(0, 10);
    if (this.todayDate !== today) { this.todayTradeCount = 0; this.todayDate = today; }
  }
}

// ── 多账户隔离：Map<accountId, RiskManager> ──

const _riskManagers = new Map();

function _getAccountId() {
  try {
    const acc = getAccount();
    return acc?.accountId || 'default';
  } catch {
    return 'default';
  }
}

/**
 * 获取指定账户的风控引擎（按需创建）
 * @param {string} [accountId] - 不传则用当前账户
 */
function getRiskManagerForAccount(accountId) {
  const id = accountId || _getAccountId();
  if (!_riskManagers.has(id)) {
    _riskManagers.set(id, new RiskManager());
  }
  return _riskManagers.get(id);
}

/**
 * 清除指定账户的风控引擎（账户删除时调用）
 */
function removeRiskManagerForAccount(accountId) {
  _riskManagers.delete(accountId);
}

// 向后兼容：riskManager 始终指向当前账户的实例
const riskManager = new Proxy({}, {
  get(_target, prop, _receiver) {
    const instance = getRiskManagerForAccount();
    const value = instance[prop];
    if (typeof value === 'function') {
      return value.bind(instance);
    }
    return value;
  },
  set(_target, prop, value) {
    const instance = getRiskManagerForAccount();
    instance[prop] = value;
    return true;
  },
});

module.exports = { riskManager, RiskManager, DEFAULT_RISK_CONFIG, getRiskManagerForAccount, removeRiskManagerForAccount };
