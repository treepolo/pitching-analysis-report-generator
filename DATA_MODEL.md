# Data Model

## Canonical model decision: block document and derived export references (2026-08-14)

- `ReportProject` is a long-form ordered document. Sections/regions, where retained for navigation, contain ordered `ContentBlock` instances; the former fixed-form field layout is not canonical and is not a compatibility mode.
- `ContentBlock` is the editing unit. A project may contain many independent text blocks and video blocks. Each video block owns its single/dual selection, and each video side owns its in/out/playback settings.
- `MediaAsset` remains project-scoped reusable source metadata. It never owns block-specific playback state or export inclusion state.
- Export derives `referencedAssetIds` by traversing video blocks in a read-only snapshot. Only those assets receive export copies; originals and unused library assets are untouched and excluded.
- This model decision changes the canonical target only; migration, persistence, and acceptance remain implementation work and are not verified here.

目前狀態：**Phase 2 planning**。Desktop architecture 與 project-root storage direction 已由使用者確認；目前同步資料結構與同步 IPC 已移除，待未來另行設計後再加入本文件。

## 1. Canonical entities

| Entity | 生命週期責任 | 主要 owner | 重要關係 |
|---|---|---|---|
| ReportProject | create/list/open/edit/rename/save/duplicate/delete/reopen | Report Model / Editor | 擁有 sections、media assets、jobs |
| Section | create/edit/reorder/delete | Report Model / Editor | 屬於一個 project |
| ContentBlock | create/edit/reorder/delete | Report Model / Editor | 屬於 section；可為 text、image、single video、dual video |
| MediaAsset | import/inspect/normalize/list/rename/disable/delete | Media Pipeline | 屬於 project，被 blocks reference |
| PlayerBlockConfig | block-local playback / loop / labels | Playback | reference 一或多個 MediaAsset |
| ExportJob | start/progress/cancel/retry/complete/fail/recover | Renderer / Export | 讀取 source project，不改寫 source |
| JobEvent | append-only phase/error/result record | Job owner | 隸屬 ExportJob 或 media job |

## 2. Identity and naming

- 每個 entity 使用系統產生的 opaque internal ID；使用者不輸入、不需理解。
- ReportProject 的 display name 與 filesystem-safe name 分離。
- MediaAsset 的 original display name、normalized display name、輸出檔名分離。
- sort index 由系統根據相鄰項目維護；UI 以 reorder action 表達，不要求填 index。
- 所有 serialized model 必須包含 schema version，升級採明確 migration；已部署 migration 不回頭修改。

## 3. ReportProject

最小語意欄位：

- id、displayName、safeName、optional reportTitle
- createdAt、updatedAt、lastOpenedAt
- schemaVersion
- ordered section references
- project-local media asset references
- export settings
- recovery metadata

Invariant：

- safeName 不得包含 path separator、控制字元或保留名稱衝突。
- export 只讀 project snapshot；source project hash／semantic snapshot 在 export 前後應一致。
- project delete 必須揭露 source、media、jobs 與輸出資料影響。

## 4. Section / ContentBlock

Section 最小語意欄位：

- id、title（可為空）、order、collapsed state（可選）、ordered block references。

ContentBlock 必須以 discriminated type 表示：

- text：結構化 rich text／安全 markup，不接受任意 script。
- image：一個 project-local MediaAsset reference 與可選 caption/alt。
- singleVideo：一個 MediaAsset reference、獨立的區塊 label 與 sourceLabel、playback options、segment loop。
- comparisonVideo（使用者介面稱雙影片）：兩個 side references；每側 filename、source title、segment、playback 與 loop。兩側是獨立的單影片播放器。

空 title、空 optional fields 不應在 export renderer 產生空白 section 或裝飾性 placeholder。

## 5. MediaAsset

最小語意欄位：

- id、projectId、displayName、original source metadata
- original storage reference（source 不覆寫）
- normalized storage reference（可空）
- mediaKind：video 或 image
- duration、resolution、fps/frame timing、codec/container metadata（可未知）
- compatibility：direct、normalized、unsupported、unknown
- lifecycle status：ready、processing、failed、disabled、missing
- reference count／由查詢推導的 usage list

MediaAsset 不得保存 block-specific loop、label 或播放狀態。

## 6. PlayerBlockConfig

PlayerBlockConfig 保存使用情境；同一 MediaAsset 被不同 block 使用時，設定互不污染。雙影片兩側的 PlayerBlockConfig 完全獨立；目前不保存舊同步錨點、相對偏移或綁定模式。

## 7. ExportJob / JobEvent

ExportJob 必須保存：

- id、projectId、kind（folder、zip、complete package）
- createdAt、startedAt、completedAt
- status：queued、running、cancelRequested、cancelled、succeeded、failed、recoverable
- current phase
- processed、total（只有真正有意義時提供）
- success、skipped、failed counts
- warnings、error detail、result locations
- source snapshot/hash 或 semantic comparison evidence reference

JobEvent 是 append-only；不可把取消、失敗覆寫成成功。reload 後可從 persisted job state 顯示結果。

## 8. Lifecycle matrix

| Entity | Create/List/View | Edit | Retry/Recover | Disable/Archive | Delete | History |
|---|---|---|---|---|---|---|
| ReportProject | 必須 | 必須 | recovery | 可選 archive | 必須，含 impact | updated/recovery |
| Section/Block | 必須 | 必須 | 不適用 | 不適用 | 必須 | source revision |
| MediaAsset | 必須 | rename/metadata status | normalization retry | 必須可停用 | 必須含 references | import/job history |
| ExportJob | start/list/view | 不直接編輯 | 必須 retry/recover | cancel | history retention policy | 必須 |

## 9. Persistence and integrity boundary

- 正式 application data storage policy 已決定為 `PROJECT_ROOT/projects/<project-id>/`；技術 adapter、atomic save 與 recovery implementation 尚未開始。
- storage adapter 必須將 project、media references、playback settings、export settings、job metadata 與 recovery state 以可重開方式保存。
- export 不可使用 temporary mutation 破壞 source；中斷時 temporary output 只能留在 PROJECT_ROOT/.tmp 下並可辨識為未完成。
- model read/write 要可測試，不把 UI state 直接當 canonical persisted model。
