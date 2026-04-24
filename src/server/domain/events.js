/**
 * Leomoney 事件流定义
 * 所有关键业务动作记录为结构化事件，支持回放和追踪
 */

const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');

const EVENT_TYPES = {
  ORDER_CREATED: 'ORDER_CREATED',
  ORDER_TRIGGERED: 'ORDER_TRIGGERED',
  ORDER_PARTIALLY_FILLED: 'ORDER_PARTIALLY_FILLED',
  ORDER_FILLED: 'ORDER_FILLED',
  ORDER_CANCELED: 'ORDER_CANCELED',
  ORDER_EXPIRED: 'ORDER_EXPIRED',
  FILL_SETTLED: 'FILL_SETTLED',
  CASH_FROZEN: 'CASH_FROZEN',
  CASH_RELEASED: 'CASH_RELEASED',
  POSITION_FROZEN: 'POSITION_FROZEN',
  POSITION_RELEASED: 'POSITION_RELEASED',
  AGENT_DECISION_RECORDED: 'AGENT_DECISION_RECORDED',
  RISK_REJECTED: 'RISK_REJECTED',
  CIRCUIT_TRIPPED: 'CIRCUIT_TRIPPED',
  CIRCUIT_RESET: 'CIRCUIT_RESET',
};

class DomainEventBus extends EventEmitter {
  constructor() {
    super();
    this.events = [];
    this.maxMemoryEvents = 1000;
    this.persistDir = path.join(__dirname, '../../../data/events');
    this._ensureDir();
  }

  _ensureDir() {
    if (!fs.existsSync(this.persistDir)) {
      fs.mkdirSync(this.persistDir, { recursive: true });
    }
  }

  emit(eventName, payload) {
    const event = {
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: eventName,
      payload,
      timestamp: new Date().toISOString(),
    };

    // 内存缓存
    this.events.unshift(event);
    if (this.events.length > this.maxMemoryEvents) {
      this.events.length = this.maxMemoryEvents;
    }

    // 文件持久化（异步）
    const filePath = path.join(this.persistDir, `${event.id}.json`);
    fs.writeFile(filePath, JSON.stringify(event, null, 2), () => {});

    super.emit(eventName, event);
    super.emit('*', event);
    return true;
  }

  getEvents(filter = {}) {
    let result = [...this.events];
    if (filter.type) result = result.filter(e => e.type === filter.type);
    if (filter.symbol) result = result.filter(e => e.payload?.symbol === filter.symbol);
    if (filter.accountId) result = result.filter(e => e.payload?.accountId === filter.accountId);
    if (filter.since) result = result.filter(e => e.timestamp >= filter.since);
    return result;
  }

  getEventById(id) {
    return this.events.find(e => e.id === id);
  }

  // 按订单 ID 追踪完整生命周期
  traceOrderLifecycle(orderId) {
    return this.events.filter(e =>
      e.payload?.orderId === orderId ||
      e.payload?.id === orderId
    ).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }
}

const eventBus = new DomainEventBus();

module.exports = { eventBus, DomainEventBus, EVENT_TYPES };
