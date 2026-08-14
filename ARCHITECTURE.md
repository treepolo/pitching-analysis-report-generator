# Architecture Decision Package

目前狀態：**Phase 2 planning / BLOCKED_HUMAN**。本文件比較至少兩個符合產品目標的架構，提出建議但不把建議當成人類批准。正式 implementation、application data storage 與不可逆 framework selection 必須等 checkpoint。

## 1. Product drivers

架構必須支援：

- Windows 上教練本人低負擔使用。
- project lifecycle、local persistence、media metadata、VFR/codec normalization。
- directory export、real ZIP、relative paths、file:// offline desktop report。
- single/comparison player、frame stepping、relative-time sync、drift correction。
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

## 5. Recommendation (not approved)

依目前 user job，建議採 **Desktop application shell + portable web renderer**：

- shell 負責 project filesystem、media pipeline、FFmpeg/native adapter、job persistence、folder/ZIP export。
- web layer 負責 editor、preview、player UI 與可重用 report renderer。
- exported report 不依賴 desktop shell；仍遵守 REPORT_OUTPUT_SPEC 的 file:// contract。
- application data 與 generated output 僅可落在 FILESYSTEM_POLICY 定義的 boundary。

這是風險與產品需求導出的 recommendation，不是已核准架構；不得在 checkpoint 前選定 Tauri/Electron、資料庫、FFmpeg distribution 或 app data 路徑。

## 6. Human Architecture Checkpoint

狀態：**BLOCKED_HUMAN**。

使用者需確認：

1. 採 Local browser-based application，或
2. 採 Desktop application。

若選 Desktop，後續再決定 shell/framework、native media strategy、application data storage 與 packaging；若選 browser，後續再決定 browser capability baseline、storage/export permission strategy 與 normalization feasibility。

Checkpoint 前可繼續：requirements、UX flow、data model、output contract、acceptance fixture planning。Checkpoint 前不可開始依特定架構的 irreversible implementation。
