/**
 * Leomoney 账户摘要展示层
 * 统一账户数据的渲染逻辑
 */

import { 格式化货币, 格式化带符号货币, 格式化百分比 } from '../utils/format.js';

/**
 * 渲染账户摘要卡片
 * @param {Object} summary - /api/account/summary 返回的数据
 * @returns {string} HTML
 */
export function 渲染账户摘要(summary) {
  const { cash, totalAssets, holdingValue, totalUnrealizedPnL, todayRealizedPnL, holdingCount } = summary;

  return `
    <div class="summary-card" data-testid="metric-total-assets" data-role="account-metric" data-metric="total-assets">
      <div class="summary-label">总资产</div>
      <div class="summary-value">${格式化货币(totalAssets)}</div>
    </div>
    <div class="summary-card" data-testid="metric-cash" data-role="account-metric" data-metric="cash">
      <div class="summary-label">可用资金</div>
      <div class="summary-value" style="color:var(--颜色-买入)">${格式化货币(cash)}</div>
    </div>
    <div class="summary-card" data-testid="metric-market-value" data-role="account-metric" data-metric="market-value">
      <div class="summary-label">持仓市值</div>
      <div class="summary-value" style="color:var(--颜色-信息)">${格式化货币(holdingValue)}</div>
    </div>
    <div class="summary-card" data-testid="metric-unrealized-pnl" data-role="account-metric" data-metric="unrealized-pnl">
      <div class="summary-label">未实现盈亏</div>
      <div class="summary-value" style="color:${totalUnrealizedPnL >= 0 ? 'var(--颜色-买入)' : 'var(--颜色-卖出)'}">
        ${格式化带符号货币(totalUnrealizedPnL)}
      </div>
    </div>
    <div class="summary-card" data-testid="metric-today-pnl" data-role="account-metric" data-metric="today-pnl">
      <div class="summary-label">今日收益</div>
      <div class="summary-value" style="color:${todayRealizedPnL >= 0 ? 'var(--颜色-买入)' : 'var(--颜色-卖出)'}">
        ${格式化带符号货币(todayRealizedPnL)}
      </div>
    </div>
    <div class="summary-card" data-testid="metric-holding-count" data-role="account-metric" data-metric="holding-count">
      <div class="summary-label">持仓数量</div>
      <div class="summary-value">${holdingCount} 只</div>
    </div>`;
}

/**
 * 渲染持仓项
 * @param {Object} holding - 计算后的持仓指标
 * @returns {string} HTML
 */
export function 渲染持仓项(holding) {
  const { symbol, name, quantity, avgCost, price, marketValue, unrealizedPnL, unrealizedPnLRatio, isUp } = holding;
  return `<div class="holding-card" data-testid="holding-item" data-role="holding-item" data-symbol="${symbol}" onclick="jumpToStock('${symbol}')">
    <div class="holding-left">
      <div class="holding-name">${name || symbol} (${symbol})</div>
      <div class="holding-detail">${quantity.toLocaleString()}股 · 成本 ${avgCost.toFixed(2)} · 现价 ${price.toFixed(2)}</div>
      <div class="holding-detail">市值 ${格式化货币(marketValue)}</div>
    </div>
    <div class="holding-right">
      <div class="holding-pnl ${isUp ? 'up' : 'down'}">${isUp ? '+' : ''}${unrealizedPnL.toFixed(2)}</div>
      <div class="holding-pct ${isUp ? 'up' : 'down'}">${isUp ? '+' : ''}${unrealizedPnLRatio.toFixed(2)}%</div>
      <div style="font-size:var(--字号-极小);color:var(--文字-弱);margin-top:2px">${isUp ? '上涨' : '下跌'}</div>
    </div>
  </div>`;
}
