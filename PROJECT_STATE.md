# Current Project State

Updated: 2026-08-30

## Product

投球報告輸出器是供教練在本機建立投球動作分析報告的 Desktop application。核心結果是可持續編輯的長篇報告，包含文字、圖片、單影片與雙影片，並可輸出成可離線閱讀的 HTML folder 或 ZIP。

## Current implementation

- Electron shell 使用隔離 preload／IPC，專案與報告資料保存在專案邊界內。
- 文件編輯器支援多個 section、文字／圖片／單影片／雙影片區塊，以及 autosave、明確儲存、重新開啟與文字匯入。
- 單影片固定為一個播放器；雙影片是兩個獨立播放器，可選並排或堆疊。播放、暫停、拖曳、逐幀、速度與循環狀態不互相傳播。
- 產生器與輸出 HTML 使用 XP→Windows 7 年代視覺語言。輸出 HTML 內嵌 CSS／JavaScript，媒體使用相對路徑，不依賴 CDN 或網路。
- 匯出只攜帶報告區塊實際引用的媒體，保留來源檔案，並提供 folder／ZIP parity、路徑 containment、symlink 防護與原子化復原。

## Deliberate boundaries

- AI 判讀／寫作、登入、CRM、雲端同步、付款、學生互動、醫療診斷與 telemetry 不在目前範圍。
- 舊同步錨點、同步播放、綁定模式與相對偏移欄位已移除；未來若重做，必須先有新的產品與互動決策。
- 真實媒體 codec／FFmpeg、完整 exported `file://` 播放、真人 responsive 與 AT-A～G 驗收仍需分開建立相稱 evidence，不以程式存在視為 VERIFIED。

## Verification

- 最近一次完整 `npm test`：167 tests、166 pass、0 fail、1 個 Electron exported `file://` runtime unavailable skip。
- 最新輸出主題與單影片來源標題列移除已建立並推送 Git checkpoint；本地與遠端分支需維持一致。
- 真實媒體、生成報告、壓縮檔、暫存與本機秘密位於 Git 忽略的本機邊界，不進版本庫。

## Source of truth

產品範圍與狀態以本文件為準；產品需求、架構、UI／流程、資料／媒體、輸出與驗收契約分別見 `PRODUCT_REQUIREMENTS.md`、`ARCHITECTURE.md`、`UI_UX_SPEC.md`、`USER_FLOWS.md`、`DATA_MODEL.md`、`DATA_AND_SYNC.md`、`MEDIA_PIPELINE.md`、`REPORT_OUTPUT_SPEC.md`、`ACCEPTANCE_TESTS.md`。
