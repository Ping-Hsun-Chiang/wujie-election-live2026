/*
 * 後台共用 UI：鍵盤友善的確認對話框與提示訊息
 * 不使用瀏覽器原生 alert/confirm，全程可用 Enter / Esc 操作。
 */
(function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var toastTimer = null;
  function toast(msg, type) {
    var el = document.getElementById('uiToast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'uiToast';
      el.className = 'ui-toast';
      el.setAttribute('role', 'status');
      document.body.appendChild(el);
    }
    el.className = 'ui-toast show t-' + (type || 'ok');
    el.innerHTML = msg;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.className = 'ui-toast t-' + (type || 'ok'); }, 2600);
  }

  var openCount = 0;

  /*
   * modal(opts) → Promise<{ ok: boolean, value: any }>
   * opts: title, body(html), confirmText, cancelText, danger, wide,
   *       requireText（需輸入完全相同文字才可確認）,
   *       onMount(bodyEl, ctl), onConfirm(bodyEl) → 回傳 false 則不關閉
   */
  function modal(opts) {
    return new Promise(function (resolve) {
      openCount++;
      var prevFocus = document.activeElement;
      var wrap = document.createElement('div');
      wrap.className = 'ui-modal-wrap';
      wrap.innerHTML = '' +
        '<div class="ui-modal' + (opts.danger ? ' is-danger' : '') + (opts.wide ? ' is-wide' : '') + '" role="dialog" aria-modal="true">' +
          '<h3>' + esc(opts.title || '請確認') + '</h3>' +
          '<div class="ui-modal-body">' + (opts.body || '') + '</div>' +
          (opts.requireText ? '<input class="ui-require" type="text" autocomplete="off" placeholder="請輸入「' + esc(opts.requireText) + '」">' : '') +
          '<div class="ui-modal-actions">' +
            (opts.hideCancel ? '' : '<button type="button" class="btn btn-ghost" data-act="cancel">' + esc(opts.cancelText || '返回修改') + ' <kbd>Esc</kbd></button>') +
            '<button type="button" class="btn ' + (opts.danger ? 'btn-danger' : 'btn-primary') + '" data-act="ok">' + esc(opts.confirmText || '確認') + ' <kbd>Enter</kbd></button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(wrap);

      var body = wrap.querySelector('.ui-modal-body');
      var okBtn = wrap.querySelector('[data-act="ok"]');
      var req = wrap.querySelector('.ui-require');
      var enabled = true;
      var ctl = {
        setConfirmEnabled: function (v) { enabled = !!v; okBtn.disabled = !enabled; }
      };

      if (req) {
        ctl.setConfirmEnabled(false);
        req.addEventListener('input', function () { ctl.setConfirmEnabled(req.value.trim() === opts.requireText); });
      }
      if (opts.onMount) opts.onMount(body, ctl);

      function close(ok) {
        var value;
        if (ok) {
          if (!enabled) return;
          if (opts.onConfirm) {
            value = opts.onConfirm(body);
            if (value === false) return;
          }
        }
        document.removeEventListener('keydown', onKey, true);
        wrap.remove();
        openCount--;
        if (!ok && prevFocus && prevFocus.focus) prevFocus.focus();
        resolve({ ok: ok, value: value });
      }

      function onKey(e) {
        if (e.repeat) return;
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(false); }
        else if (e.key === 'Enter' && !(e.target && e.target.tagName === 'TEXTAREA')) {
          e.preventDefault(); e.stopPropagation(); close(true);
        }
      }

      wrap.addEventListener('click', function (e) {
        var act = e.target.closest && e.target.closest('[data-act]');
        if (act) close(act.getAttribute('data-act') === 'ok');
      });

      // 延後掛載鍵盤監聽，避免觸發開窗的同一個 Enter 直接確認
      setTimeout(function () {
        document.addEventListener('keydown', onKey, true);
        var first = req || body.querySelector('textarea, input, select') || okBtn;
        first.focus();
      }, 0);
    });
  }

  function download(filename, content, mime) {
    var blob = new Blob([content], { type: mime || 'application/octet-stream' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  function stamp() {
    var d = new Date();
    var p = function (x) { return ('0' + x).slice(-2); };
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes());
  }

  window.UI = {
    esc: esc,
    toast: toast,
    modal: modal,
    download: download,
    stamp: stamp,
    isModalOpen: function () { return openCount > 0; }
  };
})();
