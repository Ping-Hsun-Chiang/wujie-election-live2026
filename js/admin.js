/*
 * 後台「單人極速計票台」
 * 純鍵盤輸入流：編號 → Enter → 1~4 號票數（Enter 跳下一格）→ 4 號 Enter 送出 → 回到編號框
 */
(function () {
  'use strict';

  var E = window.ELECTION;
  var S = window.Store;
  var esc = window.UI.esc;
  var N = E.candidates.length;
  var STATUS_TEXT = { none: '未回報', partial: '期中回報', done: '已開完' };

  var root, els = {};
  var current = null;          // 目前鎖定的投開票所編號
  var entryStatus = 'done';    // 本次送出狀態

  // ---------- 版面 ----------
  function template() {
    var voteRows = E.candidates.map(function (c, i) {
      return '' +
        '<label class="v-row' + (c.focus ? ' is-focus' : '') + '" style="--c:' + c.color + '">' +
          '<span class="v-badge num">' + c.no + '</span>' +
          '<span class="v-name"><b>' + esc(c.name) + '</b><small>' + esc(c.party) + (c.focus ? '・★ 本陣營' : '') + '</small></span>' +
          '<input class="v-input num" data-idx="' + i + '" type="text" inputmode="numeric" pattern="[0-9]*" enterkeyhint="' + (i === N - 1 ? 'send' : 'next') + '" autocomplete="off" maxlength="5" placeholder="0" disabled>' +
          '<span class="v-prev num" data-prev="' + i + '"></span>' +
        '</label>';
    }).join('');

    var cells = E.stationCodes.map(function (code) {
      return '<button type="button" class="g-cell" data-code="' + code + '">' +
        '<b class="num">' + code + '</b><small></small></button>';
    }).join('');

    return '' +
      '<div class="adm">' +
        '<header class="adm-top">' +
          '<div class="adm-title"><b>單人極速計票台</b><span>' + esc(E.districtName) + '</span></div>' +
          '<button type="button" class="adm-sync" id="admSync" data-state="local" title="同步設定"><i></i><span>偵測同步狀態中…</span></button>' +
          '<div class="adm-actions">' +
            '<button type="button" class="btn btn-ghost" id="btnUndo" title="還原上一筆操作（Alt+Z）">↶ 還原上一筆 <kbd>Alt+Z</kbd></button>' +
            '<button type="button" class="btn btn-ghost" id="btnOpenBoard">開啟投影戰情牆 ↗</button>' +
          '</div>' +
        '</header>' +

        '<main class="adm-main">' +
          '<section class="adm-col adm-entry">' +
            '<div class="card entry" id="entryCard">' +
              '<div class="code-box">' +
                '<label for="codeInput">投開票所編號 <small>輸入後 2 碼（57～95）或完整 4 碼，按 <kbd>Enter</kbd></small></label>' +
                '<div class="code-row">' +
                  '<input id="codeInput" class="num" type="text" inputmode="numeric" pattern="[0-9]*" enterkeyhint="next" autocomplete="off" maxlength="4" placeholder="57" autofocus>' +
                  '<div class="station-info" id="stationInfo"><div class="si-empty">尚未鎖定投開票所</div></div>' +
                '</div>' +
              '</div>' +

              '<div class="status-row">' +
                '<span class="lbl">本次回報狀態</span>' +
                '<div class="seg" id="statusSeg">' +
                  '<button type="button" data-status="done" class="on">已開完<small>計入完成率</small></button>' +
                  '<button type="button" data-status="partial">期中回報<small>可隨時覆蓋</small></button>' +
                '</div>' +
                '<span class="hint">票數欄按 <kbd>-</kbd> 切換</span>' +
              '</div>' +

              '<div class="votes" id="voteRows">' + voteRows + '</div>' +

              '<div class="entry-foot">' +
                '<div class="sum">本所合計 <b class="num" id="entrySum">0</b> 票</div>' +
                '<button type="button" class="btn btn-ghost btn-sm" id="btnResetStation" disabled>清除本所回報</button>' +
                '<button type="button" class="btn btn-primary btn-lg" id="btnSubmit" disabled>送出並同步投影牆 <kbd>Enter</kbd></button>' +
              '</div>' +
              '<div class="keys">' +
                '<span><kbd>Enter</kbd> 下一格／送出</span><span><kbd>↑</kbd><kbd>↓</kbd> 上下格</span>' +
                '<span><kbd>-</kbd> 切換狀態</span><span><kbd>Esc</kbd> 回編號框</span><span><kbd>Alt+Z</kbd> 還原</span>' +
              '</div>' +
            '</div>' +

            '<div class="adm-pair">' +
              '<div class="card mini" id="miniRank"></div>' +
              '<div class="card oplog"><h4>最近操作紀錄</h4><ol id="opLog"></ol></div>' +
            '</div>' +
          '</section>' +

          '<aside class="adm-col adm-side">' +
            '<div class="card grid-card">' +
              '<div class="grid-head">' +
                '<h4>39 所狀態總覽</h4>' +
                '<div class="legend" id="gridLegend"></div>' +
              '</div>' +
              '<div class="grid" id="stationGrid">' + cells + '</div>' +
            '</div>' +
            '<div class="card tools" id="toolsCard"></div>' +
          '</aside>' +
        '</main>' +
      '</div>';
  }

  // ---------- 輸入流程 ----------
  function voteInputs() { return Array.prototype.slice.call(root.querySelectorAll('.v-input')); }

  function setStatus(s) {
    entryStatus = s;
    Array.prototype.forEach.call(els.statusSeg.querySelectorAll('button'), function (b) {
      b.classList.toggle('on', b.getAttribute('data-status') === s);
    });
    els.entryCard.setAttribute('data-status', s);
  }

  function updateSum() {
    var sum = voteInputs().reduce(function (a, i) { return a + S.toInt(i.value); }, 0);
    els.entrySum.textContent = S.fmt(sum);
  }

  function renderStationInfo() {
    if (!current) {
      els.stationInfo.innerHTML = '<div class="si-empty">尚未鎖定投開票所</div>';
      return;
    }
    var st = S.get().stations[current];
    var opts = '<option value="">（未標註村別）</option>' + E.villages.map(function (v) {
      return '<option' + (v === st.village ? ' selected' : '') + '>' + v + '</option>';
    }).join('');
    els.stationInfo.innerHTML = '' +
      '<div class="si-main">' +
        '<span class="si-code num">' + current + '</span>' +
        '<span class="si-name">' + esc(S.stationLabel(current, st)) + '</span>' +
        '<span class="si-status s-' + st.status + '">' + STATUS_TEXT[st.status] + (st.updatedAt ? '・' + S.time(st.updatedAt, false) : '') + '</span>' +
      '</div>' +
      '<div class="si-edit">' +
        '<select id="siVillage" tabindex="-1" title="標註村別">' + opts + '</select>' +
        '<input id="siLocation" tabindex="-1" type="text" placeholder="投開票所地點（選填）" value="' + esc(st.location) + '">' +
      '</div>';

    var sel = els.stationInfo.querySelector('#siVillage');
    var loc = els.stationInfo.querySelector('#siLocation');
    function saveMeta() {
      var code = current;
      var v = sel.value, l = loc.value.trim();
      var cur = S.get().stations[code];
      if (cur.village === v && cur.location === l) return;
      S.mutate(code + ' 修改村別／地點', function (d) { d.stations[code].village = v; d.stations[code].location = l; });
      window.UI.toast(code + ' 標註已更新：' + esc(S.stationLabel(code)));
    }
    sel.addEventListener('change', saveMeta);
    loc.addEventListener('change', saveMeta);
    loc.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); loc.blur(); focusVote(0); }
    });
  }

  function fillPrev() {
    var st = current ? S.get().stations[current] : null;
    root.querySelectorAll('.v-prev').forEach(function (el, i) {
      el.textContent = st && st.votes ? '已存 ' + S.fmt(st.votes[i]) : '';
    });
  }

  function loadStation(code) {
    current = code;
    var st = S.get().stations[code];
    voteInputs().forEach(function (inp, i) {
      inp.disabled = false;
      inp.value = st.votes ? String(st.votes[i]) : '';
    });
    setStatus(st.status === 'partial' ? 'partial' : 'done');
    els.codeInput.value = code;
    els.btnSubmit.disabled = false;
    els.btnResetStation.disabled = st.status === 'none';
    els.entryCard.classList.add('is-locked');
    renderStationInfo();
    fillPrev();
    updateSum();
    renderGrid();
  }

  function clearEntry() {
    current = null;
    voteInputs().forEach(function (inp) { inp.value = ''; inp.disabled = true; });
    els.btnSubmit.disabled = true;
    els.btnResetStation.disabled = true;
    els.entryCard.classList.remove('is-locked');
    setStatus('done');
    renderStationInfo();
    fillPrev();
    updateSum();
    renderGrid();
  }

  function focusCode() {
    els.codeInput.focus();
    els.codeInput.select();
  }

  function focusVote(i) {
    var inp = voteInputs()[i];
    if (inp && !inp.disabled) { inp.focus(); inp.select(); }
  }

  function shake(el) {
    el.classList.remove('shake');
    void el.offsetWidth;
    el.classList.add('shake');
  }

  function onCodeKey(e) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    var code = S.resolveCode(els.codeInput.value);
    if (!code) {
      shake(els.codeInput);
      window.UI.toast('找不到投開票所「' + esc(els.codeInput.value) + '」，請輸入 57～95 或 0357～0395', 'err');
      els.codeInput.select();
      return;
    }
    loadStation(code);
    focusVote(0);
  }

  function onVoteKey(e) {
    var idx = parseInt(e.target.getAttribute('data-idx'), 10);
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      if (idx < N - 1) focusVote(idx + 1);
      else submit();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault(); focusVote(Math.min(N - 1, idx + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault(); focusVote(Math.max(0, idx - 1));
    } else if (e.key === '-' || e.key === 'Subtract') {
      e.preventDefault();
      setStatus(entryStatus === 'done' ? 'partial' : 'done');
    } else if (e.key === 'Escape') {
      e.preventDefault(); focusCode();
    }
  }

  // ---------- 送出（含防呆） ----------
  function submit() {
    if (!current) { shake(els.codeInput); focusCode(); return; }
    var code = current;
    var inputs = voteInputs();
    var votes = inputs.map(function (i) { return S.toInt(i.value); });
    var limit = E.highVoteThreshold;

    var high = [];
    votes.forEach(function (v, i) { if (v > limit) high.push(i); });

    var chain = Promise.resolve(true);

    if (high.length) {
      chain = chain.then(function () {
        var list = high.map(function (i) {
          var c = E.candidates[i];
          return '<li><span class="dot" style="background:' + c.color + '"></span>' + c.no + ' 號 ' + esc(c.name) +
            '：<b class="num warn">' + S.fmt(votes[i]) + '</b> 票</li>';
        }).join('');
        return window.UI.modal({
          title: '⚠ 異常高票確認（' + code + '）',
          danger: true,
          body: '<p>下列候選人單所票數超過 <b>' + S.fmt(limit) + '</b> 票，請確認是否多打一個 0：</p><ul class="ui-list">' + list + '</ul>',
          confirmText: '票數無誤，確認送出',
          cancelText: '返回修改'
        }).then(function (r) {
          if (!r.ok) { focusVote(high[0]); return false; }
          return true;
        });
      });
    }

    chain = chain.then(function (go) {
      if (!go) return false;
      if (votes.some(function (v) { return v > 0; })) return true;
      return window.UI.modal({
        title: '四位候選人皆為 0 票',
        body: '<p>' + code + ' 所有票數皆為 0，確定要以「' + STATUS_TEXT[entryStatus] + '」送出嗎？</p>',
        confirmText: '確定送出'
      }).then(function (r) {
        if (!r.ok) { focusVote(0); return false; }
        return true;
      });
    });

    chain.then(function (go) {
      if (!go) return;
      var status = entryStatus;
      var now = Date.now();
      var lin = votes[E.focusNo - 1];
      S.mutate(code + ' ' + STATUS_TEXT[status] + '（林 ' + S.fmt(lin) + '）', function (d) {
        var st = d.stations[code];
        st.votes = votes.slice();
        st.status = status;
        st.updatedAt = now;
        d.log.push({ code: code, ts: now, status: status, votes: votes.slice(), kind: 'report' });
      });
      window.UI.toast('✔ ' + code + ' ' + esc(S.stationLabel(code)) + '・' + STATUS_TEXT[status] + ' 已送出同步', status === 'done' ? 'ok' : 'warn');
      clearEntry();
      els.codeInput.value = '';
      focusCode();
    });
  }

  function resetStation() {
    if (!current) return;
    var code = current;
    window.UI.modal({
      title: '清除 ' + code + ' 回報',
      danger: true,
      body: '<p>將 ' + code + ' ' + esc(S.stationLabel(code)) + ' 恢復為「未回報」，票數不再計入總計。可用「還原上一筆」復原。</p>',
      confirmText: '確定清除'
    }).then(function (r) {
      if (!r.ok) return;
      S.mutate(code + ' 清除回報', function (d) {
        var st = d.stations[code];
        st.votes = null; st.status = 'none'; st.updatedAt = null;
        d.log.push({ code: code, ts: Date.now(), status: 'none', votes: null, kind: 'reset' });
      });
      window.UI.toast(code + ' 已清除回報', 'warn');
      clearEntry();
      focusCode();
    });
  }

  function doUndo() {
    if (window.UI.isModalOpen()) return;
    var item = S.undo();
    if (!item) { window.UI.toast('沒有可還原的操作', 'err'); return; }
    window.UI.toast('↶ 已還原：' + esc(item.label), 'warn');
    if (current) loadStation(current);
    focusCode();
  }

  // ---------- 右側與摘要 ----------
  function renderGrid() {
    var st = S.get();
    var counts = { none: 0, partial: 0, done: 0 };
    root.querySelectorAll('.g-cell').forEach(function (btn) {
      var code = btn.getAttribute('data-code');
      var s = st.stations[code];
      counts[s.status]++;
      btn.className = 'g-cell s-' + s.status + (code === current ? ' is-current' : '');
      btn.querySelector('small').textContent = s.village || (s.status === 'none' ? '' : STATUS_TEXT[s.status]);
      btn.title = code + ' ' + S.stationLabel(code, s) + '｜' + STATUS_TEXT[s.status];
    });
    els.gridLegend.innerHTML =
      '<span class="lg s-none">未回報 <b class="num">' + counts.none + '</b></span>' +
      '<span class="lg s-partial">期中 <b class="num">' + counts.partial + '</b></span>' +
      '<span class="lg s-done">已開完 <b class="num">' + counts.done + '</b></span>';
  }

  function renderMini() {
    var c = S.compute();
    var gap = S.focusGap(c);
    var rows = c.sorted.map(function (r, pos) {
      return (pos === E.seats ? '<li class="cut">▲ 當選線（應選 ' + E.seats + ' 席）</li>' : '') +
        '<li class="' + (r.cand.focus ? 'is-focus' : '') + '" style="--c:' + r.cand.color + '">' +
          '<span class="rk num">' + (c.valid ? r.rank : '-') + '</span>' +
          '<span class="bd num">' + r.cand.no + '</span>' +
          '<span class="nm">' + esc(r.cand.name) + '</span>' +
          '<b class="num">' + S.fmt(r.votes) + '</b>' +
          '<span class="pc num">' + S.pct(r.pct) + '</span>' +
        '</li>';
    }).join('');
    var gapHtml = gap.state === 'waiting' ? '<div class="gap g-wait">等待開票</div>'
      : gap.state === 'safe' ? '<div class="gap g-safe">林義剛領先第 ' + (E.seats + 1) + ' 名 <b class="num">+' + S.fmt(gap.diff) + '</b></div>'
      : '<div class="gap g-danger">林義剛距第 ' + E.seats + ' 名尚差 <b class="num">−' + S.fmt(gap.diff) + '</b></div>';
    els.miniRank.innerHTML = '<h4>即時排名 <small>已開完 ' + c.done + '／' + c.total + '・期中 ' + c.partial + '・有效票 ' + S.fmt(c.valid) + '</small></h4>' +
      '<ol>' + rows + '</ol>' + gapHtml;
  }

  function renderLog() {
    var log = S.get().log.slice(-12).reverse();
    if (!log.length) { els.opLog.innerHTML = '<li class="empty">尚無回報</li>'; return; }
    els.opLog.innerHTML = log.map(function (l) {
      var txt = l.kind === 'reset' ? '清除回報'
        : (l.kind === 'sim' ? '模擬・' : '') + STATUS_TEXT[l.status] + '｜林 ' + S.fmt(l.votes ? l.votes[E.focusNo - 1] : 0);
      return '<li class="k-' + (l.kind || 'report') + ' s-' + l.status + '">' +
        '<span class="t num">' + S.time(l.ts) + '</span>' +
        '<button type="button" class="c num" data-code="' + l.code + '">' + l.code + '</button>' +
        '<span class="x">' + esc(txt) + '</span></li>';
    }).join('');
  }

  function renderUndo() {
    var u = S.undoInfo();
    els.btnUndo.disabled = !u.count;
    els.btnUndo.title = u.count ? '還原：' + u.label + '（Alt+Z）' : '沒有可還原的操作';
  }

  function renderAll() {
    renderGrid();
    renderMini();
    renderLog();
    renderUndo();
    if (current) {
      var st = S.get().stations[current];
      els.btnResetStation.disabled = st.status === 'none';
      fillPrev();
      // 若使用者正在編輯村別／地點，避免重繪打斷輸入
      if (!els.stationInfo.contains(document.activeElement)) renderStationInfo();
    }
  }

  // ---------- 同步狀態（雲端／單機）與投影牆連線偵測 ----------
  var localBoards = 0;

  function startPing() {
    var myId = Math.random().toString(36).slice(2, 8);
    var seen = {};
    S.onMessage(function (m) { if (m.type === 'pong' && m.from === myId) seen[m.id] = Date.now(); });
    function tick() {
      var now = Date.now();
      var n = Object.keys(seen).filter(function (k) { return now - seen[k] < 5000; }).length;
      if (n !== localBoards) { localBoards = n; renderSync(); }
      S.post({ type: 'ping', id: myId });
    }
    tick();
    setInterval(tick, 2000);
  }

  function renderSync() {
    var c = window.Cloud.state;
    var info = S.syncInfo();
    var busy = info.dirty || c.pending > 0;
    var boards = Math.max(c.boards || 0, localBoards);
    var cls, text;
    switch (c.phase) {
      case 'loading': cls = 'wait'; text = '☁ 連線雲端中…'; break;
      case 'signed-out': cls = 'warn'; text = '☁ 尚未登入雲端・點此登入'; break;
      case 'offline':
        cls = 'warn';
        text = '☁ 離線中・' + (info.dirty ? '有資料待上傳（恢復連線自動補傳）' : '資料已存本機');
        break;
      case 'online':
        cls = busy ? 'wait' : 'ok';
        text = (busy ? '☁ 上傳中…' : '☁ 雲端已同步') + '・投影牆 ' + (boards ? '×' + boards : '未連線');
        break;
      case 'error': cls = 'err'; text = '⚠ ' + c.error; break;
      default:
        cls = localBoards ? 'ok' : 'local';
        text = '單機模式・' + (localBoards ? '投影牆已連線 ×' + localBoards : '尚未偵測到投影牆視窗');
    }
    if (!S.storageOk) text += '（⚠ 無法寫入本機儲存）';
    els.admSync.setAttribute('data-state', cls);
    els.admSync.querySelector('span').textContent = text;
  }

  function openLogin() {
    window.UI.cloudLogin('請使用操作人員帳號登入。登入後此裝置會記住登入狀態，同一瀏覽器的投影牆也會自動同步。<br>' +
      '<b>注意：每台裝置都要各自登入一次</b>（平板登入不代表電腦也登入）。')
      .then(function () { focusCode(); });
  }

  function openSyncPanel() {
    var C = window.Cloud;
    var c = C.state;
    var info = S.syncInfo();
    var body, actions = '';
    if (!C.configured) {
      body = '<p>尚未設定 Firebase 雲端專案，目前僅能使用<b>單機模式</b>（同一台電腦的後台與投影牆同步）。</p>';
    } else if (c.mode === 'local') {
      body = '<p>目前為<b>單機模式</b>：只與同一瀏覽器的投影牆同步，不使用網路。</p>' +
        '<label class="ui-check"><input type="checkbox" id="forcePush"> 以這台裝置的資料<b>覆蓋雲端</b>（例如斷網期間改用單機模式輸入）</label>' +
        '<p class="ui-note">不勾選則切換後採用雲端上的資料。</p>';
      actions = '<button type="button" class="btn btn-primary" data-sync="to-cloud">切換為雲端同步</button>';
    } else {
      body = '<p>目前為<b>雲端同步模式</b>：平板輸入、電腦投影即時同步。</p>' +
        '<p>帳號：<b>' + (c.user ? esc(c.user.email) : '尚未登入') + '</b><br>' +
        '狀態：' + esc(els.admSync.querySelector('span').textContent) + '<br>' +
        '本機資料版本：' + S.get().rev + (info.dirty ? '（有未上傳的修改）' : '') + '</p>';
      actions = (c.user
        ? '<button type="button" class="btn" data-sync="logout">登出</button>'
        : '<button type="button" class="btn btn-primary" data-sync="login">登入</button>') +
        '<button type="button" class="btn btn-ghost" data-sync="to-local">切換為單機模式</button>';
    }
    window.UI.modal({
      title: '同步設定',
      body: body + (actions ? '<div class="ui-inline-actions">' + actions + '</div>' : ''),
      confirmText: '關閉',
      hideCancel: true,
      onMount: function (b) {
        b.addEventListener('click', function (e) {
          var btn = e.target.closest('[data-sync]');
          if (!btn) return;
          var act = btn.getAttribute('data-sync');
          var force = b.querySelector('#forcePush');
          var forceChecked = force && force.checked;
          b.closest('.ui-modal').querySelector('[data-act="ok"]').click();
          if (act === 'login') openLogin();
          else if (act === 'logout') C.signOut().then(function () { window.UI.toast('已登出雲端', 'warn'); });
          else if (act === 'to-local') {
            window.UI.modal({
              title: '切換為單機模式',
              body: '<p>此裝置將停止與雲端同步，改為只與同一瀏覽器的投影牆同步。同一瀏覽器已開啟的投影牆會自動重新載入。</p>',
              confirmText: '確定切換'
            }).then(function (r) { if (r.ok) { C.setMode('local'); window.location.reload(); } });
          } else if (act === 'to-cloud') {
            if (forceChecked) S.requestForcePush();
            C.setMode('cloud');
            window.location.reload();
          }
        });
      }
    });
  }

  function openBoard() {
    var w = window.open(window.location.pathname, 'wujie7-board');
    if (w) w.focus();
  }

  // ---------- 掛載 ----------
  function mount(el) {
    root = el;
    document.body.classList.add('is-admin');
    root.innerHTML = template();
    ['codeInput', 'stationInfo', 'statusSeg', 'entryCard', 'entrySum', 'btnSubmit', 'btnResetStation',
      'btnUndo', 'btnOpenBoard', 'miniRank', 'opLog', 'gridLegend', 'stationGrid', 'admSync', 'toolsCard'
    ].forEach(function (id) { els[id] = root.querySelector('#' + id); });

    els.codeInput.addEventListener('keydown', onCodeKey);
    els.codeInput.addEventListener('input', function () {
      els.codeInput.value = els.codeInput.value.replace(/\D/g, '').slice(0, 4);
    });
    els.codeInput.addEventListener('focus', function () { els.codeInput.select(); });

    voteInputs().forEach(function (inp) {
      inp.addEventListener('keydown', onVoteKey);
      inp.addEventListener('input', function () {
        var v = inp.value.replace(/\D/g, '').slice(0, 5);
        if (v !== inp.value) inp.value = v;
        updateSum();
      });
      inp.addEventListener('focus', function () { inp.select(); });
    });

    els.statusSeg.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (b) setStatus(b.getAttribute('data-status'));
    });
    els.btnSubmit.addEventListener('click', submit);
    els.btnResetStation.addEventListener('click', resetStation);
    els.btnUndo.addEventListener('click', doUndo);
    els.btnOpenBoard.addEventListener('click', openBoard);

    els.stationGrid.addEventListener('click', function (e) {
      var b = e.target.closest('.g-cell');
      if (!b) return;
      loadStation(b.getAttribute('data-code'));
      focusVote(0);
    });
    els.opLog.addEventListener('click', function (e) {
      var b = e.target.closest('[data-code]');
      if (!b) return;
      loadStation(b.getAttribute('data-code'));
      focusVote(0);
    });

    document.addEventListener('keydown', function (e) {
      if (window.UI.isModalOpen()) return;
      if (e.altKey && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); doUndo(); }
      else if (e.key === 'Escape') { focusCode(); }
      else if (/^[0-9]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
        // 焦點意外跑掉（點到空白處）時，直接打數字會自動回到編號框
        var t = document.activeElement;
        var tag = t && t.tagName;
        if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
          e.preventDefault();
          els.codeInput.focus();
          els.codeInput.value = e.key;
        }
      }
    });

    S.subscribe(renderAll);
    clearEntry();
    renderAll();

    els.admSync.addEventListener('click', function () {
      var c = window.Cloud.state;
      if (c.phase === 'signed-out') openLogin();
      else openSyncPanel();
    });
    window.Cloud.onChange(renderSync);
    S.onSync(function (info, evt) {
      renderSync();
      if (evt.conflict) window.UI.toast('雲端資料已被其他裝置更新，已改用雲端版本；本機未上傳的版本可用「還原上一筆」取回', 'warn');
    });
    window.Cloud.init('admin');
    startPing();
    if (window.AdminTools) window.AdminTools.mount(els.toolsCard, { reload: function () { if (current) loadStation(current); } });
    focusCode();
  }

  window.AdminView = { mount: mount };
})();
