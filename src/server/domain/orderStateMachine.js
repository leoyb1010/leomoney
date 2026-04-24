/**
 * Leomoney 订单状态机
 * 集中定义状态、流转规则、过渡校验
 * 禁止在业务逻辑中随意赋值 order.status
 */

// ── 状态常量 ──

const ORDER_STATUS = {
  CREATED: 'CREATED',
  PENDING_TRIGGER: 'PENDING_TRIGGER',
  ACCEPTED: 'ACCEPTED',
  PARTIALLY_FILLED: 'PARTIALLY_FILLED',
  FILLED: 'FILLED',
  CANCEL_REQUESTED: 'CANCEL_REQUESTED',
  CANCELED: 'CANCELED',
  REJECTED: 'REJECTED',
  EXPIRED: 'EXPIRED',
  SETTLED: 'SETTLED',
  FAILED: 'FAILED',
};

// ── 合法流转表 ──

const TRANSITIONS = {
  [ORDER_STATUS.CREATED]: [
    ORDER_STATUS.PENDING_TRIGGER,
    ORDER_STATUS.ACCEPTED,
    ORDER_STATUS.REJECTED,
  ],
  [ORDER_STATUS.PENDING_TRIGGER]: [
    ORDER_STATUS.ACCEPTED,
    ORDER_STATUS.CANCELED,
    ORDER_STATUS.EXPIRED,
    ORDER_STATUS.REJECTED,
  ],
  [ORDER_STATUS.ACCEPTED]: [
    ORDER_STATUS.PARTIALLY_FILLED,
    ORDER_STATUS.FILLED,
    ORDER_STATUS.CANCEL_REQUESTED,
    ORDER_STATUS.CANCELED,
    ORDER_STATUS.REJECTED,
    ORDER_STATUS.FAILED,
  ],
  [ORDER_STATUS.PARTIALLY_FILLED]: [
    ORDER_STATUS.FILLED,
    ORDER_STATUS.CANCEL_REQUESTED,
    ORDER_STATUS.CANCELED,
    ORDER_STATUS.FAILED,
  ],
  [ORDER_STATUS.FILLED]: [
    ORDER_STATUS.SETTLED,
  ],
  [ORDER_STATUS.CANCEL_REQUESTED]: [
    ORDER_STATUS.CANCELED,
  ],
  // 终态不可流转
  [ORDER_STATUS.CANCELED]: [],
  [ORDER_STATUS.REJECTED]: [],
  [ORDER_STATUS.EXPIRED]: [],
  [ORDER_STATUS.SETTLED]: [],
  [ORDER_STATUS.FAILED]: [],
};

/**
 * 检查是否可以从 from 状态转换到 to 状态
 * @param {string} from - 当前状态
 * @param {string} to - 目标状态
 * @returns {boolean}
 */
function canTransition(from, to) {
  const allowed = TRANSITIONS[from];
  if (!allowed) return false;
  return allowed.includes(to);
}

/**
 * 执行状态流转
 * @param {Object} order - 订单对象
 * @param {string} to - 目标状态
 * @param {Object} [meta] - 可选元数据（原因、操作人等）
 * @returns {{ success: boolean, error?: string, from?: string, to?: string }}
 */
function transitionOrder(order, to, meta = {}) {
  if (!order || !order.status) {
    return { success: false, error: '订单或状态不存在' };
  }

  const from = order.status;

  if (from === to) {
    return { success: true, from, to }; // 幂等：相同状态不报错
  }

  if (!canTransition(from, to)) {
    return { success: false, error: `非法状态流转: ${from} → ${to}` };
  }

  order.status = to;
  order.updatedAt = new Date().toISOString();

  // 记录流转元数据
  if (meta.reason) order.transitionReason = meta.reason;
  if (meta.triggeredBy) order.triggeredBy = meta.triggeredBy;

  // 状态特定时间戳
  switch (to) {
    case ORDER_STATUS.ACCEPTED:
      if (!order.acceptedAt) order.acceptedAt = order.updatedAt;
      break;
    case ORDER_STATUS.PARTIALLY_FILLED:
      if (!order.partiallyFilledAt) order.partiallyFilledAt = order.updatedAt;
      break;
    case ORDER_STATUS.FILLED:
      order.filledAt = order.updatedAt;
      break;
    case ORDER_STATUS.CANCELED:
      order.canceledAt = order.updatedAt;
      break;
    case ORDER_STATUS.SETTLED:
      order.settledAt = order.updatedAt;
      break;
    case ORDER_STATUS.EXPIRED:
      order.expiredAt = order.updatedAt;
      break;
    case ORDER_STATUS.REJECTED:
      order.rejectedAt = order.updatedAt;
      if (meta.reason) order.rejectionReason = meta.reason;
      break;
    case ORDER_STATUS.FAILED:
      order.failedAt = order.updatedAt;
      if (meta.reason) order.failureReason = meta.reason;
      break;
  }

  return { success: true, from, to };
}

/**
 * 判断状态是否为终态
 */
function isTerminalStatus(status) {
  return [
    ORDER_STATUS.CANCELED,
    ORDER_STATUS.REJECTED,
    ORDER_STATUS.EXPIRED,
    ORDER_STATUS.SETTLED,
  ].includes(status);
}

/**
 * 判断订单是否仍在活跃状态（可执行/可撤单）
 */
function isActiveStatus(status) {
  return [
    ORDER_STATUS.CREATED,
    ORDER_STATUS.PENDING_TRIGGER,
    ORDER_STATUS.ACCEPTED,
    ORDER_STATUS.PARTIALLY_FILLED,
  ].includes(status);
}

/**
 * 兼容旧版状态映射
 * 旧版: pending / executed / cancelled / failed
 * 新版: 见 ORDER_STATUS
 */
function mapLegacyStatus(oldStatus) {
  const map = {
    pending: ORDER_STATUS.PENDING_TRIGGER,
    executed: ORDER_STATUS.SETTLED,
    cancelled: ORDER_STATUS.CANCELED,
    failed: ORDER_STATUS.FAILED,
  };
  return map[oldStatus] || oldStatus;
}

module.exports = {
  ORDER_STATUS,
  TRANSITIONS,
  canTransition,
  transitionOrder,
  isTerminalStatus,
  isActiveStatus,
  mapLegacyStatus,
};
