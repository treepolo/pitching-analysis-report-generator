# Product Requirements

## Canonical scope decision: block-based long-form editor and referenced-media export (2026-08-14)

This decision supersedes the earlier fixed-form/editor UI configuration. The old visible workflow is historical only and must not remain as an in-product compatibility mode.

- The canonical report is a long-form document made of many ordered text blocks and many independent video blocks. Text-editor features are limited to the content needs of those text blocks; video players are inserted as blocks.
- Each video block independently selects one file or a file pair, supports single/dual mode, and owns its playback segment, in/out range, titles, and playback settings. The layout selector appears only for dual mode.
- Each dual-video side owns its source settings and can be operated independently; the current generator/export runtime also retains a limited shared timeline, sync-point mapping, and common-loop compatibility behavior. The former anchor/binding/relative-offset workflow is not a product contract and must not be expanded without an explicit data/UX decision.
- Export produces `report.html` plus copies of only the media assets referenced by video blocks. Unused Media Library assets are excluded, originals remain untouched, and folder/ZIP outputs are self-contained and offline-capable.
- This scope decision defines the canonical product direction. Requirement status must still follow actual implementation and evidence rather than being inferred from this text.

目前狀態：持續實作與驗證中。Desktop architecture 已由使用者於 2026-08-14 核准；GitHub remote 已建立並持續推送 checkpoint。Repository 目前實際 visibility 為 **Public**，與本文件較早記錄的「使用者希望 Private」不一致；若 Private 仍是目標，這是待使用者處理的 repository-setting mismatch，不得以文件文字假裝已完成。需求 ID 是本專案的穩定 contract；任何實作、測試、驗收與狀態更新都必須回寫 `PROJECT_STATE.md` 與 `ACCEPTANCE_TESTS.md`。

## 1. 產品目的與成功條件

投球教練完成分析文字與影片準備後，能在同一個工具內建立可重開的報告專案、編輯或導入內容、管理媒體、把媒體插入分析段落、建立單影片或雙影片、分別設定兩側播放、預覽學生看到的成品，並一次輸出可部署的靜態資料夾與可永久保存的離線 ZIP。

成功不是「產生一個 HTML」；成功是教練不需改 HTML、不需手算 FPS/offset、不需管理相對路徑或手動壓 ZIP，就能得到可重複編輯、可驗證、可離線保存且可原樣部署的完整報告。

## 2. 使用者與邊界

- 主要使用者：投球教練／分析者本人。
- 學生：只讀輸出報告，不登入本產生器。
- Online static report：支援現代 desktop browser、iPhone/iPad Safari、Android Chrome；支援 responsive、影片、比較、frame controls、touch controls。
- Offline extracted report：正式主要支援 desktop modern browsers 的 `file://`；手機本機 file execution 只記錄「盡可能相容」，不宣稱與 online 完全等價。
- 目前不做：AI 自動判讀/寫作、登入、帳號、權限角色、會員、訂閱、付款、CRM、線上課程、多教練協作、學生留言/chat、medical diagnosis、雲端 database、OAuth、雲端同步、自動部署、Google Drive API、自動寄送、analytics tracking。

## 3. Status 語意

`NOT_STARTED` = 尚未實作；`IN_PROGRESS` = 已開始但未完成；`AWAITING_USER_SETUP` = 等待使用者提供設定/資源；`VERIFIED` = 有相稱的真實 evidence；`DEFERRED` = 明確保留但不在目前里程碑；`NOT_IN_SCOPE` = 明確不做。需要人類高影響決策時可使用 `BLOCKED_HUMAN`；Desktop architecture checkpoint 已解除。任何 repository visibility、遠端或環境事實都應以 GitHub／實際環境 evidence 為準，不以舊 planning 敘述覆蓋現況。

## 4. In-scope requirements

