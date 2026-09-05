# Architecture Decision Package

## Architecture decision: block-based report document (2026-08-14)

The product architecture treats the block-based long-form editor as canonical and supersedes the former fixed-form/editor configuration. The old UI may remain in Git history but must not be exposed as a compatibility mode.

- Report Model/Editor owns an ordered block document with many text blocks and independent video blocks.
- Media Pipeline owns project-local asset records and safe metadata/normalization states; it does not decide export inclusion globally.
- Playback/Sync owns per-video-block single/comparison playback, in/out settings, source-local time/frame semantics, side-specific controls, and the current limited block-level `sync`/`commonSegment` compatibility seam.
- Renderer/Export traverses video blocks, copies only referenced assets into self-contained folder/ZIP outputs, and never mutates originals or includes unused library assets.
- Shell owns the project-root boundary, IPC/security, persistence/recovery, and job orchestration around these contracts.

### Dependency graph and implementation order

`Report Model/Editor block schema` → `MediaAsset references` → `Playback/Sync block runtime` → `Renderer/Preview contract` → `Referenced-set Export folder/ZIP` → `QA/human acceptance`.

Each downstream owner must consume the upstream canonical contract; no owner may reintroduce fixed-form UI or infer export inclusion from the whole Media Library.

目前狀態：**Desktop architecture APPROVED BY USER（2026-08-14）**，且 desktop shell、project-root persistence、block editor/player、media adapters 與 folder/ZIP export 已有 implementation。2026-09-06 export architecture 已收斂為單一 `src/export/exporter.js` orchestration owner；Tree Polo naming/semantic branding/required assets 由 pure `tree-polo-package.js` helper 提供，舊 branded/refined/canonical exporter wrapper 與 `main-entry.js` monkey-patch 已移除。Shell/framework、native media strategy 與 packaging primitives 仍是可替換的 technical decision；完整真實媒體、recovery、responsive 與真人驗收狀態以 `PROJECT_STATE.md`／`ACCEPTANCE_TESTS.md` 為準，不因架構文字或程式存在而視為 VERIFIED。

## 1. Product drivers

架構必須支援：

- Windows 上教練本人低負擔使用。
- project lifecycle、local persistence、media metadata、VFR/codec normalization。
- directory export、real ZIP、relative paths、file:// offline desktop report。
- single/comparison player、frame stepping、雙影片 shared timeline／frame sync mapping；舊式 relative-time anchor 與 drift-correction 契約不在目前產品範圍。
- responsive online report 與明確 offline capability boundary。
- source media/privacy containment，不上傳學生素材。

## 2. Option A — Local browser-based application

產生器本身以本機瀏覽器執行，依 browser file picker、File System Access API、IndexedDB/OPFS 或等價本機能力存取資料。

優點：

- 初始安裝負擔較低，使用者可直接開啟本地 app。
- web renderer 與線上靜態報告重用度高。
- 跨平台 portability 較好，瀏覽器更新可帶來 runtime 修正。
- sandbox 對任意 filesystem access 有額外保護。

風險與成本：

- directory write、file://、File System Access API 與瀏覽器權限在不同 browser 不一致。
- ZIP 與大型影片 processing 受 memory、worker 與 browser sandbox 限制。
- FFmpeg/WASM 或 codec tooling 可能增加下載、效能與相容性負擔；不應依賴 internet。
- IndexedDB/OPFS 的資料位置與備份管理不如明確 project folder；換 browser／profile 的 recovery 較複雜。
- VFR inspection、normalization、真實 progress 與 cancel/reload job 需要額外 workaround。
- offline generator 自身與 offline report 的 file:// 測試邊界更難覆蓋。

## 3. Option B — Desktop application

產生器以 desktop shell 執行，內嵌 web UI，透過受控 native filesystem/process adapter 管理 project、media、FFmpeg/codec tooling 與 folder/ZIP export。Renderer 仍維持 portable web contract。

優點：

