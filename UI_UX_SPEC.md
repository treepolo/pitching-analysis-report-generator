# UI / UX Specification

## Canonical UI/UX decision: block-based long-form editor (2026-08-14)

The previous fixed-form/editor configuration is superseded and must not remain as a visible compatibility workflow.

- The primary Editor surface is a long-form block canvas, not a fixed report form. Users can add, edit, reorder, duplicate, and remove many text blocks and many independent video blocks.
- Text blocks expose only necessary text-editor features. Video blocks expose filename selection, single/dual mode, per-side titles, per-side in/out/playback settings, and explicit state when media is unavailable.
- Single-video blocks always use one stacked player card; no layout selector is shown. Dual-video blocks expose `並排` (two columns in one row) or `堆疊` (one column); each side owns an independent player surface while the current runtime also exposes a limited shared timeline/sync-point control row. The former anchor/binding/relative-offset workflow is not a new UX contract.
- Preview and export consume the same canonical block document. Export UI must communicate that only video-block-referenced assets are copied; unused library assets and originals remain outside the output.

目前狀態：本文件仍是 canonical UI/UX contract。Desktop application 高層架構已由使用者於 2026-08-14 核准；目前已有 Electron generator 與 block-based editor/player/export implementation，但 visual、responsive、touch、完整 E2E 與真人 evidence 仍依 `PROJECT_STATE.md`／`ACCEPTANCE_TESTS.md` 判定，不因本文件描述或程式存在而視為已驗證。

## 1. UX 目標與約束

- 主要使用者是投球教練／分析者本人；學生只閱讀輸出報告。
- 使用者的工作核心是分析內容，不是管理 HTML、FPS、offset、相對路徑、codec 或 ZIP。
- 系統自動推導 internal ID、safe filename、sort index、媒體 metadata 與 asset reference usage。
- 空欄位不在報告中顯示；低頻能力採 progressive disclosure。
- 不能因 responsive 版面而刪除雙影片、逐幀、loop、export 或 recovery 能力。
- UI 不得加入登入、帳號、雲端同步、AI 判讀、學生互動或其他 NOT_IN_SCOPE 能力。

## 2. 導航與 Reachability Map

| Capability | Desktop entry | Narrow/mobile entry | Return path | 必須驗證 |
|---|---|---|---|---|
| Projects list / create | 主導航 Projects | Projects tab + primary action | workspace header back | 可列出、開啟、新建 |
| Editor | workspace primary tab | Editor tab | section breadcrumb | section/block 可管理 |
| Media Library | workspace secondary nav | More → Media Library 或插入媒體的 contextual entry | 回到觸發 section/block | project scope 不混用 |
| Dual-video layout | 雙影片區塊的版面選擇 | block settings → layout | 回到雙影片區塊 | 並排／堆疊可達 |
| Preview | workspace primary tab | Preview tab | 回 Editor 保留 context | viewport 可切換 |
| Export | workspace action + Preview action | More/Preview action | Jobs/History | folder、ZIP、完整包皆可達 |
| Jobs / History | workspace status + Projects history | More → Jobs | 回到 project/export | 可看狀態、錯誤、重試 |
| Settings / support boundary | More / Settings | More → Settings | 原頁面 | 明確宣告 offline 邊界 |

任何正式 capability 只能靠直接輸入 URL 才能進入，視為 reachability defect。

## 3. 主要畫面與責任

### Projects

- 顯示 project display name、更新時間、未完成 job 與可用 actions。
- 建立時只詢問學生顯示名稱與可選報告標題；safe filename 顯示為預覽，不要求 internal ID。
- rename、duplicate、delete 都必須可由清單管理；刪除前顯示 media references、job 與 source data 影響。

### Project workspace

- 使用 Editor、Media Library、Preview、Export、Jobs 的 context preserving navigation。
- header 顯示目前 project 與 save state；返回 Projects 不丟失 context。

### Editor

- 可增刪排序 section 與 block；預設 section 可調整，不強迫全部保留。
- 文字 block 支援段落、標題、粗體、清單、引用、連結；使用者不需寫 HTML。
- import 先顯示內容預覽，再建立可繼續編輯的 block；失敗保留原文與錯誤，不建立空白假成功。
- 媒體插入由 block action 開始，只提供目前 project 可用的 asset。

### Media Library

- 顯示名稱、預覽、長度、FPS/frame timing、解析度、codec compatibility、normalization 狀態。
- 被引用 asset 刪除前顯示使用它的 section/block 清單；提供移除引用、停用或取消刪除。
- 原始檔與 normalized copy 角色分離，來源不可被 normalization 覆寫。

### Dual-video block