| ID | 可驗證需求 | Acceptance 重點 | Status |
|---|---|---|---|
| PROJ-001 | 可建立、列出、開啟、重新命名、編輯、儲存、複製、刪除與稍後重開 report project。 | Scenario A 走完整 lifecycle；刪除有影響提示。 | NOT_STARTED |
| PROJ-002 | 提供可增刪排序的預設 section 與 block；空 section/block 不強迫填滿。 | 可改模板且 export 只呈現有內容。 | NOT_STARTED |
| PROJ-003 | user display name 與 filesystem-safe project name 分離。 | 不安全字元被轉換並保留可讀顯示名稱。 | NOT_STARTED |
| EDIT-001 | 編輯器支援段落、標題、粗體、清單、引用與連結，不要求使用者寫 HTML。 | Desktop、narrow、mobile 與 keyboard 操作可用。 | NOT_STARTED |
| EDIT-002 | 可貼上純文字及匯入 `.txt`、`.md`，匯入後可繼續編輯。 | Scenario A import 後可修改並持久化。 | NOT_STARTED |
| EDIT-003 | 可將圖片、單影片、雙影片 block 插入指定 section/issue。 | block 位置、排序與 references 可恢復。 | NOT_STARTED |
| MEDIA-001 | 每個 project 有自己的 Media Library，支援 MP4 與常見圖片。 | 匯入、列出、預覽、重新命名、刪除/保護皆可測。 | NOT_STARTED |
| MEDIA-002 | 系統取得顯示名稱、長度、FPS/frame timing、解析度、codec compatibility、normalization 狀態。 | metadata 不要求使用者重填；缺資料顯示原因。 | NOT_STARTED |
| MEDIA-003 | Media Asset 與 Player Block 分離；同一檔案可被多個單／雙影片區塊重複使用。 | 各區塊的 titles/loops 互不污染。 | NOT_STARTED |
| MEDIA-004 | 不支援或 VFR 來源先偵測並可產生 normalized copy；來源不被覆寫。 | Scenario E 有真 progress、原始檔保留與失敗恢復。 | NOT_STARTED |
| PLAYER-001 | Single Video Block 支援 play/pause、seek、playback rate、上一幀/下一幀、fullscreen、可選 loop。 | Scenario B 與 touch/keyboard evidence。 | NOT_STARTED |
| PLAYER-002 | 雙影片區塊支援兩支影片，兩邊各有檔名、來源標題、segment、播放速度與循環；並排／堆疊只在雙影片顯示。 | 寬螢幕左右排、窄螢幕上下排且 controls 可達。 | IN_PROGRESS |
| PLAYER-003 | 同一 block 可顯示合理的媒體缺失、不可播放、超界與 loop validation 狀態。 | 錯誤不會靜默 export。 | NOT_STARTED |
| SYNC-001 | 舊同步錨點工作流不是產品契約；目前僅保留既有雙影片 frame sync point 相容資料。 | 不新增 anchor 編輯流程；既有 sync point mapping 需維持可讀與可恢復。 | DEFERRED |
| SYNC-002 | 舊同步綁定／控制側／相對偏移狀態已移除。 | 儲存、IPC、匯出不得產生舊欄位。 | DEFERRED |
| SYNC-003 | 未來同步語意需由新產品設計明確定義。 | 新方案通過後再建立驗收。 | DEFERRED |
| SYNC-004 | 目前雙影片 runtime 可透過 shared timeline 對兩側播放、seek、逐幀與 loop 做映射；這是既有相容行為，不等同於舊式 drift-correction 產品契約。 | 共同控制與兩側映射可運作；不得新增 anchor/binding/offset workflow。 | IN_PROGRESS |
| SYNC-005 | 未來若支援 frame/time fallback，需另建能力與精度契約。 | 新需求與 fixture/真人 evidence 分開記錄。 | DEFERRED |
| PREVIEW-001 | preview 與 export 共用 renderer/data contract，避免 editor/export 分歧。 | 同一 fixture 的 preview/export structural comparison。 | NOT_STARTED |
| PREVIEW-002 | preview 可檢查 desktop、narrow desktop、mobile width。 | Scenario F 的 layout/controls evidence。 | NOT_STARTED |
| EXPORT-001 | 可輸出包含 `report.html` 與實際被引用的 `videos/`、`images/` 資產的 self-contained folder。 | `file://` 直接開啟且相對路徑通過驗證。 | NOT_STARTED |
| EXPORT-002 | 可將同一 folder 壓成可移動的 ZIP；解壓到任意資料夾仍可用。 | Scenario B 完整離線驗收。 | NOT_STARTED |
| EXPORT-003 | 「完整交付包」同時產生 folder 與 offline ZIP，並回報結果位置。 | 產物樹與檔案 checksum/數量可檢查。 | NOT_STARTED |
| OFFLINE-001 | 輸出報告不依賴 internet、CDN、server API、database、Service Worker 或 runtime fetch 取得必要資料。 | 斷網後以 `file://` 開啟 desktop browser。 | NOT_STARTED |
| OFFLINE-002 | offline support boundary 明確標記 desktop 正式支援、mobile local-file 風險。 | 文件與 UI capability statement 一致。 | NOT_STARTED |
| RESP-001 | 報告與產生器在 desktop wide、narrow、iPhone、Android viewport 無 overlap/水平爆版。 | Scenario F visual evidence。 | NOT_STARTED |
| RESP-002 | responsive 不刪除正式功能；比較 controls、playback、frame controls 在窄螢幕可觸控。 | mobile reachability map 與 touch test。 | NOT_STARTED |
| PERSIST-001 | autosave/explicit save 保存內容、media references、playback settings、export settings，以及既有雙影片 sync/commonSegment 相容資料。 | 關閉/重開後資料一致；舊 anchor/binding/offset 欄位被清除。 | IN_PROGRESS |
| PERSIST-002 | crash/reload recovery 可辨識未完成變更或 job，且不破壞 source project。 | recovery fixture 與 evidence。 | NOT_STARTED |
| PERSIST-003 | export 是 source project 的讀取衍生流程，不改壞原始資料。 | export 前後 canonical model hash/semantic comparison。 | NOT_STARTED |
| ASYNC-001 | import/inspection/normalization/transcode/ZIP/export 依實際耗時建模為 short async 或 persisted long job。 | phase、processed/total、success/skipped/failed 可觀察。 | NOT_STARTED |
| ASYNC-002 | long job 支援 cancel、retry、error detail、結果位置與 reload recovery；禁止假百分比。 | Scenario E/G 含取消與重試。 | NOT_STARTED |
| SEC-001 | 私人影片、專案資料、generated reports、ZIP 不進 Git、不自動上傳第三方、不建立無必要 telemetry。 | secret/sensitive scan 與 log review。 | NOT_STARTED |
| SEC-002 | logs 不記錄私人影片內容；export/file path、檔名與錯誤訊息經安全處理。 | 不洩漏內容/credential 的 negative test。 | NOT_STARTED |
| FS-001 | PROJECT_ROOT 下集中管理 `.worktrees`、`.backups`、`.tmp`；不散落 source copy。 | filesystem policy review。 | NOT_STARTED |
| FS-002 | 正式 application data storage 由 Architecture policy 明確記錄在 project boundary 內。 | 實作後驗證 project data 僅落在 `PROJECT_ROOT/projects/`。 | NOT_STARTED |
| GIT-001 | 使用 local Git 與 `origin` 保存可追溯 checkpoint；目前分支／遠端狀態以實際 repository evidence 為準，不依賴已刪除的舊 orchestrator/integrator 文件。 | branch/head/remote evidence 可查；治理文件無死引用。 | IN_PROGRESS |
| GIT-002 | GitHub repo `treepolo/pitching-analysis-report-generator` 已建立；目前實際 visibility 為 Public。若使用者仍要求 Private，需明確調整 repository setting。 | repository metadata 與使用者最終 visibility 決策一致。 | AWAITING_USER_SETUP |
| GIT-003 | checkpoint／push 不得捏造 evidence；禁止 force push，且 source media、generated report、ZIP、credential 等敏感產物不得進 Git。 | commit/remote evidence 與 sensitive scan 可查。 | IN_PROGRESS |
| QA-001 | Scenario A–G 覆蓋完整流程、offline、重複 asset、不同 FPS、VFR、responsive、error recovery。 | `ACCEPTANCE_TESTS.md` 的 exit criteria。 | NOT_STARTED |
| QA-002 | unit/integration/E2E/visual/真人驗收 evidence 分層；fixture 不冒充真人；無 evidence 不可 VERIFIED。 | `PROJECT_STATE.md` 與 `ACCEPTANCE_TESTS.md` audit。 | NOT_STARTED |
| EDIT-004 | Canonical editor is a block-based long-form canvas; the former fixed-form workflow is not a product mode. | many text/video blocks, reorder, reopen, and focused text editing evidence | NOT_STARTED |
| EXPORT-004 | Export includes only assets referenced by video blocks and copies them without mutating originals. | referenced-set, unused-asset exclusion, folder/ZIP parity evidence | NOT_STARTED |

