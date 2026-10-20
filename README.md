# Mahjong Friends

**全端網頁應用（Full-stack Web Application）｜朋友群組的結算與戰績管理**

將朋友的牌局輸贏轉為一致的群組帳本：前端提交結算，後端驗證權限與零和規則，再以 SQL 交易保存結果並更新排行榜。這是個人興趣專案，未宣稱企業 SaaS 交付。


## 需求背景與解法

多人的資料一致性與群組隔離不能只靠前端加總。本展示版沿用實際 React UI、Hono API、Application Service、Repository 與全部原始 SQL migrations，以新的本機入口接上記憶體 SQLite。畫面與 API 使用同一條業務路徑。

## 架構（Architecture）

```text
原始 React / TypeScript UI
          ↓ HTTP / JSON + anonymous cookie
原始 Hono API / Origin check
          ↓ membership authorization
LedgerService / Governance / Domain Rules
          ↓ atomic batch
Repository → SQLite adapter → original SQL migrations
```

正式專案使用 Cloudflare Workers／D1／KV；此候選版不包含雲端帳號、綁定 ID、部署設定或正式資料，也不需要 Cloudflare 登入。群組示範完全在 localhost 進行。

## 本機啟動（Local Demo）

需要 Node.js 24；本輪使用 24.14.0。

```powershell
npm.cmd ci --ignore-scripts
npm.cmd run build
npm.cmd test
npm.cmd run dev
```

開啟 `http://localhost:8787/demo/start`。這會讓瀏覽器取得一次性合成匿名身份，進入合成群組。展開「離線驗收牌局」→ 編輯 → 下一步 → 選四位玩家 → 結算。可輸入 `600 / -100 / -200 / -300`，觀察結算完成與首頁排行。

重新啟動程式即建立新的記憶體資料庫；只監聽 loopback。這不是對外部署入口，請勿公開暴露本機服務。

## 程式閱讀導覽（Code Walkthrough）

| 路徑 | 可檢查的責任 |
|---|---|
| `src/frontend/flows.tsx` | 實際多步驟選人、金額輸入與送出 |
| `src/api/index.ts` | `PUT /api/sessions/:id/settlement`、Origin、cookie 與授權 |
| `src/application/service.ts` | scopedSession、跨群檢查、settle、leaderboard |
| `src/application/governance.ts` | 群組會員與寫入權限 |
| `src/domain/rules.ts` | 至少四人、不重複、安全整數、BigInt 零和 |
| `src/persistence/repository.ts`、`demo/sqlite.ts` | 真實 SQL 與原子 batch／rollback |
| `migrations/` | 實際來源 Schema、索引、CHECK、外鍵及 scope triggers |
| `tests/settlement.integration.test.ts` | HTTP 到資料庫的整合驗收與不合法寫入拒絕 |

## 技術決策與驗證（Technical Decisions & Validation）

金額用 safe integer，總和用 BigInt，避免中間加總失真。先檢查群組範圍，再以同一個 SQL transaction 刪除／寫入結算結果與 audit。驗收同時檢查 HTTP 回應、資料庫保存內容及排行榜，並證明不平衡、重複玩家、跨群玩家、外部使用者、錯誤 Origin、未登入請求不能破壞已保存的結算。另以實際外鍵失敗驗證整個 batch 回滾。

不以測試數代表全站品質；測試範圍與命令見 [VALIDATION](docs/VALIDATION.md)。

## 本人角色與 AI 協作

本作品集由本人選定公開範圍並核准發布。本輪使用 AI 協助讀碼、擷取、建立隔離展示入口、合成資料、測試與文件；來源原碼、調整碼及新建展示碼分別記錄在來源清單。原始專案的精確分工與歷史 AI 使用情形未在本次查核，因此不主張全部獨立手寫、手寫比例、正式部署或完整原系統驗收。

## 邊界與限制（Known Limitations）

本展示版的 Google OAuth 回傳明確拒絕，管理員人員信箱改成保留範例網域；圖片上傳、KV 與 Durable Object 即時同步不在展示範圍。HEIC worker 及受限依賴未公開，HEIC fallback 明確失敗；聽牌圖像素材也未隨附。其餘 UI 仍可能顯示這些功能入口，不代表已通過此展示驗收。Node SQLite 會顯示 experimental warning；另觀察到娛樂投影的 pre-mutation 警告，核心結算與 SQL 驗收通過，未將娛樂功能列為完整驗收。


來源 SHA：`dac8bf5d2002a8897ba03ad1fbfc620d5deb5ed0`。逐檔來源與改動見 [SOURCE_MANIFEST](SOURCE_MANIFEST.json)；新建檔分類見 [FILE_ORIGINS](FILE_ORIGINS.csv)。公開可供閱讀與技術審查；本 repository 未另行授予開源授權。

媒體說明：本次不發布截圖或影片。既有品牌素材因來源未能確認已排除，保留同路徑的本次新建簡單文字標記。新建本機主機與 SQLite adapter 屬隔離展示（Isolated Demo），前端、API、服務與 SQL 的來源見 manifest。