- 可明確控制 project filesystem boundary、directory export 與 ZIP。
- 可呼叫 native media metadata/FFmpeg tooling，較適合 normalization、frame timing、cancel、real progress。
- persistence、job history、crash/reload recovery 與 source preservation 較容易建立在 project files。
- Windows usability 與檔案管理流程較可預期；可將輸出 folder 直接交給使用者。
- generator 與 exported HTML 的 renderer/data contract 仍可共用。

風險與成本：

- 需要安裝、打包、更新與簽章／安全策略；setup burden 高於瀏覽器。
- native bridge 擴大權限面，必須嚴格限制路徑、process args、logs 與 secrets。
- Windows-first testing 與未來跨平台 packaging 會增加工程成本。
- application lifecycle、native dependency、FFmpeg distribution 與 failure recovery 需要整合測試。
- 不可把 desktop shell 當成理由而增加帳號、雲端或超出 scope 的服務。

## 4. Comparison

| Dimension | Local browser | Desktop application | 產品判斷 |
|---|---|---|---|
| local filesystem | browser permission／API 差異 | native adapter 可明確限制 | desktop 優 |
| directory export | browser support 不一致 | 直接建立受控 folder | desktop 優 |
| ZIP generation | web library／memory 限制 | native library／streaming 較穩 | desktop 優 |
| FFmpeg／codec tooling | WASM 重、整合難 | process/native adapter 可控 | desktop 優 |
| persistent projects | browser profile scope | project folder／受控 app data | desktop 優 |
| video metadata | browser exposed data 有限 | native inspection 可完整 | desktop 優 |
| normalization | 受 browser runtime 及 memory 影響 | 可建 long job 與 cancel/retry | desktop 優 |
| setup burden | 較低 | 需 installer | browser 優 |
| update burden | browser/runtime 更新簡單 | 需 packaged update policy | browser 優 |
| Windows usability | 依 browser permission | 檔案流程較自然 | desktop 優 |
| portability | 較高 | shell/OS 需 packaging | browser 優 |
| development complexity | 初期低，media/offline 風險高 | 初期高，核心需求較直接 | desktop 略優 |
| future extensibility | web ecosystem | native integrations 可擴充但需控權限 | 取決於 boundary |
| security | sandbox 較強 | native privilege 需額外 hardening | browser 優；desktop 可治理 |
| testing | cross-browser/file:// 複雜 | native + browser integration | 兩者皆需完整測試 |

## 5. Approved direction

依目前 user job，採 **Desktop application shell + portable web renderer**：

- shell 負責 project filesystem、media pipeline、FFmpeg/native adapter、job persistence 與 export job bridge。
- web layer 負責 editor、preview、player UI 與可重用 report renderer。
- `src/export/exporter.js` 是唯一產品匯出 orchestration owner；`tree-polo-package.js` 只提供命名、semantic branding 與必要品牌資產，`report-renderer`、`report-style-bundler`、`layout-validator`、`zip-archive` 分別維持其單一責任。
- exported report 不依賴 desktop shell；正式成品主檔為 `<safe-report-name>.html`，目前名稱固定追加 `報告by小樹Polo`，並遵守 `REPORT_OUTPUT_SPEC.md` 的 file:// contract。
- application data、internal temporary/cache 與 generated artifacts 必須遵守 `PROJECT_STATE.md`、`DATA_MODEL.md`、`MEDIA_PIPELINE.md` 與 export path policy 定義的安全邊界。

這是使用者已確認的高層方向。實作仍不得加入帳號、雲端 database 或超出 scope 的服務。既有 implementation 應持續維持 shell 與 portable report runtime 的邊界；不得為求方便把 source media、generated report 或 ZIP 放進 Git。

## 6. Human Architecture Checkpoint

狀態：**RESOLVED — Desktop application approved by user on 2026-08-14**。

使用者決定：採 Desktop application。後續以可逆、可測試的 technical decision 維護 shell/framework、native media strategy 與 packaging；不把這些細節冒充新的產品 checkpoint。正式 application data storage 採 `PROJECT_STATE.md` 的 project-root 方案；若未來要改為其他位置，必須同步更新 current state、backup/restore 與 acceptance evidence。
