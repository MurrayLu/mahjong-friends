# Mahjong Friends

**麻將戰績管理網站｜React · TypeScript · Hono · Cloudflare Workers / D1**

最初因為朋友想記錄牌局輸贏而建立，後來為了讓大家更願意持續使用，逐步加入排行榜、群組及互動娛樂功能。這是個人興趣專案，不是企業 SaaS 交付案例。

**[實際運作網站（Live Website）](https://mahjongfriend.twsites.workers.dev/)**

## 功能與系統架構

原始網站使用 Cloudflare Workers、D1 資料庫及相關雲端服務，處理帳號、群組、牌局結算、排行榜等功能。

```text
React / TypeScript UI
    ↓ HTTP / JSON
Hono API → 身分與群組權限
    ↓
Application Service → 結算與資料規則
    ↓
Repository → SQL transaction → Database
```

主要程式碼：
- [`src/frontend/flows.tsx`](src/frontend/flows.tsx)：多步驟選人與結算操作。
- [`src/api/index.ts`](src/api/index.ts)：API 路由、授權與請求驗證。
- [`src/application/service.ts`](src/application/service.ts)、[`governance.ts`](src/application/governance.ts)：結算流程與群組權限。
- [`src/domain/rules.ts`](src/domain/rules.ts)：人數、金額、零和等資料規則。
- [`src/persistence/repository.ts`](src/persistence/repository.ts)、[`migrations/`](migrations/)：SQL 與資料結構。

## 工程設計與驗證

多人記分不只需要前端計算，也要防止跨群組操作、重複玩家、不平衡金額和部分資料寫入。後端依群組檢查權限，使用 SQL transaction 維持結算一致性；金額檢查使用安全整數與 BigInt 累計。

[`tests/settlement.integration.test.ts`](tests/settlement.integration.test.ts) 透過 HTTP → Service → SQL 驗證正常結算、排行榜更新、未授權存取、無效金額，以及 SQL 寫入失敗時的整筆回滾。這些測試**只代表公開切片的驗收範圍**，不代表整站功能均已驗證。

開發時我首次接觸 Google 登入驗證及雲端資料服務，主要透過 AI 協作理解技術、討論實作方式並驗收行為；沒有以不存在的使用人數或留存率宣稱成果。

## 公開版本與本機執行

**正式網站與本 Repository 是不同的執行環境。** 正式服務使用 Cloudflare D1；公開版本保留來源 UI、API、Service 及 SQL migrations，新增本機測試入口，改用**記憶體 SQLite 與合成群組資料**。不含正式雲端資料庫、憑證或真實使用者資料。

需要 Node.js 24；本次發布以 24.14.0 驗證：

```powershell
npm.cmd ci --ignore-scripts
npm.cmd run build
npm.cmd test
npm.cmd run dev
```

開啟 `http://localhost:8787/demo/start`，進入合成群組後選擇「離線驗收牌局」進行結算；可用 `600 / -100 / -200 / -300` 測試零和結果。資料僅存在本機記憶體，重啟後重建；服務綁定 `127.0.0.1`，不應對外暴露。

## 已知限制（Known Limitations）

公開版不含可用的 Google OAuth、正式 Cloudflare KV／Durable Object、圖片上傳及 HEIC 處理環境；相關功能即使仍有 UI 入口，也**不代表公開版可完整操作**。圖片及部分娛樂素材未提供。Node SQLite 可能出現 experimental warning；娛樂投影有已記錄的 pre-mutation 警告，沒有列入核心整合驗收。

## 來源與 AI 協作

我負責需求、功能方向、架構討論、規格及驗收；Codex 等 AI 參與技術設計與大量實作。本次公開展示另外由 AI 協助整理、隔離並測試，不等於原始專案的完整程式或驗收結果。

原始來源 Commit：`dac8bf5d2002a8897ba03ad1fbfc620d5deb5ed0`。檔案分類與修改可查閱 [FILE_ORIGINS.csv](FILE_ORIGINS.csv)／[SOURCE_MANIFEST.json](SOURCE_MANIFEST.json)，重現及測試細節見 [docs/VALIDATION.md](docs/VALIDATION.md)。未另行授予開源授權。
