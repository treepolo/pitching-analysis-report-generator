# User Flows

## Canonical workflow decision: block-based long-form editing (2026-08-14)

- Supersede the former fixed-form editor flow; do not expose it as a compatibility mode.
- The editor opens a long-form canvas where the user inserts, edits, reorders, and removes independent text and video blocks. A video block chooses one file or a pair and owns its playback segment/settings.
- Dual-video mode offers side-by-side or stacked layout. Each side is an independent single-video player; the current synchronisation mechanism is removed pending a future design.
- Export derives the referenced asset set from video blocks only, copies those assets into the self-contained folder/ZIP, and never copies unused Media Library assets or mutates originals.

目前狀態：**Phase 1/2 planning**；Architecture 與 GitHub visibility 尚未 human-approved。需求細節見 `PRODUCT_REQUIREMENTS.md`；資料邊界見 `DATA_MODEL.md`；輸出規格見 `REPORT_OUTPUT_SPEC.md`。

## 1. 導航與工作區

桌面主導航：`Projects` → `Project workspace`（`Editor`、`Media Library`、`Preview`、`Export`）→ `Jobs/History`；全域可回到 Projects。行動尺寸的產生器採底部/更多選單，但上述每個正式 capability 都必須有可發現入口。

| Capability | Desktop entry | Narrow/mobile entry | Return path |
|---|---|---|---|
| 專案清單/新建 | 主導航 Projects | Projects tab + primary action | workspace header back |
| 編輯 section/block | workspace Editor | Editor tab；block action sheet | section breadcrumb |
| Media Library | workspace secondary nav | More → Media Library；由插入 block contextual entry | 回到觸發的 section/block |
| Dual-video layout | 雙影片區塊的版面選擇 | block settings → layout | 回到雙影片區塊 |
| Preview | workspace primary tab | Preview tab | 回 Editor 保留 context |
| Export | workspace primary action + Preview action | More/Preview action | Jobs/History |
| Job history/recovery | workspace status + Projects history | More → Jobs | 回到 project/export |
| 設定/支援範圍 | More/Settings | More → Settings | 原頁面 |

## 2. Scenario A：完整報告流程

### Trigger

教練在 Projects 選「新增報告」。

### Action → System response

1. 輸入學生顯示名稱與可選報告標題；系統即時產生 safe filename 預覽，不要求 internal ID 或 sort index。
2. 系統建立預設 section；使用者可保留、刪除、排序或新增 section，低頻欄位放進進階設定。
3. 使用者在 editor 直接寫文字、貼上純文字，或選擇 `.txt`/`.md` import；系統先顯示解析預覽、再寫入可繼續編輯的 blocks。
4. 使用者在 Media Library 匯入多個 MP4/圖片；系統顯示 metadata 與 compatibility/normalization 狀態，長工作建立 job。
5. 使用者在 section/issue 選「插入媒體」；系統只提供該 project 可用的 asset，建立一個獨立 Player Block reference。
6. 單影片區塊直接可播放；雙影片區塊引導選兩個檔名、來源標題與可選循環，沒有第三支影片 UI。
7. 使用者在兩側各自播放、seek、逐幀移動或調整速度；速度可由進度條下方的連續滑桿或數字輸入調整，也可一鍵重設為 1 倍；任一側操作不會改變另一側。
8. 使用者開 Preview；系統使用同一 report model/renderer 顯示 desktop/narrow/mobile viewport。
9. 使用者修改 issue 或 block；autosave 顯示已保存狀態，並保存 media references、播放設定與 export settings。
10. 使用者關閉並重開 project；Projects list 顯示更新時間/未完成 job，重開後內容與引用仍在。
11. 使用者選「輸出資料夾」或「輸出 ZIP/完整交付包」；系統逐 phase 回報、驗證相對路徑/檔案，再顯示結果位置。

### Result

教練得到可繼續管理的 source project，以及可部署/離線保存的 output folder 與 ZIP；source 不被 export 破壞。

### Later management

Projects 可列出、搜尋/篩選（若實作）、開啟、rename、duplicate、delete；刪除 media/project 前揭露 references、job 與資料影響。

## 3. Text import flow

`選擇來源` → `檔案型別與內容預覽` → `匯入 section/block` → `可編輯內容` → `autosave`。失敗時保留原文與錯誤原因，不建立空白假成功；重複匯入須讓使用者看見新增內容，避免靜默覆寫。

## 4. Media flow

`選擇檔案` → `檢查副檔名/大小/讀取權限` → `讀 metadata` → `判斷可直接播放或需 normalized copy` → `可在 Media Library 管理` → `由 block 引用`。刪除被引用 asset 時顯示使用它的 section/block 清單，提供先移除引用、停用或取消刪除。

## 5. Dual-video settings flow

`雙影片區塊` → `選兩個檔名` → `編輯左右來源標題` → `各自設定起點／終點、速度、循環` → `各側獨立播放與逐幀控制` → `autosave`。同步錨點、同步播放與綁定模式目前不在流程內，待未來重新設計。

## 6. Preview/export flow

`Preview` → `viewport switcher` → `互動驗證` → `Export action` → `job phases`（檢查媒體、正規化、建立 assets、產生 HTML、相對路徑驗證、ZIP、完成）→ `folder/zip result`。Export failure 必須指出 phase、可重試與 source 是否安全。

## 7. Error and recovery flow

| Trigger | System response | User result |
|---|---|---|
| missing media | block 顯示 missing 狀態、列出 asset 名稱、禁止成功 export | 可重新指向 asset 或移除 block |
| corrupt/incompatible video | job 轉 normalization/error phase，保留 original | 可 retry/取消；不 fake playable |
| invalid segment/loop | 即時標示 range 與可用值，disable export | 使用者回播放器修正 |
| output path unavailable | 在 export phase 顯示權限/path 錯誤 | 可選其他位置或 retry |
| insufficient disk | 保留 source、顯示已完成 phase/空間需求 | 清理/換位置後 retry |
| cancelled transcode/ZIP | job `CANCELLED`，不標 success | 可重新執行；不留下誤導性完成物 |
| crash/reload | 恢復 autosave 與 job metadata | 使用者確認恢復版本再繼續 |

## 8. Reachability review

- Desktop：Projects、Editor、Media Library、Preview、Export、Jobs、Settings 均可由主導航或 workspace context 進入。
- Mobile/窄螢幕：不要求同時顯示所有 panel，但以 tab、More、bottom sheet、contextual action 提供相同能力；不得隱藏雙影片 controls、frame stepping、loop、export 或 recovery。
- 每個 detail 頁都有返回入口與目前 project/section context；不靠手動 URL。

## 9. 互動成本審查

系統自動推導 metadata、safe filename、sort index、asset reference usage；使用者只在不能可靠推導的地方決策（報告內容、選哪兩支影片、來源標題、輸出位置）。低頻設定採 progressive disclosure，避免把資料模型所有欄位暴露成表單。