- 只提供兩支影片的明確左右／上下排列，不暴露任意 N 支影片 UI。
- 每側完整提供單影片播放器的播放、seek、上一幀、下一幀、速度與循環控制；速度以進度條下方的連續對數滑桿、數字輸入與 1 倍重設按鈕呈現，範圍為 1/64×–64×。超出瀏覽器原生 `HTMLMediaElement` 範圍時，編輯器改用擴充速度時鐘，不把不支援的值直接寫入影片元素；任何 side-specific 操作都不會控制另一側。
- block-level shared controls 是另一組刻意的共同控制，依既有 `sync`／`commonSegment` 相容映射共同播放、seek、逐幀、速度與循環；這不授權恢復舊 anchor/binding/offset UX。
- 來源選擇以檔名呈現，來源標題直接綁定該側播放器標題；區塊標題直接綁定卡片左上角標題。

### Preview / Export / Jobs

- Preview 與 export 共用 renderer/data contract。
- Preview 至少提供 desktop wide、narrow desktop、mobile width。
- Export 顯示 phase、result location、warnings/errors；長工作可取消、重試、reload recovery。

## 4. 主要 workflow 的互動成本決策

| Workflow | 系統承擔 | 使用者真正決策 | 失敗／恢復 |
|---|---|---|---|
| 建立 project | internal ID、safe filename、預設 sections、sort index | display name、可選 title | 不安全名稱即時預覽轉換 |
| Text import | 副檔名檢查、解析預覽、block 建立 | 是否匯入、插入位置 | 保留原文、顯示原因、避免靜默覆寫 |
| Media import | metadata、compatibility 判斷、normalized copy、job 狀態 | 選檔案、是否採用結果 | retry/cancel，original 保留 |
| Insert media | asset filtering、reference 建立 | 選哪個 asset、插入位置 | missing asset 顯示影響 |
| Edit dual-video side | 來源檔名、來源標題、起點／終點、速度、循環 | 每側要使用的影片與播放設定 | missing media 或超界區段即時標示 |
| Preview | renderer、viewport layout、capability statement | viewport、是否回編輯 | preview 不修改 source |
| Export | assets、relative paths、HTML、ZIP、驗證 | 輸出位置與形式 | phase error、retry、source safety |

## 5. Field Necessity Audit

| 欄位／設定 | 建立時必要 | 可推導／可預設 | 可後補／進階 | UX 決策 |
|---|---:|---|---|---|
| 學生顯示名稱 | 是 | 不可可靠推導 | 否 | primary field |
| 報告標題 | 否 | 可用合理預設 | 是 | optional field |
| internal ID | 否 | 系統產生 | 否 | 不暴露 |
| filesystem-safe name | 否 | 由 display name/title 推導 | 可在進階調整 | 顯示預覽 |
| section sort index | 否 | 系統維護 | 否 | drag-and-drop |
| issue schema 欄位 | 否 | 空欄位省略 | 是 | progressive disclosure |
| media metadata | 否 | 由檔案讀取 | 只讀 | 不要求重填 |
| playback FPS / offset | 否 | 由媒體／播放器推導 | 不作手打欄位 | 不在目前表單暴露 |
| dual-video side titles | 否 | 可由檔名預設 | 是 | 只有有意義時編輯 |
| loop range | 否 | 未設定即整段播放 | 是 | player contextual control |
| export path | 執行時必要 | 無安全預設 | 否 | 在 export action 決定 |

## 6. Responsive 與輸入方式

| Context | Layout | 控制項要求 | Evidence |
|---|---|---|---|
| Desktop wide | 多欄、雙影片左右 | keyboard、mouse、可讀 metadata | visual + interaction |
| Narrow desktop | 可折疊 panel、雙影片上下 | 不水平爆版，所有 controls 可達 | visual + keyboard |
| Phone / tablet generator | tab、More、bottom sheet、contextual action | touch target、返回路徑、不得藏 capability | reachability + touch |
| Online report | responsive report layout | playback、雙影片、frame controls | E2E + visual |
| Offline file report | desktop-first | 明確顯示 mobile local-file boundary | file:// evidence |

Keyboard 必須支援 focus order、Enter/Space action、Esc 關閉 sheet/dialog、可見 focus；touch 不依賴 hover。所有 busy、empty、error、success 狀態都要可理解。

## 7. Accessibility / State Requirements

- 按鈕名稱表達 action，不只使用 icon。
- disabled control 說明原因；missing media、超界區段與 export blocker 不得只用顏色。
- loading state 說明目前 phase；不得以無語意的假百分比冒充 progress。
- empty state 提供下一個合理 action。
- error state 指出 phase、影響、可否 retry/cancel 與 source 是否安全。
- save state 區分未儲存、儲存中、已儲存與 recovery pending。

## 8. UX Review Status

| Review | 狀態 | 證據 |
|---|---|---|
| UX complexity / field audit | DONE（規格審查） | 本文件第 4–5 節 |
| Lifecycle review | DONE（需求層） | `DATA_MODEL.md`、`PRODUCT_REQUIREMENTS.md` |
| Reachability review | DONE（規格審查） | 本文件第 2、6 節 |
| Visual / interaction review | PLANNED | 需完整 E2E／responsive／真人 evidence |
| Architecture-dependent interaction review | RESOLVED | Desktop application 高層方向已於 2026-08-14 核准；見 `ARCHITECTURE.md` |
