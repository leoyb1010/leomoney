/**
 * Leomoney SSE 实时推送服务 v3
 * 支持：行情更新、Agent信号、交易通知、熔断器状态变更
 * 
 * 频道：
 *   quotes   — 行情数据（8秒轮询推送到前端）
 *   agent    — Agent信号/方案/日志
 *   trade    — 交易执行通知
 *   system   — 熔断器/风控/系统消息
 */

const { getQuotes } = require('./quotes');
const { getDecisionLog } = require('./scheduler');
const { breaker } = require('./agent/circuitBreaker');
const { riskManager } = require('./agent/riskManager');

class SSEService {
  constructor() {
    this.clients = new Map(); // clientId → { res, channels: Set }
    this._clientIdCounter = 0;
    this._quoteInterval = null;
    this._systemInterval = null;
  }

  /**
   * 添加 SSE 客户端
   * @param {http.ServerResponse} res - Express response 对象
   * @param {string[]} channels - 订阅的频道
   * @returns {string} clientId
   */
  addClient(res, channels = ['quotes', 'agent', 'trade', 'system']) {
    const clientId = `sse_${++this._clientIdCounter}_${Date.now()}`;
    
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Nginx 兼容
    });

    const client = { res, channels: new Set(channels), createdAt: Date.now() };
    this.clients.set(clientId, client);

    // 发送初始连接确认
    this._send(client, 'connected', { clientId, channels });

    // 心跳
    client.heartbeat = setInterval(() => {
      try {
        res.write(':heartbeat\n\n');
      } catch {
        this.removeClient(clientId);
      }
    }, 30000);

    // 客户端断开
    res.on('close', () => {
      this.removeClient(clientId);
    });

    console.log(`[SSE] 客户端连接: ${clientId}，频道: ${channels.join(',')}`);
    return clientId;
  }

  /**
   * 移除 SSE 客户端
   */
  removeClient(clientId) {
    const client = this.clients.get(clientId);
    if (client) {
      if (client.heartbeat) clearInterval(client.heartbeat);
      try { client.res.end(); } catch {}
      this.clients.delete(clientId);
      console.log(`[SSE] 客户端断开: ${clientId}`);
    }
  }

  /**
   * 向指定频道广播消息
   */
  broadcast(channel, event, data) {
    const message = { channel, event, data, ts: Date.now() };
    let sentCount = 0;
    for (const [, client] of this.clients) {
      if (client.channels.has(channel)) {
        this._send(client, event, message);
        sentCount++;
      }
    }
    return sentCount;
  }

  /**
   * 启动行情推送（8秒间隔）
   */
  startQuotePush() {
    if (this._quoteInterval) return;
    this._quoteInterval = setInterval(async () => {
      if (this.clients.size === 0) return;
      try {
        const quotes = await getQuotes();
        this.broadcast('quotes', 'update', quotes);
      } catch (err) {
        // 静默失败
      }
    }, 8000);
    console.log('[SSE] 行情推送已启动（8秒）');
  }

  /**
   * 启动系统状态推送（30秒间隔）
   */
  startSystemPush() {
    if (this._systemInterval) return;
    this._systemInterval = setInterval(() => {
      if (this.clients.size === 0) return;
      try {
        this.broadcast('system', 'status', {
          breaker: breaker.getStatus(),
          risk: riskManager.getStatus(),
          connections: this.clients.size,
        });
      } catch {
        // 静默
      }
    }, 30000);
    console.log('[SSE] 系统状态推送已启动（30秒）');
  }

  /**
   * 启动所有推送
   */
  startAll() {
    this.startQuotePush();
    this.startSystemPush();

    // 监听熔断器事件
    breaker.on('stateChange', (data) => {
      this.broadcast('system', 'breaker_state', data);
    });
    breaker.on('trip', (data) => {
      this.broadcast('system', 'breaker_trip', data);
    });
    breaker.on('recover', (data) => {
      this.broadcast('system', 'breaker_recover', data);
    });
  }

  /**
   * 停止所有推送
   */
  stopAll() {
    if (this._quoteInterval) { clearInterval(this._quoteInterval); this._quoteInterval = null; }
    if (this._systemInterval) { clearInterval(this._systemInterval); this._systemInterval = null; }
    // 关闭所有客户端
    for (const clientId of this.clients.keys()) {
      this.removeClient(clientId);
    }
  }

  /**
   * 获取状态
   */
  getStatus() {
    return {
      connections: this.clients.size,
      clients: [...this.clients.entries()].map(([id, c]) => ({
        id,
        channels: [...c.channels],
        uptime: Date.now() - c.createdAt,
      })),
    };
  }

  /**
   * 发送 SSE 事件
   */
  _send(client, event, data) {
    try {
      client.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch {
      // 发送失败，静默移除
      // 客户端断开时会被 close 事件处理
    }
  }
}

// 单例
const sseService = new SSEService();

module.exports = { sseService, SSEService };
