/**
 * Leomoney 常量定义
 */

export const 初始资金 = 1000000;

// 条件单状态
export const 订单状态 = {
  待触发: 'pending',
  已触发: 'executed',
  已取消: 'cancelled',
  已失效: 'expired',
};

// 订单状态中文映射
export const 订单状态文字 = {
  pending: '待触发',
  executed: '已触发',
  cancelled: '已取消',
  expired: '已失效',
};

// 市场分类
export const 市场分类列表 = ['all', 'astocks', 'hkstocks', 'usstocks', 'metals', 'crypto'];

// 市场分类中文映射
export const 市场分类文字 = {
  all: '全部',
  astocks: 'A股',
  hkstocks: '港股',
  usstocks: '美股',
  metals: '贵金属',
  crypto: '加密',
};

// 交易方向
export const 交易方向 = { 买入: 'buy', 卖出: 'sell' };

// 风险等级
export const 风险等级 = { 低: '低', 中: '中', 高: '高' };