## 5. Deferred / not in scope

| 能力 | Status | 原因 |
|---|---|---|
| `.docx` import、PDF export | DEFERRED | 需獨立 parser/rendering scope，不在第一階段主流程。 |
| 三支以上同步 UI、進階 annotation、畫線/箭頭 | DEFERRED | 先驗證兩支與可擴充 data model。 |
| 報告主題/品牌模板系統 | DEFERRED | 先維持可讀且可驗收的預設 renderer。 |
| 自動部署特定 hosting、Google Drive API/自動上傳 | NOT_IN_SCOPE | 交付檔案由教練自行部署/上傳。 |
| AI 判讀、AI 寫作、登入、CRM、雲端 DB、付款、chat、醫療診斷、telemetry | NOT_IN_SCOPE | 非核心 user job，需新需求與 human checkpoint 才能改變。 |

## 6. Mandatory reviews

本需求集必須搭配 `USER_FLOWS.md` 的 workflow review、`UI_UX_SPEC.md` 的 UX complexity/reachability review、`DATA_MODEL.md`/`DATA_AND_SYNC.md` 的 lifecycle/dependency review、`MEDIA_PIPELINE.md` 的 async/recovery review、`REPORT_OUTPUT_SPEC.md` 的 offline review、`ACCEPTANCE_TESTS.md` 的 visual/interaction/security review。最新實作與 evidence 摘要由 `PROJECT_STATE.md` 統一提供。
