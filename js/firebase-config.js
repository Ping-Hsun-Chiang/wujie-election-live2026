/*
 * Firebase 專案設定（網頁用公開識別資訊，非密碼）
 * 資料安全由 database.rules.json 的資料庫規則把關：只有授權的操作人員帳號能讀寫。
 * 設為 null 時系統自動使用單機模式。
 */
window.FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCBd6_r3CIXQqtifl8uV2B6GVbeoikyFXU',
  authDomain: 'wujie-election-live2026.firebaseapp.com',
  databaseURL: 'https://wujie-election-live2026-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'wujie-election-live2026',
  storageBucket: 'wujie-election-live2026.firebasestorage.app',
  messagingSenderId: '371924371055',
  appId: '1:371924371055:web:e1aa75fede05844e90ef9a'
};
