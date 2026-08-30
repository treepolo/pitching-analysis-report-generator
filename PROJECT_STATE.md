# Current Project State

Updated: 2026-08-30

## Product

投球報告輸出器是供教練在本機建立投球動作分析報告的 Desktop application。核心結果是可持續編輯的長篇報告，包含文字、圖片、單影片與雙影片，並可輸出成可離線閱讀的 HTML folder 或 ZIP。正式輸出主檔名為 `report.html`。

## Current implementation

- Electron shell 使用隔離 preload／IPC，專案與報告資料保存在專案邊界內。
- 文件編輯器支援多個 section、文字／圖片／單影片／雙影片區塊，以及 autosave、明確儲存、重新開啟與文字匯入。
- 單影片固定為一個播放器；雙影片是兩個各自擁有 side controls 的播放器，可選並排或堆疊。側邊獨立控制不互相傳播；另有 block-level shared controls 會刻意把播放、拖曳、逐幀、速度與循環映射到兩側。
- 產生器與輸出 HTML 使用 XP→Windows 7 年代視覺語言。輸出 `report.html` 內嵌 CSS／JavaScript，媒體使用相對路徑，不依賴 CDN 或網路。
- 匯出只攜帶報告區塊實際引用的媒體，保留來源檔案，並提供 folder／ZIP parity、路徑 containment、symlink 防護與原子化復原。

## Deliberate boundaries

- AI 判讀／寫作、登入、CRM、雲端同步、付款、學生互動、醫療診斷與 telemetry 不在目前範圍。
- 舊式同步錨點、綁定模式與相對偏移工作流已退出產品契約；但目前產生器與輸出 runtime 仍保留雙影片共用時間軸、同步點映射與共同循環的有限相容行為，持久化保留 `sync`／`commonSegment`，而非舊 anchor/binding/offset 欄位。若要移除或重做這段行為，必須另立產品與互動決策。
- 真實媒體 codec／FFmpeg、完整 exported `file://` 播放、真人 responsive 與 AT-A～G 驗收仍需分開建立相稱 evidence，不以程式存在視為 VERIFIED。

## Verification

- 最近一次完整 `npm test`：167 tests、166 pass、0 fail、1 個 Electron exported `file://` runtime unavailable skip。
- 最新輸出主題與單影片來源標題列移除已建立並推送 Git checkpoint；本地與遠端分支需維持一致。
- 2026-08-30 文件已重新對齊目前 implementation：過時的 `index.html` 輸出稱呼、未核准 Desktop architecture 敘述、早期 vertical-slice「尚無 media/export」敘述與舊 frame-cache export wording 不再作為 current-state 依據。
- GitHub remote `treepolo/pitching-analysis-report-generator` 已存在；目前 repository metadata 顯示 visibility 為 **Public**。若使用者仍要求 Private，需另行調整 repository setting，不能以文件文字視為已完成。
- 真實媒體、生成報告、壓縮檔、暫存與本機秘密位於 Git 忽略的本機邊界，不進版本庫。

## Source of truth

產品範圍與狀態以本文件為準；產品需求、架構、UI／流程、資料／媒體、輸出與驗收契約分別見 `PRODUCT_REQUIREMENTS.md`、`ARCHITECTURE.md`、`UI_UX_SPEC.md`、`USER_FLOWS.md`、`DATA_MODEL.md`、`DATA_AND_SYNC.md`、`MEDIA_PIPELINE.md`、`REPORT_OUTPUT_SPEC.md`、`ACCEPTANCE_TESTS.md`。`VERTICAL_SLICE_SCOPE.md` 僅保留作歷史 handoff note，不是目前 implementation-state authority。
