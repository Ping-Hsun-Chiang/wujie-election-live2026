/*
 * 雲端即時同步（Firebase Realtime Database）
 * - 平板（後台）輸入 → 雲端 → 電腦（投影牆）即時更新
 * - 必須以授權的操作人員帳號登入才能讀寫
 * - 斷網時資料仍存本機，恢復連線後自動補傳
 * - 未設定 Firebase 或切換為「單機模式」時，完全不載入雲端元件
 */
(function () {
  'use strict';

  var SDK_VERSION = '13.4.0';
  var SDK_BASE = 'https://www.gstatic.com/firebasejs/' + SDK_VERSION + '/';
  var MODE_KEY = 'wujie7-live2026:sync-mode';
  var ROOT = 'elections/wujie7-2026';
  var CFG = window.FIREBASE_CONFIG;
  var S = window.Store;

  var configured = !!(CFG && CFG.apiKey && CFG.databaseURL);
  var listeners = [];
  var auth = null, db = null, stateRef = null, presenceRef = null, presenceListRef = null;
  var tabId = Math.random().toString(36).slice(2, 10);

  /*
   * phase：
   *   local      單機模式（不使用雲端）
   *   loading    載入雲端元件中
   *   signed-out 尚未登入
   *   offline    已登入但目前離線
   *   online     已連線同步
   *   error      發生錯誤（見 error）
   */
  var st = { role: '', mode: 'local', phase: 'local', user: null, connected: false, pending: 0, boards: 0, error: '' };

  function emit() {
    listeners.forEach(function (fn) { try { fn(st); } catch (e) { console.error(e); } });
  }

  function safeGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function safeSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } }

  function getMode() {
    if (!configured) return 'local';
    var m = safeGet(MODE_KEY);
    return m === 'local' ? 'local' : 'cloud';
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.async = false;
      s.onload = resolve;
      s.onerror = function () { reject(new Error('load-failed')); };
      document.head.appendChild(s);
    });
  }

  function updatePhase() {
    if (st.phase === 'error' && st.fatal) return;
    if (!st.user) st.phase = 'signed-out';
    else st.phase = st.connected ? 'online' : 'offline';
    emit();
  }

  function setError(msg, fatal) {
    st.phase = 'error';
    st.error = msg;
    st.fatal = !!fatal;
    emit();
  }

  function push(state) {
    if (!stateRef) return Promise.reject(new Error('not-ready'));
    st.pending++;
    emit();
    return stateRef.set(JSON.parse(JSON.stringify(state))).then(function () {
      st.pending = Math.max(0, st.pending - 1);
      emit();
    }, function (e) {
      st.pending = Math.max(0, st.pending - 1);
      setError(e && e.code === 'PERMISSION_DENIED' ? '此帳號沒有寫入權限' : '上傳失敗：' + (e && e.message || e));
      throw e;
    });
  }

  function registerPresence() {
    if (st.role !== 'board' || !st.user || !st.connected) return;
    presenceRef = db.ref(ROOT + '/presence/' + tabId);
    presenceRef.onDisconnect().remove();
    presenceRef.set({ ts: firebase.database.ServerValue.TIMESTAMP });
  }

  function attach() {
    stateRef = db.ref(ROOT + '/state');
    // 先掛上同步掛勾，再開始接收雲端資料
    S.setCloud({ writer: st.role === 'admin', push: push });
    stateRef.on('value', function (snap) {
      if (st.phase === 'error' && !st.fatal) updatePhase();
      S.receiveCloud(snap.val());
    }, function (e) {
      setError(e && e.code === 'PERMISSION_DENIED' ? '此帳號未被授權讀取開票資料' : '讀取失敗：' + (e && e.message || e), true);
    });
    if (st.role === 'admin') {
      presenceListRef = db.ref(ROOT + '/presence');
      presenceListRef.on('value', function (snap) { st.boards = snap.numChildren(); emit(); }, function () {});
    }
    registerPresence();
  }

  function detach() {
    if (stateRef) stateRef.off();
    if (presenceListRef) presenceListRef.off();
    if (presenceRef) presenceRef.remove().catch(function () {});
    stateRef = presenceRef = presenceListRef = null;
    st.boards = 0;
    S.setCloud(null);
  }

  var AUTH_ERRORS = {
    'auth/invalid-credential': '帳號或密碼錯誤',
    'auth/invalid-login-credentials': '帳號或密碼錯誤',
    'auth/wrong-password': '帳號或密碼錯誤',
    'auth/user-not-found': '帳號或密碼錯誤',
    'auth/invalid-email': 'Email 格式不正確',
    'auth/too-many-requests': '嘗試次數過多，請稍後再試',
    'auth/network-request-failed': '網路連線失敗，請確認網路',
    'auth/user-disabled': '此帳號已停用'
  };

  var Cloud = {
    configured: configured,
    state: st,
    getMode: getMode,

    setMode: function (m) {
      safeSet(MODE_KEY, m === 'local' ? 'local' : 'cloud');
      // 通知同瀏覽器的其他視窗（例如投影牆）重新載入以套用
      S.post({ type: 'sync-mode' });
    },

    onChange: function (fn) { listeners.push(fn); fn(st); },

    init: function (role) {
      st.role = role;
      st.mode = getMode();
      S.onMessage(function (m) { if (m.type === 'sync-mode') window.location.reload(); });
      if (st.mode !== 'cloud') { st.phase = 'local'; emit(); return; }

      st.phase = 'loading';
      emit();
      loadScript(SDK_BASE + 'firebase-app-compat.js')
        .then(function () {
          return Promise.all([
            loadScript(SDK_BASE + 'firebase-auth-compat.js'),
            loadScript(SDK_BASE + 'firebase-database-compat.js')
          ]);
        })
        .then(function () {
          firebase.initializeApp(CFG);
          auth = firebase.auth();
          db = firebase.database();
          db.ref('.info/connected').on('value', function (snap) {
            st.connected = !!snap.val();
            registerPresence();
            updatePhase();
          });
          auth.onAuthStateChanged(function (user) {
            detach();
            st.fatal = false;
            st.user = user ? { email: user.email, uid: user.uid } : null;
            if (user) attach();
            updatePhase();
          });
        })
        .catch(function () {
          setError('無法載入雲端元件（可能未連網）；資料仍保存在本機，連網後重新整理即可補傳', true);
        });
    },

    signIn: function (email, password) {
      if (!auth) return Promise.reject(new Error('雲端元件尚未載入'));
      return auth.signInWithEmailAndPassword(email, password).catch(function (e) {
        throw new Error(AUTH_ERRORS[e && e.code] || ('登入失敗：' + (e && e.code || e)));
      });
    },

    signOut: function () {
      if (!auth) return Promise.resolve();
      detach();
      return auth.signOut();
    }
  };

  window.Cloud = Cloud;
})();
