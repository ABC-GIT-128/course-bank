/* PWA：注册 Service Worker + 「装到桌面」提示
 * 不影响任何刷题逻辑，注册失败也只是少个离线能力。
 */
(function () {
  /* ---------- 注册 Service Worker ---------- */
  if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () { /* 静默失败 */ });
    });

    /* 新版本接管时自动刷新一次，避免「明明更新了却还看到旧内容」
     * 用 sessionStorage 防抖，避免刷新循环 */
    var reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (reloading) return;
      if (sessionStorage.getItem('oc_sw_reloaded') === '1') return;
      reloading = true;
      sessionStorage.setItem('oc_sw_reloaded', '1');
      location.reload();
    });
  }

  /* ---------- 安装提示（仅 Android Chrome 等支持 beforeinstallprompt 的浏览器） ---------- */
  var deferred = null;
  var KEY = 'oc_install_dismissed';

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferred = e;
    if (localStorage.getItem(KEY)) return;
    showChip();
  });

  function showChip() {
    if (document.getElementById('instChip')) return;
    var el = document.createElement('div');
    el.id = 'instChip';
    el.innerHTML = '<span>装到桌面，像 App 一样打开</span>' +
      '<button type="button" data-act="go">安装</button>' +
      '<button type="button" data-act="no" aria-label="以后再说">×</button>';
    document.body.appendChild(el);

    el.addEventListener('click', function (ev) {
      var act = ev.target.getAttribute('data-act');
      if (act === 'go' && deferred) {
        deferred.prompt();
        deferred.userChoice.then(function () { el.remove(); deferred = null; });
      } else if (act === 'no') {
        localStorage.setItem(KEY, '1');
        el.remove();
      }
    });
  }

  /* 已经从桌面图标打开了，就别再提示 */
  if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) {
    try { localStorage.setItem(KEY, '1'); } catch (e) {}
  }
})();
