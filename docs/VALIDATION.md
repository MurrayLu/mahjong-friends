# 發布驗證（Validation）

驗證日期：2026-10-20；Windows、Node.js 24.14.0 / .NET SDK 10。下列命令全部 exit 0。

```powershell
npm.cmd ci --ignore-scripts --no-audit --no-fund
npm.cmd run build
npm.cmd test
npm.cmd audit --json
```

2 組整合驗收通過：HTTP 到 SQL 結算與排行榜；錯誤結算、重複／跨群玩家、權限與 Origin 拒絕且已存結果不變；外鍵失敗令原子 batch 回滾。另驗證本次主機 /demo/start 與建置後 JavaScript 回傳 HTTP 200。npm audit：0 vulnerabilities。Node SQLite experimental 與娛樂投影警告保留；娛樂功能、雲端、圖片與 OAuth 不在完整驗收範圍。

公開桌面為新建隔離展示（Isolated Demo），不是原始系統畫面。本次不發布截圖、影片或原始正式環境資料。
