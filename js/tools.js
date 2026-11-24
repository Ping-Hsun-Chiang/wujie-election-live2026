/*
 * 後台工具：備份還原、戰報匯出、選前演練、批次匯入投開票所村別／地點
 */
(function () {
  'use strict';

  var E = window.ELECTION;
  var S = window.Store;
  var UI = window.UI;
  var esc = UI.esc;
  var N = E.candidates.length;
  var STATUS_TEXT = { none: '未回報', partial: '期中回報', done: '已開完' };
  var CLEAR_WORD = '清空全部';
  var hooks = {};

  // ---------- JSON 備份／還原 ----------
  function exportJSON() {
    var payload = {
      schema: S.SCHEMA,
      exportedAt: new Date().toISOString(),
      election: E.title,
      state: S.get()
    };
    UI.download('wujie7-backup-' + UI.stamp() + '.json', JSON.stringify(payload, null, 2), 'application/json');
    UI.toast('已匯出 JSON 備份');
  }

  function importJSON(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var data;
      try { data = JSON.parse(String(reader.result).replace(/^﻿/, '')); } catch (e) {
        UI.toast('檔案不是有效的 JSON', 'err'); return;
      }
      var raw = data && data.state ? data.state : data;
      if (!raw || !raw.stations) { UI.toast('找不到投開票所資料，無法還原', 'err'); return; }
      var next = S.normalize(raw);
      var c = S.compute(next);
      UI.modal({
        title: '匯入 JSON 還原',
        danger: true,
        body: '<p>檔案：<b>' + esc(file.name) + '</b>' + (data.exportedAt ? '<br>備份時間：' + esc(new Date(data.exportedAt).toLocaleString('zh-TW')) : '') + '</p>' +
          '<p>內容：已開完 <b>' + c.done + '</b> 所、期中 <b>' + c.partial + '</b> 所、有效票 <b>' + S.fmt(c.valid) + '</b></p>' +
          '<p>將<b>覆蓋目前全部資料</b>（可用「還原上一筆」復原）。</p>',
        confirmText: '覆蓋並還原'
      }).then(function (r) {
        if (!r.ok) return;
        S.replace(raw, '匯入 JSON 還原（' + file.name + '）');
        hooks.reload && hooks.reload();
        UI.toast('已從備份還原並同步投影牆');
      });
    };
    reader.readAsText(file, 'utf-8');
  }

  // ---------- CSV 戰報 ----------
  function csvCell(v) {
    var s = String(v == null ? '' : v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function exportCSV() {
    var st = S.get();
    var c = S.compute(st);
    var head = ['投開票所編號', '村別', '地點', '狀態']
      .concat(E.candidates.map(function (x) { return x.no + '號 ' + x.name + '（' + x.party + '）'; }))
      .concat(['有效票合計', '林義剛得票率', '最後更新時間']);
    var lines = [head];
    var focusIdx = E.focusNo - 1;
    E.stationCodes.forEach(function (code) {
      var s = st.stations[code];
      var votes = s.votes || [];
      var sum = votes.reduce(function (a, b) { return a + b; }, 0);
      var row = [code, s.village, s.location || (s.village ? '' : E.township + ' 第 ' + code + ' 投開票所'), STATUS_TEXT[s.status]];
      for (var i = 0; i < N; i++) row.push(s.votes ? votes[i] : '');
      row.push(s.votes ? sum : '');
      row.push(s.votes && sum ? (votes[focusIdx] / sum * 100).toFixed(2) + '%' : '');
      row.push(s.updatedAt ? new Date(s.updatedAt).toLocaleString('zh-TW', { hour12: false }) : '');
      lines.push(row);
    });
    var total = ['合計', '', '', '已開完 ' + c.done + '／期中 ' + c.partial + '／共 ' + c.total + ' 所'].concat(c.totals).concat([c.valid, S.pct(c.byNo[E.focusNo].pct), new Date().toLocaleString('zh-TW', { hour12: false })]);
    var pct = ['得票率', '', '', ''].concat(c.totals.map(function (t) { return c.valid ? (t / c.valid * 100).toFixed(2) + '%' : ''; })).concat(['', '', '']);
    var rank = ['名次', '', '', ''].concat(E.candidates.map(function (x) {
      var r = c.byNo[x.no];
      return c.valid ? '第 ' + r.rank + ' 名' + (r.pos < E.seats ? '（當選安全名單）' : '') : '';
    })).concat(['', '', '']);
    lines.push(total, pct, rank);

    var csv = '﻿' + lines.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n');
    UI.download('五結鄉縣議員開票戰報-' + UI.stamp() + '.csv', csv, 'text/csv;charset=utf-8');
    UI.toast('已匯出 39 所完整戰報 CSV');
  }

  // ---------- 選前演練：模擬開票 ----------
  function rand(a, b) { return a + Math.random() * (b - a); }

  function simulate() {
    var st = S.get();
    var pool = E.stationCodes.filter(function (code) { return st.stations[code].status !== 'done'; });
    if (!pool.length) { UI.toast('39 所皆已開完，請先清空票數再演練', 'err'); return; }
    var picks = [];
    while (picks.length < 3 && pool.length) {
      picks.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    }
    var base = [0.26, 0.21, 0.31, 0.22];
    S.mutate('模擬開票 ' + picks.join('、'), function (d) {
      picks.forEach(function (code, k) {
        var s = d.stations[code];
        var size = Math.round(rand(380, 820));
        var w = base.map(function (b) { return Math.max(0.05, b + rand(-0.07, 0.07)); });
        var ws = w.reduce(function (a, b) { return a + b; }, 0);
        var final = w.map(function (x) { return Math.round(size * x / ws); });
        var partial = s.status === 'none' && Math.random() < 0.25;
        var votes = partial ? final.map(function (v) { return Math.round(v * rand(0.35, 0.7)); }) : final;
        if (s.votes) votes = votes.map(function (v, i) { return Math.max(v, s.votes[i]); });
        var ts = Date.now() + k;
        s.votes = votes;
        s.status = partial ? 'partial' : 'done';
        s.updatedAt = ts;
        d.log.push({ code: code, ts: ts, status: s.status, votes: votes.slice(), kind: 'sim' });
      });
    });
    hooks.reload && hooks.reload();
    UI.toast('模擬開出 ' + picks.join('、'), 'warn');
  }

  function clearAll() {
    UI.modal({
      title: '⚠ 清空全部票數',
      danger: true,
      body: '<p>將 39 所票數與回報紀錄<b>全部清空</b>（村別／地點標註會保留）。</p>' +
        '<p>建議先「匯出 JSON 備份」。如需繼續，請輸入「<b>' + CLEAR_WORD + '</b>」。</p>',
      requireText: CLEAR_WORD,
      confirmText: '確認清空'
    }).then(function (r) {
      if (!r.ok) return;
      S.mutate('清空全部票數', function (d) {
        E.stationCodes.forEach(function (code) {
          var s = d.stations[code];
          s.votes = null; s.status = 'none'; s.updatedAt = null;
        });
        d.log = [];
      });
      hooks.reload && hooks.reload();
      UI.toast('已清空全部票數（可按還原上一筆復原）', 'warn');
    });
  }

  // ---------- 批次貼上投開票所村別／地點 ----------
  // 每行一所：編號 + 村別 + 地點，可用 Tab、逗號、空白或「|」分隔
  function parseBatch(text) {
    var rows = [];
    String(text || '').split(/\r?\n/).forEach(function (line, n) {
      var raw = line.trim();
      if (!raw) return;
      var m = raw.match(/^(\d{2,4})(?:[\s\t,，、|｜:：]+(.*))?$/);
      if (!m) { rows.push({ line: n + 1, raw: raw, error: '開頭需為投開票所編號' }); return; }
      var code = S.resolveCode(m[1]);
      if (!code) { rows.push({ line: n + 1, raw: raw, error: '編號 ' + m[1] + ' 不在 0357～0395' }); return; }
      var rest = (m[2] || '').trim();
      var village = '';
      for (var i = 0; i < E.villages.length; i++) {
        if (rest.indexOf(E.villages[i]) === 0) { village = E.villages[i]; break; }
      }
      var location = village ? rest.slice(village.length) : rest;
      location = location.replace(/^[\s\t,，、|｜:：]+/, '').replace(/[\t,，|｜]+/g, ' ').trim();
      var warn = '';
      if (!village) {
        var tok = rest.split(/[\s\t,，、|｜]+/)[0] || '';
        if (/村$/.test(tok)) warn = '「' + tok + '」非五結鄉 15 村，已視為地點';
      }
      if (!village && !location) { rows.push({ line: n + 1, raw: raw, error: '缺少村別或地點' }); return; }
      rows.push({ line: n + 1, code: code, village: village, location: location, warn: warn });
    });
    return rows;
  }

  function batchPaste() {
    var parsed = [];
    var example = '0357\t三興村\t三興社區活動中心\n58 二結村 二結國小\n0359,鎮安村,鎮安村辦公處';
    UI.modal({
      title: '批次貼上投開票所村別／地點',
      wide: true,
      body: '<p>每行一所：<b>編號</b>（2 碼或 4 碼）＋ <b>村別</b>（五結鄉 15 村）＋ <b>地點</b>（選填）。可直接從 Excel 複製貼上（Tab 分隔），也可用逗號或空白分隔。只會覆蓋有填寫的欄位，不影響票數。</p>' +
        '<textarea id="batchText" spellcheck="false" placeholder="' + esc(example) + '"></textarea>' +
        '<div class="ui-preview" id="batchPreview"></div>',
      confirmText: '套用匯入',
      cancelText: '取消',
      onMount: function (body, ctl) {
        var ta = body.querySelector('#batchText');
        var pv = body.querySelector('#batchPreview');
        function refresh() {
          parsed = parseBatch(ta.value);
          var ok = parsed.filter(function (r) { return !r.error; });
          ctl.setConfirmEnabled(ok.length > 0);
          if (!parsed.length) { pv.innerHTML = '<p>貼上後會在此預覽解析結果。</p>'; return; }
          pv.innerHTML = '<p>可匯入 <b>' + ok.length + '</b> 所' + (parsed.length - ok.length ? '，<span class="err">' + (parsed.length - ok.length) + ' 行無法解析</span>' : '') + '</p>' +
            '<table class="ui-table"><thead><tr><th>行</th><th>編號</th><th>村別</th><th>地點</th><th>備註</th></tr></thead><tbody>' +
            parsed.map(function (r) {
              return r.error
                ? '<tr class="err"><td>' + r.line + '</td><td colspan="3">' + esc(r.raw) + '</td><td>' + esc(r.error) + '</td></tr>'
                : '<tr><td>' + r.line + '</td><td class="num">' + r.code + '</td><td>' + esc(r.village || '（不變）') + '</td><td>' + esc(r.location || '（不變）') + '</td><td class="err">' + esc(r.warn) + '</td></tr>';
            }).join('') + '</tbody></table>';
        }
        ta.addEventListener('input', refresh);
        refresh();
      },
      onConfirm: function () {
        var ok = parsed.filter(function (r) { return !r.error; });
        return ok.length ? ok : false;
      }
    }).then(function (r) {
      if (!r.ok) return;
      var rows = r.value;
      S.mutate('批次匯入村別／地點 ' + rows.length + ' 所', function (d) {
        rows.forEach(function (row) {
          var s = d.stations[row.code];
          if (row.village) s.village = row.village;
          if (row.location) s.location = row.location;
        });
      });
      hooks.reload && hooks.reload();
      UI.toast('已更新 ' + rows.length + ' 所村別／地點');
    });
  }

  // ---------- 掛載 ----------
  function mount(el, h) {
    hooks = h || {};
    el.innerHTML = '' +
      '<h4>資料安全與報表</h4>' +
      '<div class="tool-group">' +
        '<button type="button" class="btn btn-sm" data-act="export-json">⬇ 匯出 JSON 備份</button>' +
        '<button type="button" class="btn btn-sm" data-act="import-json">⬆ 匯入 JSON 還原</button>' +
        '<button type="button" class="btn btn-sm" data-act="export-csv">📄 匯出 39 所戰報 CSV</button>' +
        '<input type="file" accept=".json,application/json" hidden data-role="file">' +
      '</div>' +
      '<h4>選前準備與演練</h4>' +
      '<div class="tool-group">' +
        '<button type="button" class="btn btn-sm" data-act="batch">📋 批次貼上村別／地點</button>' +
        '<button type="button" class="btn btn-sm" data-act="simulate">🎲 模擬隨機開票（3 所）</button>' +
        '<button type="button" class="btn btn-sm btn-danger" data-act="clear">🗑 清空全部票數</button>' +
      '</div>';

    var fileInput = el.querySelector('[data-role="file"]');
    fileInput.addEventListener('change', function () {
      if (fileInput.files[0]) importJSON(fileInput.files[0]);
      fileInput.value = '';
    });

    el.addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]');
      if (!b) return;
      var act = b.getAttribute('data-act');
      if (act === 'export-json') exportJSON();
      else if (act === 'import-json') fileInput.click();
      else if (act === 'export-csv') exportCSV();
      else if (act === 'batch') batchPaste();
      else if (act === 'simulate') simulate();
      else if (act === 'clear') clearAll();
    });
  }

  window.AdminTools = { mount: mount, parseBatch: parseBatch };
})();
