/**
 * Leomoney 熔断器 v3 — 自动恢复 + 渐进式升级
 * 三态状态机：CLOSED(正常) → OPEN(熔断) → HALF_OPEN(试探)
 * 降级策略：Level 3 → Level 2 → Level 1
 *
 * v3.0 升级点：
 *   1. HALF_OPEN 试探成功自动恢复到 CLOSED（渐进式升级 Level）
 *   2. 定时器自动从 OPEN → HALF_OPEN（无需手动 reset）
 *   3. 试探成功：Level +1 直到恢复原始 Level
 *   4. 试探失败：直接回到 OPEN
 *   5. 完整事件通知（stateChange/levelChange/trip/recover/halfOpenTest）
 *   6. 多账户隔离 — Map<accountId, CircuitBreaker>
 */

const EventEmitter = require('events');
const { getAccount } = require('../../src/server/services/accountService');

// 熔断器状态
const STATE = { CLOSED: 'CLOSED', OPEN: 'OPEN', HALF_OPEN: 'HALF_OPEN' };

// 默认配置
const DEFAULT_CONFIG = {
  maxDailyLossPct: 0.05,      // 日亏损上限 5%
  maxConsecutiveLosses: 3,     // 连续亏损 N 次触发降级
  maxSingleLossPct: 0.03,     // 单笔亏损上限 3%
  cooldownMinutes: 30,         // 冷却期 30 分钟（OPEN→HALF_OPEN）
  halfOpenMaxTrades: 1,        // 试探期最多交易次数
  halfOpenSuccessThreshold: 2, // 连续成功 N 次才能完全恢复
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
    this.halfOpenSuccesses = 0;   // 试探期连续成功次数
    this.currentLevel = 1;        // Agent 运行等级 1/2/3
    this.originalLevel = 1;       // 熔断前的原始等级（恢复目标）
    this.dailyResetDate = null;
    this.history = [];            // 熔断事件日志
    this._cooldownTimer = null;   // 冷却定时器
    this._autoCheckInterval = null; // 自动状态检查定时器
  }

  /**
   * 启动自动状态检查（每 30 秒检查一次冷却是否到期）
   */
  startAutoCheck() {
    if (this._autoCheckInterval) return;
    this._autoCheckInterval = setInterval(() => {
      this._checkCooldown();
    }, 30 * 1000);
  }

  stopAutoCheck() {
    if (this._autoCheckInterval) {
      clearInterval(this._autoCheckInterval);
      this._autoCheckInterval = null;
    }
    if (this._cooldownTimer) {
      clearTimeout(this._cooldownTimer);
      this._cooldownTimer = null;
    }
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
    this.originalLevel = level; // 手动设置视为新的恢复目标
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

      // HALF_OPEN 状态下试探失败 → 直接回到 OPEN
      if (this.state === STATE.HALF_OPEN) {
        this.halfOpenSuccesses = 0;
        this._trip('half_open_failed', `试探期交易亏损，回到熔断`);
        return;
      }
    } else {
      this.consecutiveLosses = 0;

      // HALF_OPEN 试探成功 → 渐进恢复
      if (this.state === STATE.HALF_OPEN) {
        this.halfOpenSuccesses++;
        this._log('half_open_success', `试探成功 ${this.halfOpenSuccesses}/${this.config.halfOpenSuccessThreshold}`);
        this.emit('halfOpenTest', { success: true, consecutive: this.halfOpenSuccesses, threshold: this.config.halfOpenSuccessThreshold });

        // 连续成功达到阈值 → 渐进恢复
        if (this.halfOpenSuccesses >= this.config.halfOpenSuccessThreshold) {
          this._gradualRecover();
        }
      }
    }

    // 日亏损累计 — 只累计亏损（负 pnlPct），盈利不抵消
    if (tradeResult.pnlPct && tradeResult.pnlPct < 0) {
      this.dailyLossPct += tradeResult.pnlPct;
    }

    if (this.dailyLossPct <= -this.config.maxDailyLossPct) {
      this._trip('daily_loss_exceeded', `日亏损 ${(this.dailyLossPct * 100).toFixed(1)}% 超过上限 ${(this.config.maxDailyLossPct * 100).toFixed(0)}%`);
    }
  }

  /**
   * 渐进恢复：Level 逐步 +1，直到恢复到原始 Level
   */
  _gradualRecover() {
    const oldLevel = this.currentLevel;
    const newLevel = Math.min(this.currentLevel + 1, this.originalLevel);

    if (newLevel >= this.originalLevel) {
      // 完全恢复
      this.state = STATE.CLOSED;
      this.halfOpenTrades = 0;
      this.halfOpenSuccesses = 0;
      this.consecutiveLosses = 0;
      this.currentLevel = this.originalLevel;
      this.cooldownStart = null;
      this._log('circuit_recovered', `完全恢复到 Level ${this.originalLevel}`);
      this.emit('stateChange', { from: STATE.HALF_OPEN, to: STATE.CLOSED });
      this.emit('recover', { level: this.originalLevel, fullyRecovered: true });
    } else {
      // 部分恢复，仍留在 HALF_OPEN
      this.currentLevel = newLevel;
      this.halfOpenTrades = 0;
      this.halfOpenSuccesses = 0;
      this._log('gradual_recover', `部分恢复 Level ${oldLevel} → ${newLevel}，仍为试探态`);
      this.emit('levelChange', { from: oldLevel, to: newLevel });
      this.emit('recover', { level: newLevel, fullyRecovered: false });
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

    // 试探状态只允许当前 Level 的操作
    if (this.state === STATE.HALF_OPEN) {
      if (requiredLevel > this.currentLevel) {
        return { allowed: false, reason: `试探期，当前 Level ${this.currentLevel}，需要 Level ${requiredLevel}`, level: this.currentLevel };
      }
      if (this.halfOpenTrades >= this.config.halfOpenMaxTrades) {
        return { allowed: false, reason: '试探期交易次数已满', level: this.currentLevel };
      }
      this.halfOpenTrades++;
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
    const oldState = this.state;
    this.state = STATE.CLOSED;
    this.consecutiveLosses = 0;
    this.dailyLossPct = 0;
    this.cooldownStart = null;
    this.halfOpenTrades = 0;
    this.halfOpenSuccesses = 0;
    this._log('manual_reset', '人工重置熔断器');
    this.emit('stateChange', { from: oldState, to: STATE.CLOSED });
    this.emit('recover', { level: this.currentLevel, fullyRecovered: true });
  }

  /**
   * 获取当前状态
   */
  getStatus() {
    this._checkCooldown();
    return {
      state: this.state,
      level: this.currentLevel,
      originalLevel: this.originalLevel,
      dailyLossPct: this.dailyLossPct,
      consecutiveLosses: this.consecutiveLosses,
      cooldownRemaining: this._cooldownRemaining(),
      halfOpenSuccesses: this.halfOpenSuccesses,
      halfOpenSuccessThreshold: this.config.halfOpenSuccessThreshold,
      config: { ...this.config },
      history: this.history.slice(-20),
    };
  }

  // ── 内部方法 ──

  _trip(reason, detail) {
    const oldState = this.state;
    this.state = STATE.OPEN;
    this.cooldownStart = Date.now();
    this.halfOpenTrades = 0;
    this.halfOpenSuccesses = 0;

    // 记住原始等级（首次熔断时）
    if (oldState === STATE.CLOSED) {
      this.originalLevel = this.currentLevel;
    }

    // 降级
    if (this.currentLevel === 3) {
      this.currentLevel = 2;
    } else if (this.currentLevel === 2) {
      this.currentLevel = 1;
    }

    this._log('circuit_open', `${reason}: ${detail}`);
    this.emit('stateChange', { from: oldState, to: STATE.OPEN, reason, detail });
    this.emit('trip', { reason, detail, newLevel: this.currentLevel });

    // 启动自动状态检查
    this.startAutoCheck();
  }

  _checkCooldown() {
    if (this.state !== STATE.OPEN) return;
    if (!this.cooldownStart) return;

    const elapsed = Date.now() - this.cooldownStart;
    const cooldownMs = this.config.cooldownMinutes * 60 * 1000;

    if (elapsed >= cooldownMs) {
      const oldState = this.state;
      this.state = STATE.HALF_OPEN;
      this.halfOpenTrades = 0;
      this.halfOpenSuccesses = 0;
      this._log('circuit_half_open', '冷却期结束，进入试探状态');
      this.emit('stateChange', { from: STATE.OPEN, to: STATE.HALF_OPEN });
      this.emit('halfOpenTest', { success: null, message: '进入试探期' });
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

// ── 多账户隔离：Map<accountId, CircuitBreaker> ──

const _breakers = new Map();

function _getAccountId() {
  try {
    const acc = getAccount();
    return acc?.accountId || 'default';
  } catch {
    return 'default';
  }
}

/**
 * 获取指定账户的熔断器（按需创建）
 * @param {string} [accountId] - 不传则用当前账户
 */
function getBreakerForAccount(accountId) {
  const id = accountId || _getAccountId();
  if (!_breakers.has(id)) {
    const instance = new CircuitBreaker();
    instance.startAutoCheck();
    _breakers.set(id, instance);
  }
  return _breakers.get(id);
}

/**
 * 清除指定账户的熔断器（账户删除时调用）
 */
function removeBreakerForAccount(accountId) {
  const instance = _breakers.get(accountId);
  if (instance) instance.stopAutoCheck();
  _breakers.delete(accountId);
}

// 向后兼容：breaker 始终指向当前账户的实例
// 通过 Proxy 实现，所有属性访问和调用都代理到当前账户的 breaker
const breaker = new Proxy({}, {
  get(_target, prop, _receiver) {
    const instance = getBreakerForAccount();
    const value = instance[prop];
    if (typeof value === 'function') {
      return value.bind(instance);
    }
    return value;
  },
  set(_target, prop, value) {
    const instance = getBreakerForAccount();
    instance[prop] = value;
    return true;
  },
});

module.exports = { breaker, CircuitBreaker, STATE, getBreakerForAccount, removeBreakerForAccount };
