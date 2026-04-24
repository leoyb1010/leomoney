/**
 * Leomoney 硬风控服务
 * 必须在订单创建前生效
 * 返回结构化 RiskDecision
 */

const { D, gt, gte, lt, lte, toMoney, abs } = require('../domain/money');
const { getAccount } = require('./accountService');

const DEFAULT_HARD_CONFIG = {
  maxSingleTradeAmount: 100000,     // 单笔最大金额
  maxSinglePositionPct: 0.2,        // 单标的最大仓位占比
  maxDailyTradeAmount: 500000,      // 日累计成交额
  maxDailyOrderCount: 20,           // 日累计订单数
  forbiddenSymbols: [],             // 禁买名单
  priceJumpThreshold: 0.1,          // 价格异常跳变 10%
  minNetValue: 1000,                // 最低净值保护
  maxPendingOrdersPerSymbol: 3,     // 单标的最大挂单数
};

class RiskControlService {
  constructor() {
    this.config = { ...DEFAULT_HARD_CONFIG };
    this.todayTradeAmount = D(0);
    this.todayOrderCount = 0;
    this.todayDate = null;
  }

  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * 前置风控检查
   * @param {Object} order - { side, symbol, qty, price, category }
   * @param {Object} market - { isTradable, inTradingSession, lastPrice, priceChangePct }
   * @returns {RiskDecision}
   */
  preTradeCheck(order, market = {}) {
    this._resetDailyIfNeeded();
    const reasons = [];
    const machineCode = [];
    const warnings = [];

    const account = getAccount();
    if (!account) {
      return { allowed: false, level: 'HARD_REJECT', reasons: ['账户不存在'], machineCode: ['ACCOUNT_NOT_FOUND'] };
    }

    const cash = account.cash || { available: account.balance || 0, total: account.balance || 0 };
    const positions = account.positions || account.holdings || {};
    const pendingOrders = account.pendingOrders || [];

    // 1. 标的是否可交易
    if (market.isTradable === false) {
      reasons.push('当前标的不允许交易');
      machineCode.push('SYMBOL_NOT_TRADABLE');
    }

    // 2. 交易时段
    if (market.inTradingSession === false) {
      reasons.push('当前不在交易时段');
      machineCode.push('OUTSIDE_TRADING_SESSION');
    }

    // 3. 禁买名单
    if (this.config.forbiddenSymbols.includes(order.symbol)) {
      reasons.push(`标的 ${order.symbol} 在禁买名单中`);
      machineCode.push('FORBIDDEN_SYMBOL');
    }

    // 4. 价格异常跳变
    if (market.lastPrice && order.price) {
      const jump = abs(D(order.price).minus(market.lastPrice).div(market.lastPrice)).toNumber();
      if (jump > this.config.priceJumpThreshold) {
        reasons.push(`价格异常跳变 ${(jump * 100).toFixed(1)}%，超过阈值 ${(this.config.priceJumpThreshold * 100).toFixed(0)}%`);
        machineCode.push('PRICE_JUMP_ABNORMAL');
      }
    }

    // 5. 数据空值保护
    if (!order.price || D(order.price).lte(0)) {
      reasons.push('价格数据无效');
      machineCode.push('INVALID_PRICE');
    }
    if (!order.qty || D(order.qty).lte(0)) {
      reasons.push('数量数据无效');
      machineCode.push('INVALID_QTY');
    }

    const isBuy = order.side === 'BUY' || order.side === 'buy' || order.type === 'buy';
    const tradeAmount = D(order.price).times(order.qty);

    // 6. 单笔金额上限
    if (gt(tradeAmount, this.config.maxSingleTradeAmount)) {
      reasons.push(`单笔金额 ${toMoney(tradeAmount)} 超过上限 ${toMoney(this.config.maxSingleTradeAmount)}`);
      machineCode.push('SINGLE_TRADE_AMOUNT_LIMIT');
    }

    // 7. 日累计成交额
    if (gt(this.todayTradeAmount.plus(tradeAmount), this.config.maxDailyTradeAmount)) {
      reasons.push(`日累计成交额将达 ${toMoney(this.todayTradeAmount.plus(tradeAmount))}，超过上限 ${toMoney(this.config.maxDailyTradeAmount)}`);
      machineCode.push('DAILY_TRADE_AMOUNT_LIMIT');
    }

    // 8. 日累计订单数
    if (this.todayOrderCount >= this.config.maxDailyOrderCount) {
      reasons.push(`今日已下单 ${this.todayOrderCount} 笔，超过上限 ${this.config.maxDailyOrderCount}`);
      machineCode.push('DAILY_ORDER_COUNT_LIMIT');
    }

    // 9. 最低净值保护
    if (lt(cash.total, this.config.minNetValue)) {
      reasons.push(`账户净值 ${cash.total} 低于最低保护线 ${this.config.minNetValue}`);
      machineCode.push('NET_VALUE_TOO_LOW');
    }

    // 10. 买入专用检查
    if (isBuy) {
      // 可用资金
      if (gt(tradeAmount, cash.available)) {
        reasons.push(`可用资金不足: ${cash.available} < ${toMoney(tradeAmount)}`);
        machineCode.push('INSUFFICIENT_AVAILABLE_CASH');
      }

      // 单标仓位占比
      const pos = positions[order.symbol];
      const posValue = pos ? D(pos.totalQty || pos.qty || 0).times(order.price) : D(0);
      const totalAssets = D(cash.total).plus(this._calcHoldingValue(positions));
      const newPosPct = totalAssets.gt(0) ? posValue.plus(tradeAmount).div(totalAssets) : D(0);
      if (gt(newPosPct, this.config.maxSinglePositionPct)) {
        reasons.push(`单标仓位将达 ${(newPosPct.toNumber() * 100).toFixed(1)}%，超过上限 ${(this.config.maxSinglePositionPct * 100).toFixed(0)}%`);
        machineCode.push('SINGLE_POSITION_PCT_LIMIT');
      }
    }

    // 11. 卖出专用检查
    if (!isBuy) {
      const pos = positions[order.symbol];
      const sellable = pos?.sellableQty || pos?.qty || 0;
      if (!pos || D(sellable).lt(order.qty)) {
        reasons.push(`可卖数量不足: ${sellable} < ${order.qty}`);
        machineCode.push('INSUFFICIENT_SELLABLE_QTY');
      }
    }

    // 12. 挂单冲突
    const symbolOrders = pendingOrders.filter(o => o.symbol === order.symbol);
    if (symbolOrders.length >= this.config.maxPendingOrdersPerSymbol) {
      reasons.push(`标的 ${order.symbol} 已有 ${symbolOrders.length} 笔挂单，超过上限 ${this.config.maxPendingOrdersPerSymbol}`);
      machineCode.push('PENDING_ORDER_LIMIT');
    }

    if (reasons.length > 0) {
      return { allowed: false, level: 'HARD_REJECT', reasons, machineCode, warnings };
    }

    return { allowed: true, level: 'PASS', reasons: [], machineCode: [], warnings };
  }

  recordOrder(order) {
    this._resetDailyIfNeeded();
    this.todayOrderCount++;
    const amount = D(order.price || 0).times(order.qty || 0);
    this.todayTradeAmount = this.todayTradeAmount.plus(amount);
  }

  getStatus() {
    this._resetDailyIfNeeded();
    return {
      todayOrderCount: this.todayOrderCount,
      todayTradeAmount: toMoney(this.todayTradeAmount),
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

  _resetDailyIfNeeded() {
    const today = new Date().toISOString().slice(0, 10);
    if (this.todayDate !== today) {
      this.todayOrderCount = 0;
      this.todayTradeAmount = D(0);
      this.todayDate = today;
    }
  }
}

const riskControlService = new RiskControlService();
module.exports = { riskControlService, RiskControlService, DEFAULT_HARD_CONFIG };
