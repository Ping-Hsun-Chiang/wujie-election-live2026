/*
 * 資料儲存與同步引擎
 * - localStorage 持久化（重新整理、誤關分頁不掉資料）
 * - BroadcastChannel 即時推播 + storage 事件備援
 * - 全狀態快照式 Undo（同樣持久化）
 * 完全離線運作，不需任何伺服器。
 */
(function () {
  'use strict';

  var E = window.ELECTION;
  var N = E.candidates.length;
  var KEY = 'wujie7-live2026:state:v1';
  var UNDO_KEY = 'wujie7-live2026:undo:v1';
  var CHANNEL = 'wujie7-live2026';
  var SCHEMA = 'wujie7-live2026/v1';
  var LOG_LIMIT = 200;
  var UNDO_LIMIT = 40;
  var STATUSES = { none: 1, partial: 1, done: 1 };

  // ---------- 基本工具 ----------
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function toInt(v) {
    var n = parseInt(v, 10);
    return isFinite(n) && n > 0 ? n : 0;
  }

  function defaultStation(code) {
    var k = E.knownStations[code] || {};
    return { village: k.village || '', location: k.location || '', status: 'none', votes: null, updatedAt: null };
  }

  function createEmpty() {
    var stations = {};
    E.stationCodes.forEach(function (c) { stations[c] = defaultStation(c); });
    return { schema: SCHEMA, rev: 0, updatedAt: Date.now(), stations: stations, log: [] };
  }

  // 將任意來源資料整理成合法狀態（容錯匯入／舊版資料）
  function normalize(raw) {
    var base = createEmpty();
    if (!raw || typeof raw !== 'object' || !raw.stations) return base;
    E.stationCodes.forEach(function (c) {
      var s = raw.stations[c];
      if (!s || typeof s !== 'object') return;
      var st = base.stations[c];
      if (typeof s.village === 'string') st.village = s.village;
      if (typeof s.location === 'string') st.location = s.location;
      st.status = STATUSES[s.status] ? s.status : 'none';
      if (Array.isArray(s.votes) && st.status !== 'none') {
        st.votes = [];
        for (var i = 0; i < N; i++) st.votes.push(toInt(s.votes[i]));
      } else {
        st.status = 'none';
        st.votes = null;
      }
      st.updatedAt = typeof s.updatedAt === 'number' ? s.updatedAt : null;
    });
    base.rev = toInt(raw.rev);
    base.updatedAt = typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now();
    if (Array.isArray(raw.log)) {
      base.log = raw.log.filter(function (l) {
        return l && base.stations[l.code] && typeof l.ts === 'number';
      }).slice(-LOG_LIMIT);
    }
    return base;
  }

  function safeGet(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  }
  function safeSet(key, val) {
    try { window.localStorage.setItem(key, val); return true; } catch (e) { return false; }
  }

  function loadState() {
    var raw = safeGet(KEY);
    if (!raw) return createEmpty();
    try { return normalize(JSON.parse(raw)); } catch (e) { return createEmpty(); }
  }

  function loadUndo() {
    try {
      var arr = JSON.parse(safeGet(UNDO_KEY) || '[]');
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }

  // ---------- 狀態與訂閱 ----------
  var state = loadState();
  var undoStack = loadUndo();
  var listeners = [];
  var msgListeners = [];
  var storageOk = safeSet(KEY + ':probe', '1');

  var bc = null;
  try { if ('BroadcastChannel' in window) bc = new BroadcastChannel(CHANNEL); } catch (e) { bc = null; }

  function emit(source) {
    listeners.forEach(function (fn) {
      try { fn(state, source); } catch (e) { console.error(e); }
    });
  }

  function acceptRemote(next) {
    if (!next) return;
    if (next.rev === state.rev && next.updatedAt === state.updatedAt) return; // 重複通知
    state = normalize(next);
    undoStack = loadUndo();
    emit('remote');
  }

  if (bc) {
    bc.onmessage = function (ev) {
      var d = ev.data || {};
      if (d.type === 'state') acceptRemote(d.state);
      else msgListeners.forEach(function (fn) { fn(d); });
    };
  }

  window.addEventListener('storage', function (ev) {
    if (ev.key === KEY && ev.newValue) {
      try { acceptRemote(JSON.parse(ev.newValue)); } catch (e) { /* ignore */ }
    } else if (ev.key === UNDO_KEY) {
      undoStack = loadUndo();
      emit('remote');
    }
  });

  function commit(next) {
    next.rev = state.rev + 1;
    next.updatedAt = Date.now();
    if (next.log.length > LOG_LIMIT) next.log = next.log.slice(-LOG_LIMIT);
    state = next;
    safeSet(KEY, JSON.stringify(state));
    if (bc) bc.postMessage({ type: 'state', state: state });
    emit('local');
  }

  function pushUndo(label) {
    undoStack.push({ label: label, ts: Date.now(), state: clone(state) });
    if (undoStack.length > UNDO_LIMIT) undoStack = undoStack.slice(-UNDO_LIMIT);
    safeSet(UNDO_KEY, JSON.stringify(undoStack));
  }

  // ---------- 對外 API ----------
  var Store = {
    SCHEMA: SCHEMA,
    storageOk: storageOk,
    channelOk: !!bc,

    get: function () { return state; },

    subscribe: function (fn) {
      listeners.push(fn);
      return function () { listeners = listeners.filter(function (f) { return f !== fn; }); };
    },

    // 以草稿方式修改狀態；label 會成為 Undo 說明；fn 回傳 false 代表取消
    mutate: function (label, fn) {
      var draft = clone(state);
      if (fn(draft) === false) return false;
      pushUndo(label);
      commit(draft);
      return true;
    },

    // 整份取代（匯入還原用）
    replace: function (raw, label) {
      var next = normalize(raw);
      pushUndo(label || '匯入資料');
      commit(next);
    },

    undo: function () {
      var item = undoStack.pop();
      if (!item) return null;
      safeSet(UNDO_KEY, JSON.stringify(undoStack));
      commit(normalize(item.state));
      return item;
    },

    undoInfo: function () {
      var last = undoStack[undoStack.length - 1];
      return { count: undoStack.length, label: last ? last.label : '' };
    },

    // 跨視窗輕量訊息（投影牆連線偵測）
    post: function (msg) { if (bc) bc.postMessage(msg); },
    onMessage: function (fn) { msgListeners.push(fn); },

    normalize: normalize,
    createEmpty: createEmpty,
    toInt: toInt
  };

  // ---------- 計算工具 ----------
  Store.compute = function (s) {
    s = s || state;
    var totals = [];
    for (var i = 0; i < N; i++) totals.push(0);
    var done = 0, partial = 0;
    E.stationCodes.forEach(function (c) {
      var st = s.stations[c];
      if (st.status === 'done') done++;
      else if (st.status === 'partial') partial++;
      if (st.votes && st.status !== 'none') {
        for (var j = 0; j < N; j++) totals[j] += st.votes[j];
      }
    });
    var valid = totals.reduce(function (a, b) { return a + b; }, 0);

    var rows = E.candidates.map(function (cand, idx) {
      return { cand: cand, votes: totals[idx], pct: valid ? totals[idx] / valid * 100 : 0 };
    });
    var sorted = rows.slice().sort(function (a, b) {
      return b.votes - a.votes || a.cand.no - b.cand.no;
    });
    sorted.forEach(function (r, pos) {
      r.pos = pos; // 0 起算的排序位置（決定畫面位置與當選線）
      r.rank = 1 + sorted.filter(function (o) { return o.votes > r.votes; }).length;
    });

    var total = E.stationCodes.length;
    return {
      totals: totals,
      valid: valid,
      sorted: sorted,
      byNo: rows.reduce(function (m, r) { m[r.cand.no] = r; return m; }, {}),
      done: done,
      partial: partial,
      reported: done + partial,
      total: total,
      donePct: total ? done / total * 100 : 0
    };
  };

  // 本陣營候選人與當選門檻的安全差距
  Store.focusGap = function (comp) {
    var me = comp.byNo[E.focusNo];
    var seats = E.seats;
    var sorted = comp.sorted;
    if (!comp.valid) return { state: 'waiting', me: me };
    if (me.pos < seats) {
      var firstOut = sorted[seats];
      return { state: 'safe', me: me, diff: me.votes - (firstOut ? firstOut.votes : 0), rival: firstOut };
    }
    var lastIn = sorted[seats - 1];
    return { state: 'danger', me: me, diff: lastIn.votes - me.votes, rival: lastIn };
  };

  Store.stationLabel = function (code, st) {
    st = st || state.stations[code];
    if (!st) return E.township + ' 第 ' + code + ' 投開票所';
    if (st.village && st.location) return st.village + '・' + st.location;
    if (st.village) return st.village;
    if (st.location) return st.location;
    return E.township + ' 第 ' + code + ' 投開票所';
  };

  // 最近回報（同一所只保留最新一筆；已被清除的所不顯示）
  Store.recent = function (n, s) {
    s = s || state;
    var seen = {};
    var out = [];
    for (var i = s.log.length - 1; i >= 0 && out.length < n; i--) {
      var l = s.log[i];
      if (seen[l.code]) continue;
      seen[l.code] = true;
      var st = s.stations[l.code];
      if (l.kind === 'reset' || !st || st.status === 'none') continue;
      out.push(l);
    }
    return out;
  };

  // 兩碼速查：57 → 0357；357 → 0357；0357 → 0357
  Store.resolveCode = function (input) {
    var d = String(input || '').replace(/\D/g, '');
    if (!d) return null;
    var code = null;
    if (d.length <= 2) code = '03' + ('00' + d).slice(-2);
    else if (d.length === 3) code = '0' + d;
    else if (d.length === 4) code = d;
    return code && E.stationCodes.indexOf(code) >= 0 ? code : null;
  };

  Store.fmt = function (n) { return Math.round(n || 0).toLocaleString('en-US'); };
  Store.pct = function (p) { return (p || 0).toFixed(2) + '%'; };
  Store.time = function (ts, withSec) {
    if (!ts) return '--:--';
    var d = new Date(ts);
    var p = function (x) { return ('0' + x).slice(-2); };
    return p(d.getHours()) + ':' + p(d.getMinutes()) + (withSec === false ? '' : ':' + p(d.getSeconds()));
  };

  window.Store = Store;
})();
