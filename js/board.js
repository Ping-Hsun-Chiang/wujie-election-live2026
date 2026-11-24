/*
 * 前台「投影戰情牆」
 * 16:9 滿版、深色高對比，專為服務處投影播放設計。
 */
(function () {
  'use strict';

  var E = window.ELECTION;
  var S = window.Store;
  var WEEK = ['日', '一', '二', '三', '四', '五', '六'];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ---------- 數字跳動動畫 ----------
  function animateNumber(el, to, opts) {
    opts = opts || {};
    var fmt = opts.fmt || S.fmt;
    var from = parseFloat(el.getAttribute('data-val'));
    if (!isFinite(from)) from = 0;
    el.setAttribute('data-val', to);
    if (el._raf) cancelAnimationFrame(el._raf);
    if (from === to) { el.textContent = fmt(to); return; }
    var dur = opts.duration || 900;
    var t0 = performance.now();
    function step(now) {
      var t = Math.min(1, (now - t0) / dur);
      var e = 1 - Math.pow(1 - t, 3);
      el.textContent = fmt(from + (to - from) * e);
      if (t < 1) el._raf = requestAnimationFrame(step);
    }
    el._raf = requestAnimationFrame(step);
    if (opts.flash) {
      el.classList.remove('flash');
      void el.offsetWidth;
      el.classList.add('flash');
    }
  }

  // ---------- 版面 ----------
  function template() {
    var focus = E.candidates.filter(function (c) { return c.no === E.focusNo; })[0];
    var rows = E.candidates.map(function (c) {
      return '' +
        '<div class="bd-row' + (c.focus ? ' is-focus' : '') + '" data-no="' + c.no + '" style="--c:' + c.color + ';--slot:' + (c.no - 1) + ';--below:' + (c.no - 1 >= E.seats ? 1 : 0) + '">' +
          '<div class="r-rank"><span class="num" data-k="rank">-</span></div>' +
          '<div class="r-badge num">' + c.no + '</div>' +
          '<div class="r-info">' +
            '<div class="r-name">' + esc(c.name) +
              '<span class="r-party">' + esc(c.party) + '</span>' +
            '</div>' +
            '<div class="r-bar"><i data-k="bar"></i></div>' +
          '</div>' +
          '<div class="r-votes num" data-k="votes" data-val="0">0</div>' +
          '<div class="r-pct num" data-k="pct" data-val="0">0.00%</div>' +
        '</div>';
    }).join('');

    return '' +
      '<div class="board" id="board">' +
        '<header class="bd-top">' +
          '<div class="bd-brand">' +
            '<div class="bd-live"><span></span>LIVE</div>' +
            '<div class="bd-titles">' +
              '<div class="bd-event">' + esc(E.eventName) + '・開票即時戰情</div>' +
              '<h1 class="bd-title">2026 宜蘭縣第 7 選舉區（五結鄉）縣議員<em>即時開票中心</em></h1>' +
            '</div>' +
          '</div>' +
          '<div class="bd-progress">' +
            '<div class="bd-progress-text">' +
              '已開完：<b class="num" id="bdDone">0</b> / ' + E.stationCodes.length + ' 所 <b class="num bd-pct" id="bdDonePct">(0.0%)</b>' +
            '</div>' +
            '<div class="bd-progress-row">' +
              '<div class="bd-progress-bar"><i class="p-done" id="bdBarDone"></i><i class="p-partial" id="bdBarPartial"></i></div>' +
              '<span class="bd-partial-tag">期中回報 <b class="num" id="bdPartial">0</b> 所</span>' +
            '</div>' +
          '</div>' +
          '<div class="bd-valid"><div class="lbl">累計有效票</div><div class="num val" id="bdValid" data-val="0">0</div></div>' +
          '<div class="bd-clock"><div class="num t" id="bdTime">--:--:--</div><div class="d" id="bdDate"></div></div>' +
        '</header>' +

        '<main class="bd-main">' +
          '<section class="bd-hero" id="bdHero" style="--c:' + focus.color + '">' +
            '<div class="hero-ribbon">★ 本陣營候選人</div>' +
            '<div class="hero-id">' +
              '<div class="hero-badge num">' + focus.no + '</div>' +
              '<div class="hero-name">' +
                '<div class="n">' + esc(focus.name) + '</div>' +
                '<div class="p">' + esc(focus.party) + '・' + focus.no + ' 號</div>' +
              '</div>' +
              '<div class="hero-rank"><div class="lbl">目前排名</div><div class="v">第 <b class="num" id="heroRank">-</b> 名</div></div>' +
            '</div>' +
            '<div class="hero-votes">' +
              '<div class="lbl">累計得票</div>' +
              '<div class="v num" id="heroVotes" data-val="0">0</div>' +
              '<div class="pct">得票率 <b class="num" id="heroPct" data-val="0">0.00%</b></div>' +
            '</div>' +
            '<div class="hero-gap" id="heroGap" data-state="waiting">' +
              '<div class="g-lbl" id="heroGapLbl">等待開票中</div>' +
              '<div class="g-val num" id="heroGapVal"></div>' +
            '</div>' +
          '</section>' +

          '<section class="bd-race">' +
            '<div class="race-head">' +
              '<h2>全選區即時排名</h2>' +
              '<span class="race-seats">應選 <b class="num">' + E.seats + '</b> 席・' + E.candidates.length + ' 人參選</span>' +
            '</div>' +
            '<div class="race-rows" id="raceRows">' +
              rows +
              '<div class="threshold"><span>▲ 以上為當選安全名單（應選 ' + E.seats + ' 席）▲</span></div>' +
            '</div>' +
          '</section>' +
        '</main>' +

        '<footer class="bd-ticker">' +
          '<div class="tk-label"><b>最新<br>開票快訊</b></div>' +
          '<div class="tk-list" id="tkList"></div>' +
        '</footer>' +

        '<button class="bd-admin-link" id="bdAdminLink" type="button" title="於新視窗開啟計票後台（按 F 切換全螢幕）">開啟計票後台視窗 ↗</button>' +
      '</div>';
  }

  // ---------- 繪製 ----------
  function render(root, st, isFirst) {
    var c = S.compute(st);

    // 頂部
    var q = function (id) { return root.querySelector('#' + id); };
    q('bdDone').textContent = c.done;
    q('bdDonePct').textContent = '(' + c.donePct.toFixed(1) + '%)';
    q('bdPartial').textContent = c.partial;
    q('bdBarDone').style.width = (c.done / c.total * 100) + '%';
    q('bdBarPartial').style.width = (c.partial / c.total * 100) + '%';
    animateNumber(q('bdValid'), c.valid);

    // 戰報卡
    var gap = S.focusGap(c);
    var me = c.byNo[E.focusNo];
    q('heroRank').textContent = c.valid ? me.rank : '-';
    animateNumber(q('heroVotes'), me.votes, { flash: !isFirst, duration: 1100 });
    animateNumber(q('heroPct'), me.pct, { fmt: S.pct });
    var gapEl = q('heroGap');
    gapEl.setAttribute('data-state', gap.state);
    q('bdHero').setAttribute('data-state', gap.state);
    if (gap.state === 'waiting') {
      q('heroGapLbl').textContent = '等待開票中・票數即時更新';
      q('heroGapVal').textContent = '';
    } else if (gap.state === 'safe') {
      // 當選安全範圍內不顯示差距提示（卡片樣式由 data-state 隱藏）
      q('heroGapLbl').textContent = '';
      q('heroGapVal').textContent = '';
      q('heroGapVal').setAttribute('data-val', 0);
    } else {
      q('heroGapLbl').textContent = '距離第 ' + E.seats + ' 名（當選門檻）尚差';
      animateNumber(q('heroGapVal'), gap.diff, { fmt: function (v) { return '−' + S.fmt(v) + ' 票'; } });
    }

    // 排名列
    var max = c.sorted[0].votes || 1;
    c.sorted.forEach(function (r) {
      var row = root.querySelector('.bd-row[data-no="' + r.cand.no + '"]');
      row.style.setProperty('--slot', r.pos);
      row.style.setProperty('--below', r.pos >= E.seats ? 1 : 0);
      row.classList.toggle('is-in', r.pos < E.seats && c.valid > 0);
      row.querySelector('[data-k="rank"]').textContent = c.valid ? r.rank : '-';
      row.querySelector('[data-k="bar"]').style.width = (c.valid ? r.votes / max * 100 : 0) + '%';
      animateNumber(row.querySelector('[data-k="votes"]'), r.votes);
      animateNumber(row.querySelector('[data-k="pct"]'), r.pct, { fmt: S.pct });
    });

    renderTicker(q('tkList'), st);
  }

  function renderTicker(list, st) {
    var items = S.recent(3, st);
    if (!items.length) {
      list.innerHTML = '<div class="tk-empty">尚無投開票所回報，開票後將即時顯示最新 3 所結果</div>';
      return;
    }
    var prevKeys = list._keys || {};
    var keys = {};
    list.innerHTML = items.map(function (l) {
      var s = st.stations[l.code];
      var key = l.code + '@' + l.ts;
      keys[key] = 1;
      var fresh = list._keys && !prevKeys[key];
      var cells = E.candidates.map(function (cand, i) {
        return '<div class="tk-c' + (cand.focus ? ' is-focus' : '') + '" style="--c:' + cand.color + '">' +
          '<span class="no num">' + cand.no + '</span>' +
          '<span class="nm">' + esc(cand.name) + '</span>' +
          '<b class="num">' + S.fmt(s.votes ? s.votes[i] : 0) + '</b></div>';
      }).join('');
      return '<article class="tk-item' + (fresh ? ' is-new' : '') + '">' +
        '<header>' +
          '<span class="tk-code num">' + l.code + '</span>' +
          '<span class="tk-name">' + esc(S.stationLabel(l.code, s)) + '</span>' +
          '<span class="tk-status s-' + s.status + '">' + (s.status === 'done' ? '已開完' : '期中') + '</span>' +
          '<span class="tk-time num">' + S.time(s.updatedAt || l.ts, false) + '</span>' +
        '</header>' +
        '<div class="tk-cells">' + cells + '</div>' +
      '</article>';
    }).join('');
    list._keys = keys;
  }

  // ---------- 時鐘 ----------
  function tickClock(root) {
    var d = new Date();
    var p = function (x) { return ('0' + x).slice(-2); };
    root.querySelector('#bdTime').textContent = p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
    root.querySelector('#bdDate').textContent = '民國 ' + (d.getFullYear() - 1911) + ' 年 ' + (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日（' + WEEK[d.getDay()] + '）';
  }

  // ---------- 全螢幕與後台捷徑 ----------
  function isFullscreen() {
    if (document.fullscreenElement || document.webkitFullscreenElement) return true;
    if (window.matchMedia && window.matchMedia('(display-mode: fullscreen)').matches) return true;
    return window.innerHeight >= screen.height - 2 && window.innerWidth >= screen.width - 2; // F11
  }

  function toggleFullscreen() {
    var el = document.documentElement;
    if (document.fullscreenElement) document.exitFullscreen();
    else if (el.requestFullscreen) el.requestFullscreen().catch(function () {});
  }

  function openAdmin() {
    var url = window.location.pathname + '?mode=admin';
    var w = window.open(url, 'wujie7-admin');
    if (w) w.focus();
  }

  function mount(root) {
    document.body.classList.add('is-board');
    root.innerHTML = template();
    var board = root.querySelector('#board');

    render(root, S.get(), true);
    S.subscribe(function (st) { render(root, st, false); });

    // 回應後台的連線偵測
    var myId = Math.random().toString(36).slice(2, 8);
    S.onMessage(function (m) { if (m.type === 'ping') S.post({ type: 'pong', id: myId, from: m.id }); });

    tickClock(root);
    setInterval(function () { tickClock(root); }, 1000);

    var link = root.querySelector('#bdAdminLink');
    link.addEventListener('click', openAdmin);
    function syncFs() { board.classList.toggle('is-fullscreen', isFullscreen()); }
    ['resize', 'fullscreenchange', 'webkitfullscreenchange'].forEach(function (ev) {
      (ev === 'resize' ? window : document).addEventListener(ev, syncFs);
    });
    syncFs();

    document.addEventListener('keydown', function (e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'f' || e.key === 'F') toggleFullscreen();
      if (e.key === 'a' || e.key === 'A') openAdmin();
    });
    board.addEventListener('dblclick', toggleFullscreen);

    // 閒置 3 秒自動隱藏滑鼠游標
    var idleTimer = null;
    function wake() {
      board.classList.remove('is-idle');
      clearTimeout(idleTimer);
      idleTimer = setTimeout(function () { board.classList.add('is-idle'); }, 3000);
    }
    document.addEventListener('mousemove', wake);
    wake();
  }

  window.BoardView = { mount: mount };
})();
