/**
 * Leomoney 风控引擎 — 交易前的安全检查
 * Level 1: 只看不动 → 无风控
 * Level 2: 一键执行 → 基础风控
 * Level 3: 自动执行 → 严格风控
 */

const { getAccount } = require('../../src/server/services/accountService');

// 默认风控参数
const DEFAULT_RISK_CONFIG = {
  maxSinglePositionPct: 0.2,
  maxTotalPositionPct: 0.7,
  maxDailyLossPct: 0.05,
  maxSingleLossPct: 0.03,
  defaultStopLossPct: 0.03,
  defaultTakeProfitPct: 0.08,
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
  }

  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * 风控检查
   * @param {Object} proposal - { symbol, action, qty, price, category, confidence, riskLevel }
   * @param {number} level - Agent 等级 1/2/3
   * @returns {{ allowed: boolean, reason?: string, warnings?: string[], adjustedQty?: number }}
   */
  check(proposal, level = 1) {
    this._resetDailyIfNeeded();
    const warnings = [];
    const account = getAccount();
    if (!account) return { allowed: false, reason: '账户不存在' };

    // Level 1 不执行
    if (level === 1) {
      return { allowed: false, reason: 'Level 1 仅监控，不执行交易' };
    }

    if (!proposal.symbol || !proposal.action || !proposal.price || !proposal.qty) {
      return { allowed: false, reason: '交易方案缺少必要参数' };
    }

    if (proposal.action !== '买入' && proposal.action !== '卖出') {
      return { allowed: false, reason: `未知交易动作: ${proposal.action}` };
    }

    // Level 3 严格检查
    if (level === 3) {
      if ((proposal.confidence || 0) < 0.7) {
        return { allowed: false, reason: `置信度 ${(proposal.confidence || 0).toFixed(2)} 低于 0.7 阈值` };
      }
      if (proposal.riskLevel === '高') {
        return { allowed: false, reason: '风险等级为"高"，自动交易不执行' };
      }
      if (this.todayTradeCount >= this.config.maxTradesPerDay) {
        return { allowed: false, reason: `今日已交易 ${this.todayTradeCount} 笔，超限` };
      }
      const elapsed = (Date.now() - this.lastTradeTime) / 1000;
      if (elapsed < this.config.minTradeIntervalSec) {
        return { allowed: false, reason: `交易间隔不足 ${this.config.minTradeIntervalSec} 秒` };
      }
      const timeCheck = this._checkTradingWindow(proposal.category);
      if (!timeCheck.allowed) {
        return { allowed: false, reason: timeCheck.reason };
      }
    }

    // 仓位限制 (Level 2 & 3)
    let adjustedQty = proposal.qty;
    const totalAssets = account.balance + this._calcHoldingValue(account.holdings);
    const tradeAmount = adjustedQty * proposal.price;

    if (proposal.action === '买入') {
      const singlePct = tradeAmount / totalAssets;
      if (singlePct > this.config.maxSinglePositionPct) {
        adjustedQty = this._adjustQty(totalAssets * this.config.maxSinglePositionPct / proposal.price, proposal.category);
        if (adjustedQty <= 0) return { allowed: false, reason: '单笔仓位超限且调整后为0' };
        warnings.push(`仓位调整 ${proposal.qty} → ${adjustedQty}（单笔上限）`);
      }
      const currentHoldingPct = this._calcHoldingValue(account.holdings) / totalAssets;
      const newTotalPct = currentHoldingPct + adjustedQty * proposal.price / totalAssets;
      if (newTotalPct > this.config.maxTotalPositionPct) {
        return { allowed: false, reason: `总仓位将达 ${(newTotalPct * 100).toFixed(1)}%，超限` };
      }
      if (adjustedQty * proposal.price > account.balance) {
        adjustedQty = this._adjustQty(account.balance / proposal.price, proposal.category);
        if (adjustedQty <= 0) return { allowed: false, reason: '可用资金不足' };
        warnings.push(`仓位调整 ${proposal.qty} → ${adjustedQty}（资金不足）`);
      }
    }

    if (proposal.action === '卖出') {
      const holding = account.holdings[proposal.symbol];
      if (!holding || holding.qty < adjustedQty) {
        return { allowed: false, reason: `持仓不足（${holding ? holding.qty : 0} < ${adjustedQty}）` };
      }
    }

    return { allowed: true, warnings, adjustedQty };
  }

  /**
   * 生成自动止损止盈条件单
   */
  generateStopOrders(proposal, executionResult) {
    const orders = [];
    const execPrice = executionResult.price || proposal.price;
    const category = proposal.category || 'astocks';
    const qty = executionResult.qty || proposal.qty;
    const symbol = proposal.symbol;

    if (proposal.action === '买入') {
      const stopLossPrice = +(execPrice * (1 - this.config.defaultStopLossPct)).toFixed(2);
      orders.push({ symbol, name: proposal.name || symbol, type: 'sell', triggerType: 'lte', triggerPrice: stopLossPrice, qty, category, source: 'agent_stoploss' });
      const takeProfitPrice = +(execPrice * (1 + this.config.defaultTakeProfitPct)).toFixed(2);
      orders.push({ symbol, name: proposal.name || symbol, type: 'sell', triggerType: 'gte', triggerPrice: takeProfitPrice, qty, category, source: 'agent_takeprofit' });
    }
    return orders;
  }

  recordTrade() {
    this._resetDailyIfNeeded();
    this.todayTradeCount++;
    this.lastTradeTime = Date.now();
  }

  getStatus() {
    return { todayTradeCount: this.todayTradeCount, maxTradesPerDay: this.config.maxTradesPerDay, lastTradeTime: this.lastTradeTime, config: { ...this.config } };
  }

  _calcHoldingValue(holdings) {
    let total = 0;
    for (const h of Object.values(holdings || {})) { total += h.qty * h.avgCost; }
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

const riskManager = new RiskManager();
module.exports = { riskManager, RiskManager, DEFAULT_RISK_CONFIG };
