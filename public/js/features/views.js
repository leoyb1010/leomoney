/**
 * Leomoney 视图切换模块
 */
import { store } from './store.js';

export function switchView(view) {
  store.currentView = view;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const target = document.getElementById('view-' + view);
  if (target) target.classList.add('active');
  document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
  const item = document.querySelector(`.sidebar-item[data-view="${view}"]`);
  if (item) item.classList.add('active');
}

export function setMarketCategory(cat) {
  store.currentMarketCat = cat;
  document.querySelectorAll('.market-tab').forEach(t => t.classList.remove('active'));
  const tab = document.querySelector(`.market-tab[data-cat="${cat}"]`);
  if (tab) tab.classList.add('active');
  store.searchFilter = '';
  store.searchResults = [];
  const input = document.querySelector('.search-input');
  if (input) input.value = '';
}

export function setListMode(mode) {
  store.currentListMode = mode;
  document.querySelectorAll('.list-mode-tab').forEach(t => t.classList.remove('active'));
  const tab = document.querySelector(`.list-mode-tab[data-mode="${mode}"]`);
  if (tab) tab.classList.add('active');
  store.searchFilter = '';
  store.searchResults = [];
  const input = document.querySelector('.search-input');
  if (input) input.value = '';
}
