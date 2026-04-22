/**
 * Leomoney Frontend — 兼容壳（v1.5.0）
 * app.js 已退化为过渡薄入口，主逻辑已迁移至 main.js + features/
 * 保留此文件确保旧引用不报错，所有函数委托给新模块
 */

console.warn('[app.js] 此文件已弃用，请使用 main.js 作为入口');

// 如果 main.js 还没加载，自动跳转
if (!window.__leomoney_main_loaded) {
  const script = document.createElement('script');
  script.type = 'module';
  script.src = '/js/main.js';
  document.head.appendChild(script);
}
