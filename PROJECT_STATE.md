# Current Project State

Updated: 2026-09-01

## Product

投球報告輸出器是供教練在本機建立投球動作分析報告的 Desktop application。核心結果是可持續編輯的長篇報告，包含文字、圖片、單影片與雙影片，並可輸出成可離線閱讀的 HTML folder 或 ZIP。正式輸出主檔名為 `report.html`。

## Current implementation

- Electron shell 使用隔離 preload／IPC，專案與報告資料保存在專案邊界內。
- 文件編輯器支援多個 section、文字／圖片／單影片／雙影片區塊，以及 autosave、明確儲存、重新開啟與文字匯入。
- 單影片固定為一個播放器；雙影片是兩個各自擁有 side controls 的播放器，可選並排或堆疊。側邊獨立控制不互相傳播；另有 block-level shared controls 會刻意把播放、拖曳、逐幀、速度與循環映射到兩側。
- 單影片 block 與雙影片各 side 已支援純手動逐幀標註圖層：每圖層同一幀最多一點，點只保存 frame index 與影片實際畫面內的 normalized x/y；可有多圖層、名稱／顏色／開始幀／結束幀／個別顯示開關，並可切換點與相鄰標註點連線。標註模式支援滑鼠定位、左鍵或 Space 確認、左右鍵逐幀、Delete 刪除目前幀點、Ctrl/Cmd+Z 復原、Esc 結束；Space 在標註模式不觸發播放。
- 標註後自動前進的 N 幀使用單一數字設定，保存在 project `exportSettings.annotationStepFrames`，關閉與重開產生器後仍由專案 persistence 保存。
- 標註顯示只有「截至目前幀的全部歷史」語意，沒有 trail-length；未來幀的已標點不會提前出現，超過圖層 endFrame 後整個圖層隱藏。同圖層依 frame 排序，把目前可見的相鄰標註點依序連線，不做插值。
- 產生器與輸出 HTML 目前仍包含既有 XP→Windows 7 年代視覺實作與 Tree Polo 品牌樣式；這只描述當前 implementation，不是固定的產品視覺契約。2026-09-01 已解除對特定色盤、漸層、陰影、圓角、材質、年代風格與教學入口顏色的硬性限制，後續可整體重設 visual direction；功能、responsive、keyboard/touch、accessibility 與狀態辨識契約仍維持。
- 輸出 `report.html` 內嵌 CSS／JavaScript，媒體使用相對路徑，不依賴 CDN 或網路。含標註的輸出會額外加入唯讀 SVG overlay；讀者可在本次閱讀中切換點、線與個別圖層，但不會回寫 source project。
- 匯出只攜帶報告區塊實際引用的媒體，保留來源檔案，並提供 folder／ZIP parity、路徑 containment、symlink 防護與原子化復原。

## Deliberate boundaries

- AI 判讀／寫作、登入、CRM、雲端同步、付款、學生互動、醫療診斷與 telemetry 不在目前範圍。
- 逐幀標註目前只做人工點位與視覺軌跡；不做自動物體追蹤、像素速度、真實世界速度、尺度／透視校正或鏡頭運動補償。若未來要加入，需另立需求。
- 舊式同步錨點、綁定模式與相對偏移工作流已退出產品契約；但目前產生器與輸出 runtime 仍保留雙影片共用時間軸、同步點映射與共同循環的有限相容行為，持久化保留 `sync`／`commonSegment`，而非舊 anchor/binding/offset 欄位。若要移除或重做這段行為，必須另立產品與互動決策。
- 真實媒體 codec／FFmpeg、完整 exported `file://` 播放、真人 responsive 與 AT-A～G 驗收仍需分開建立相稱 evidence，不以程式存在視為 VERIFIED。逐幀標註的真人操作、真實媒體 letterbox 座標與 exported `file://` overlay 也仍需相稱 evidence。

## Verification

- 2026-08-31 逐幀標註新增 9 個專項 unit/contract/source tests；本地專項執行結果為 9 pass、0 fail，並已檢查新增 JavaScript syntax。
- 本輪環境無法直接從 GitHub clone 完整 repository，因此尚未在這個執行環境重跑完整 `npm test`；不得把上述 9 個專項測試冒充完整回歸。功能整合後仍需由可取得完整工作樹的環境補跑完整 suite 與 Electron／真實媒體互動驗收。
- 上一次文件記錄的完整 `npm test` evidence：167 tests、166 pass、0 fail、1 個 Electron exported `file://` runtime unavailable skip；這是標註功能加入前的 baseline，不是本輪完整回歸結果。
- 2026-08-30 文件已重新對齊目前 implementation：過時的 `index.html` 輸出稱呼、未核准 Desktop architecture 敘述、早期 vertical-slice「尚無 media/export」敘述與舊 frame-cache export wording 不再作為 current-state 依據。
- 2026-09-01 已完成 visual direction governance 解綁：`UI_UX_SPEC.md` 保留功能／互動／responsive／accessibility 硬契約，`REPORT_OUTPUT_SPEC.md` 不再固定 Tree Polo 綠色主體、藍色教學入口或 XP／Windows 7 等特定美術語言；既有視覺只視為 current implementation，後續改版不需先滿足舊色彩風格。
- GitHub remote `treepolo/pitching-analysis-report-generator` 已存在；repository visibility 為 **Public**，這是使用者為了讓遠端協作／開發可進行而刻意採用的決策，不是設定異常。使用者並已由具本地狀態的 AI 檢查過 repository 無敏感資訊。
- 真實媒體、生成報告、壓縮檔、暫存與本機秘密位於 Git 忽略的本機邊界，不進版本庫。

## Source of truth

產品範圍與狀態以本文件為準；產品需求、架構、UI／流程、資料／媒體、輸出與驗收契約分別見 `PRODUCT_REQUIREMENTS.md`、`ARCHITECTURE.md`、`UI_UX_SPEC.md`、`USER_FLOWS.md`、`DATA_MODEL.md`、`DATA_AND_SYNC.md`、`MEDIA_PIPELINE.md`、`REPORT_OUTPUT_SPEC.md`、`ACCEPTANCE_TESTS.md`。`VERTICAL_SLICE_SCOPE.md` 僅保留作歷史 handoff note，不是目前 implementation-state authority。
