/**
 * Leomoney 熔断器 — 自动交易安全网
 * 三态状态机：CLOSED(正常) → OPEN(熔断) → HALF_OPEN(试探)
 * 降级策略：Level 3 → Level 2 → Level 1
 */

const EventEmitter = require('events');

// 熔断器状态
const STATE = { CLOSED: 'CLOSED', OPEN: 'OPEN', HALF_OPEN: 'HALF_OPEN' };

// 默认配置
const DEFAULT_CONFIG = {
  maxDailyLossPct: 0.05,      // 日亏损上限 5%
  maxConsecutiveLosses: 3,     // 连续亏损 N 次触发降级
  maxSingleLossPct: 0.03,     // 单笔亏损上限 3%
  cooldownMinutes: 240,        // 冷却期 4 小时
  halfOpenMaxTrades: 1,        // 试探期最多交易次数
};

class CircuitBreaker extends EventEmitter {
  constructor() {
    super();
    this.state = STATE.CLOSED;
    this.config = { ...DEFAULT_CONFIG };
    this.dailyLossPct = 0;
    this.consecutiveLosses = 0;
    this.cooldownStart = null;
    this.halfOpenTrades = 0;
    this.currentLevel = 1;       // Agent 运行等级 1/2/3
    this.dailyResetDate = null;
    this.history = [];           // 熔断事件日志
  }

  /**
   * 更新配置
   */
  updateConfig(newConfig) {
    Object.assign(this.config, newConfig);
    this._log('config_updated', JSON.stringify(newConfig));
  }

  /**
   * 设置运行等级
   */
  setLevel(level) {
    if (level < 1 || level > 3) throw new Error('Level 必须为 1/2/3');
    const old = this.currentLevel;
    this.currentLevel = level;
    this._log('level_change', `L${old} → L${level}`);
    this.emit('levelChange', { from: old, to: level });
  }

  /**
   * 记录一笔交易结果，更新熔断器状态
   * @param {Object} tradeResult - { success, pnl, pnlPct, symbol }
   */
  recordTrade(tradeResult) {
    this._resetDailyIfNeeded();

    if (!tradeResult.success) {
      this.consecutiveLosses++;
      this._log('trade_loss', `${tradeResult.symbol} pnl=${tradeResult.pnl?.toFixed(2)} consecutive=${this.consecutiveLosses}`);

      // 单笔亏损超限
      if (tradeResult.pnlPct && Math.abs(tradeResult.pnlPct) >= this.config.maxSingleLossPct) {
        this._trip('single_loss_exceeded', `单笔亏损 ${(tradeResult.pnlPct * 100).toFixed(1)}% 超过上限 ${(this.config.maxSingleLossPct * 100).toFixed(0)}%`);
        return;
      }

      // 连续亏损
      if (this.consecutiveLosses >= this.config.maxConsecutiveLosses) {
        this._trip('consecutive_losses', `连续 ${this.consecutiveLosses} 次亏损`);
        return;
      }
    } else {
      this.consecutiveLosses = 0;
    }

    // 日亏损累计
    if (tradeResult.pnlPct) {
      this.dailyLossPct += tradeResult.pnlPct;
    }

    if (this.dailyLossPct <= -this.config.maxDailyLossPct) {
      this._trip('daily_loss_exceeded', `日亏损 ${(this.dailyLossPct * 100).toFixed(1)}% 超过上限 ${(this.config.maxDailyLossPct * 100).toFixed(0)}%`);
    }
  }

  /**
   * 检查是否允许执行交易
   * @param {number} requiredLevel - 需要的最低等级 (1/2/3)
   * @returns {{ allowed: boolean, reason?: string, level: number }}
   */
  checkAllowance(requiredLevel = 3) {
    this._checkCooldown();

    // 熔断状态
    if (this.state === STATE.OPEN) {
      return { allowed: false, reason: '熔断中，所有自动交易暂停', level: this.currentLevel };
    }

    // 试探状态只允许 Level 1
    if (this.state === STATE.HALF_OPEN) {
      if (requiredLevel >= 3) {
        return { allowed: false, reason: '试探期，仅允许 Level 1-2 操作', level: this.currentLevel };
      }
      if (this.halfOpenTrades >= this.config.halfOpenMaxTrades) {
        return { allowed: false, reason: '试探期交易次数已满', level: this.currentLevel };
      }
    }

    // 等级不满足
    if (this.currentLevel < requiredLevel) {
      return { allowed: false, reason: `当前 Level ${this.currentLevel}，需要 Level ${requiredLevel}`, level: this.currentLevel };
    }

    return { allowed: true, level: this.currentLevel };
  }

  /**
   * 手动重置熔断器
   */
  reset() {
    this.state = STATE.CLOSED;
    this.consecutiveLosses = 0;
    this.dailyLossPct = 0;
    this.cooldownStart = null;
    this.halfOpenTrades = 0;
    this._log('manual_reset', '人工重置熔断器');
    this.emit('stateChange', { from: null, to: STATE.CLOSED });
  }

  /**
   * 获取当前状态
   */
  getStatus() {
    this._checkCooldown();
    return {
      state: this.state,
      level: this.currentLevel,
      dailyLossPct: this.dailyLossPct,
      consecutiveLosses: this.consecutiveLosses,
      cooldownRemaining: this._cooldownRemaining(),
      config: { ...this.config },
      history: this.history.slice(-20),
    };
  }

  // ── 内部方法 ──

  _trip(reason, detail) {
    const oldState = this.state;
    this.state = STATE.OPEN;
    this.cooldownStart = Date.now();

    // 降级
    if (this.currentLevel === 3) {
      this.currentLevel = 2;
    } else if (this.currentLevel === 2) {
      this.currentLevel = 1;
    }

    this._log('circuit_open', `${reason}: ${detail}`);
    this.emit('stateChange', { from: oldState, to: STATE.OPEN, reason, detail });
    this.emit('trip', { reason, detail, newLevel: this.currentLevel });
  }

  _checkCooldown() {
    if (this.state !== STATE.OPEN) return;
    if (!this.cooldownStart) return;

    const elapsed = Date.now() - this.cooldownStart;
    const cooldownMs = this.config.cooldownMinutes * 60 * 1000;

    if (elapsed >= cooldownMs) {
      this.state = STATE.HALF_OPEN;
      this.halfOpenTrades = 0;
      this._log('circuit_half_open', '冷却期结束，进入试探状态');
      this.emit('stateChange', { from: STATE.OPEN, to: STATE.HALF_OPEN });
    }
  }

  _cooldownRemaining() {
    if (this.state !== STATE.OPEN || !this.cooldownStart) return 0;
    const elapsed = Date.now() - this.cooldownStart;
    const cooldownMs = this.config.cooldownMinutes * 60 * 1000;
    return Math.max(0, cooldownMs - elapsed);
  }

  _resetDailyIfNeeded() {
    const today = new Date().toISOString().slice(0, 10);
    if (this.dailyResetDate !== today) {
      this.dailyLossPct = 0;
      this.dailyResetDate = today;
    }
  }

  _log(event, detail) {
    this.history.push({
      ts: new Date().toISOString(),
      event,
      detail,
      state: this.state,
      level: this.currentLevel,
    });
    if (this.history.length > 200) this.history.splice(0, this.history.length - 200);
    console.log(`[CircuitBreaker] ${event}: ${detail} (state=${this.state}, level=${this.currentLevel})`);
  }
}

// 单例
const breaker = new CircuitBreaker();

module.exports = { breaker, CircuitBreaker, STATE };
