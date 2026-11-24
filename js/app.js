/*
 * 頁面模式路由（GitHub Pages 友善）
 * - 預設：投影戰情牆（index.html）
 * - 後台：index.html?mode=admin 或 index.html#/admin
 * 不使用 History Path 路由，避免重新整理時 404。
 */
(function () {
  'use strict';

  function getMode() {
    var q = new URLSearchParams(window.location.search).get('mode');
    if (q) return q === 'admin' ? 'admin' : 'board';
    var h = window.location.hash.replace(/^#\/?/, '').split(/[?&]/)[0];
    return h === 'admin' ? 'admin' : 'board';
  }

  function boot() {
    var mode = getMode();
    var root = document.getElementById('app');
    document.body.setAttribute('data-mode', mode);
    root.innerHTML = '';

    if (mode === 'admin' && window.AdminView) {
      document.title = '計票後台｜五結鄉縣議員即時開票';
      window.AdminView.mount(root);
    } else if (window.BoardView) {
      window.BoardView.mount(root);
    } else {
      root.innerHTML = '<div class="boot-msg">系統載入中…</div>';
    }
  }

  // Hash 切換模式時重新載入，確保各畫面計時器乾淨重建
  var bootMode = null;
  window.addEventListener('hashchange', function () {
    if (getMode() !== bootMode) window.location.reload();
  });

  document.addEventListener('DOMContentLoaded', function () {
    bootMode = getMode();
    boot();
  });

  // 離線快取（僅 https 或 localhost；file:// 直接開啟時略過）
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () { /* 離線快取失敗不影響主功能 */ });
    });
  }

  window.App = { getMode: getMode };
})();
