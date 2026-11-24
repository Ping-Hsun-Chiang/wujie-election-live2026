/*
 * Firebase 專案設定（網頁用公開識別資訊，非密碼）
 * 資料安全由 database.rules.json 的資料庫規則把關：只有授權的操作人員帳號能讀寫。
 * 設為 null 時系統自動使用單機模式。
 */
window.FIREBASE_CONFIG = null;
