/**
 * Leomoney 全局状态仓库
 * 集中管理应用状态，替代散落的全局变量
 */

const store = {
  市场状态: { isOpen: false, status: '检测中' },
  行情数据: { indices: [], astocks: [], hkstocks: [], usstocks: [], metals: [], crypto: [], ts: 0 },
  账户数据: { balance: 1000000, holdings: {}, history: [], pendingOrders: [] },
  分析数据: null,
  当前视图: 'quotes',
  当前市场分类: 'all',
  选中股票: null,
  选中指数: null,
  交易方向: 'buy',
  K线周期: 5,
  K线数据: {},
  搜索过滤: '',
  搜索结果: [],
  系统特性: {
    启用新账户摘要: true,
    启用新交易面板: true,
    启用复盘解释层: true,
    启用安全操作模式: true,
  },
};

export default store;
