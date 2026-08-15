# Current Project State

## Current Wave 18A provenance integration (2026-08-15)

- Current implementation tip is `42d2a8a2f427eba02db9cb34cd518cb69d1d558e` on `worker/desktop-vertical-slice`; the clean export collision fix contains only `src/export/exporter.js` and `test/export/app-bridge.test.js`. Local and origin HEAD match before this docs-only checkpoint.
- Repeated folder, ZIP, and complete-package exports now choose deterministic collision-safe names (`name-2`, then `name-3`, and so on) without overwriting prior folders or ZIP files. Existing output remains preserved and temporary staging is cleaned.
- Worker-reported export gate is 41 tests total, 40 pass, and 1 explicit Electron exported-folder/ZIP `file://` unavailable skip. This is domain/regression evidence; no requirement is `VERIFIED`.
- Exported `file://`, native picker, real media/player/sync drift, responsive human evidence, and AT-A through AT-G remain incomplete. Product acceptance remains conditional fail/in progress.

## Historical Wave 17B provenance integration (superseded, 2026-08-15)

- Current implementation tip is `24d3fa53479220a3471a832c6cb364db8574caaa` on `worker/desktop-vertical-slice`; the clean renderer/player commit contains only `src/renderer.js` and `test/renderer-player.test.js`. This docs-only checkpoint does not modify that source/test.
- Worker-reported bounded real-MP4 Electron smoke covered single/comparison file-source loading, metadata, play/pause/seek, unsupported frame-step fallback, time/frame alignment fallback, anchors, drift-seek policy, loop/reverse domain probing, and safe file-source URL hydration through the media bridge.
- Test and cleanup evidence is bounded to that smoke/fixture run. Process cleanup was exercised but does not prove that every Electron/fixture process is absent outside the bounded run; synthetic/VFR probes and exported folder/ZIP `file://` runtime remain separate evidence gaps.
- Real media smoke is not full product acceptance: real player/sync drift, native picker, exported `file://`, responsive human evidence, and AT-A through AT-G remain incomplete. No requirement is `VERIFIED`; product acceptance remains conditional fail/in progress.

## Historical Wave 17A provenance integration (superseded, 2026-08-15)

- Current implementation tip is `5883ac74c545868c6836121013589e06c04b11d6` on `worker/desktop-vertical-slice`; the export layout fix is limited to `src/export/layout-validator.js`, `test/export/layout-validator.test.js`, and `test/export/runtime-smoke.test.js`. The worktree is clean before this docs-only checkpoint.
- Text-only ZIP layout validation now permits folders without empty `videos/` or `images/` directories while still requiring a referenced media root. The runtime regression covers text-only folder output and ZIP extraction; referenced-only media validation remains enforced.
- Worker-reported regression evidence is 40 tests total, 39 pass, and 1 explicit Electron exported-folder/ZIP `file://` unavailable skip. The ignored `.tmp/wave17-real` harness remains untouched and no private/generated artifact is tracked.
- Exported `file://` runtime remains unavailable, and native picker, real player/sync drift, real media acceptance, responsive human evidence, and AT-A through AT-G remain incomplete. No requirement is `VERIFIED`; product acceptance remains conditional fail/in progress.

## Historical Wave 16G provenance integration (superseded, 2026-08-15)

- Current implementation tip is `5f708ff002157385666254031b5e5d8e1c2f310a` on `worker/desktop-vertical-slice`, with `e6a436b`, `df2d429`, and `f9f355b` in its ancestry; local and origin HEAD match before this docs-only checkpoint.
- Real Electron smoke exited 0 after the harness was aligned with the canonical block editor; the earlier legacy-selector false failure was corrected. Smoke evidence reports project open, autosave, explicit save, text import, canonical editor, media list, sync fallback, IPC security, invalid-project handling, responsive desktop/narrow controls, close flush/reopen, and payload-schema preservation as true.
- Worker-reported full regression is 128 npm tests passing with one explicit exported-folder/ZIP `file://` unavailable skip. This records smoke/regression evidence only; the exported `file://` skip is not a pass and native picker interaction was not established.
- Real local media/player/sync drift acceptance, native picker/human interaction, responsive human evidence, and AT-A through AT-G remain incomplete. No requirement is `VERIFIED`; product acceptance remains conditional fail/in progress.

## Historical Wave 16E provenance integration (superseded, 2026-08-15)

- Current implementation tip is `df2d429e3910e6950cf00022ec6b8213e7dab03f` on `worker/desktop-vertical-slice`, with `f9f355b` sync contract coverage and `df2d429` media cancellation cleanup in its ancestry; local and origin HEAD match before this docs-only checkpoint.
- Wave 16A worker evidence records local `ffmpeg`/`ffprobe` `9.0.1` processing of ignored project-local MP4 fixtures, normalization with 46 progress events, original preservation, and cancellation cleanup. The media cancellation implementation waits for child-process close before rejecting, avoiding Windows cleanup races; the fixture media and evidence remain outside Git.
- Wave 16B worker evidence records `f9f355b` synthetic public sync contract coverage: 26/26 focused sync tests and a worker-reported 127 npm tests passing with 1 explicit Electron skip. These are synthetic/worker evidence, not real player or browser acceptance.
- Fresh media scoped checks pass: 34/34 media tests, 8 media JavaScript `node --check` files, and `git diff --check`; no source/test changes are included in this documentation checkpoint. Real Electron/file:// runtime, real player/sync/drift, human responsive evidence, and AT-A through AT-G remain incomplete. No requirement is `VERIFIED`; product acceptance remains conditional fail/in progress.

## Historical Wave 15C provenance integration (superseded, 2026-08-15)

- Current implementation checkpoint is `12283a429d3da786e105dc53a2e587566321bef3` on `worker/desktop-vertical-slice`; this docs-only reconciliation follows the ZIP staging repair commit `12283a4`.
- The repaired sequence is folder export followed by ZIP export using the same output root and report name. `outputKind=zip` now builds the report in a unique temporary staging folder, archives that staging tree, cleans it after success, and preserves an existing successful final folder. `outputKind=folder` retains final-folder collision safety; an existing ZIP remains a safe `EXPORT_VALIDATION_FAILED` error and is never overwritten.
- Fresh export evidence: 33/33 scoped export/bridge/layout tests pass, including text-only and mixed/video folder-to-ZIP and ZIP-to-folder sequences, staging cleanup, ZIP collision behavior, referenced-only assets, and original preservation. Fourteen export JavaScript files pass `node --check`; `git diff --check` and scoped artifact/credential scans pass.
- Electron/file:// runtime and human acceptance were not run in this gate and remain unavailable evidence, not passes. Real MP4/FFmpeg execution, real player/sync/drift, native picker interaction, responsive human evidence, and AT-A through AT-G remain incomplete. No requirement is `VERIFIED`; product acceptance remains conditional fail/in progress.

## Historical Wave 13C Integrator gate (superseded, 2026-08-15)

- Current implementation tip is `c3d136b3cf148a82924d2a6942e9de53f2731a27` on `worker/desktop-vertical-slice`; it is the formal same-content follow-up to `811ac54` for renderer export/picker diagnostics. The preceding export fix is `722f094`, and the worktree is clean before this docs-only checkpoint.
- `722f094` only changes output-destination policy: an absolute, existing-or-creatable directory outside the project root is allowed when its existing ancestors are directories with no symbolic links. Project-local media/source containment, ZIP target containment, realpath checks, referenced-only traversal, and original preservation remain enforced. `c3d136b` only adds user-visible allowlisted error codes/reasons and focused renderer assertions; no export/domain source was changed by that commit.
- Fresh safe scoped evidence: renderer/export/style tests pass `44/44`; `node --check` passes for 37 current JavaScript files; package/lock metadata, `git diff --check`, tracked artifact scan, and credential-pattern scan pass. Electron runtime was not started in this gate; the known exported-folder/ZIP `file://` check remains unavailable/skip evidence, not a pass.
- Three local MP4 files under ignored `projects/` data remain outside Git and were not staged. Real export UI/file:// runtime, real ffprobe/FFmpeg execution, real video/player/sync/drift runtime, native picker/human interaction, responsive human evidence, and AT-A through AT-G remain unavailable or incomplete. No requirement is `VERIFIED`; product acceptance remains conditional fail/in progress.

## Current Wave 12A/B/C Integrator gate (2026-08-15)

- Actual product tip is `f4a59fc302a05a7f156a3fafea40e2ed802407e9` on `worker/desktop-vertical-slice`, including Wave 12A UI commit `f4dc599a18847d961f33d36f6da3e1da5926c200` and this export regression-test commit.
- Wave 12A handoff reports the select-interaction redraw fix with 12/12 focused tests and 120 passing tests plus one Electron `file://` skip. Wave 12B export request evidence is 19/19 for renderer-shaped text-only, video-only, and mixed folder+ZIP jobs; no exporter source bypass was needed.
- Static evidence: 36 current JavaScript files pass `node --check`; package/lock metadata, `git diff --check`, tracked artifact/private scan, and credential-pattern scan pass. A smoke launch failed before UI evidence: `render-process-gone` `launch-failed` exitCode 49 and `ERR_FAILED (-2)` loading the app `file://` page.
- Real export UI/file:// runtime, real ffprobe/FFmpeg execution, real video/player/sync/drift runtime, responsive human evidence, and AT-A through AT-G remain unavailable or incomplete. No requirement is `VERIFIED`; product acceptance remains conditional fail/in progress.

## Historical Wave 8D Integrator gate (superseded, 2026-08-15)

- Product integration checkpoint: `edeaa95a4ebb682e29fadf26d4dc161c49d19499` on `worker/desktop-vertical-slice`; ancestry includes `5e8b652` media capability discovery, `f478197` export path safety, `7b15f4d` sync hardening, and `edeaa95` honest FFmpeg progress boundaries. This provenance update is a docs-only checkpoint following that product tip.
- Fresh regression evidence: `npm test` reports 108 tests, 107 pass, 1 explicit Electron exported-folder/extracted-ZIP `file://` runtime skip; 34 current JavaScript files pass `node --check`; package/lock metadata, `git diff --check`, and tracked artifact/private scan pass.
- Missing real ffprobe/FFmpeg execution evidence, exported `file://` runtime evidence, real video/player/sync/drift runtime, responsive human evidence, and AT-A through AT-G remain unavailable or incomplete. No requirement is `VERIFIED`.

## Historical legacy-player cleanup gate (superseded, 2026-08-15)

- Current HEAD is `cea6472b120fa81be51f03c02162ec0ff7dd6e72` on `worker/desktop-vertical-slice`; it follows the renderer integration checkpoint and removes unreachable legacy global-player helpers without changing HTML/CSS or domain contracts. Origin matches this HEAD and the worktree is clean.
- Regression evidence remains 98 npm tests / 97 pass / 1 explicit Electron exported-folder/extracted-ZIP `file://` runtime skip, 34 JavaScript syntax checks, focused renderer tests 2 pass, and `git diff --check` pass. The legacy global element scan is clean.
- No product requirement is `VERIFIED`; Electron `file://`, real media/FFmpeg/player/sync, native picker, responsive human evidence, and AT-A through AT-G remain incomplete.

## Historical Integrator renderer gate (superseded, 2026-08-15)

- Current integrated checkpoint: `e65240b6aeabd099af8bb24d56d0af7bb75dd82a` on `worker/desktop-vertical-slice`; ancestry includes the UI redesign crash-recovery guide `2db74bb`, document CSS `05f442e`, document HTML `c4915ff`, and renderer inline-player change `e65240b`. Origin is the configured private repository and `git ls-remote` matches the local HEAD; worktree is clean.
- Renderer behavior now boots without requiring legacy `#media-library`, `#player-panel`, `#preview`, `#section-list`, or static player controls; video blocks render inline in `#block-canvas`. Partial-DOM guards cover startup/error, block-canvas delegation, import/save, export, and inline player controls. This is implementation evidence, not product acceptance.
- Fresh regression evidence: 98 npm tests, 97 pass, 1 explicit Electron exported-folder/extracted-ZIP `file://` runtime skip; 34 current JavaScript files pass `node --check`; focused renderer tests pass 2/2; package/lock metadata and `git diff --check` pass; tracked artifact scan shows no private media, generated output, `.tmp`, or environment files.
- Electron `file://` runtime remains unavailable and is not treated as pass. Real MP4/FFmpeg metadata, real player/sync/drift runtime, native picker interaction, responsive human evidence, and AT-A through AT-G remain incomplete. No requirement is `VERIFIED`.

## Canonical scope/architecture decision (2026-08-14)

- The former fixed-form/editor UI is superseded. It must not remain as an in-product compatibility mode; the canonical UI is a block-based long-form editor.
- The canonical document contains many text blocks and independent video blocks. Each video block owns one/pair asset selection, single/comparison mode, layout, in/out/playback settings, and block-local sync.
- Export copies only assets referenced by video blocks into self-contained folder/ZIP outputs; unused Media Library assets are excluded and originals remain untouched.
- Dependency graph: Report Model/Editor defines block schema and persistence; Media Pipeline supplies project-local asset metadata/status; Playback/Sync consumes block-local video configuration; Renderer/Export derives the referenced set and portable output; Shell/QA owns security, recovery, and acceptance gates.
- This is a planning decision only. Existing implementation evidence does not mark any requirement `VERIFIED`.

## Historical Wave 5 serial integration provenance (2026-08-14)

- Code checkpoint before this docs reconciliation: `d9541b812e9853f2e9b4a08dddad742c293caeb3` on `worker/desktop-vertical-slice`; picker bridge commit `bd9d8ee` is in its ancestry, origin matched, and the worktree was clean.
- Native export-folder contract reviewed: trusted main IPC opens an `openDirectory` dialog, validates the selected directory through project-root realpath containment, preload returns a safe string or `null`, and renderer preserves a project-safe default when no folder is selected.
- Fresh evidence: `npm test` reports 95 tests, 94 pass, 1 explicit Electron exported-folder/extracted-ZIP `file://` runtime skip, and 0 failures; 33 JavaScript files pass `node --check`; package/lock metadata, `git diff --check`, and tracked artifact/security scan pass.
- Fresh Electron smoke passes persistence/import/block-editor/media-list/player-empty/sync-fallback/IPC-security/responsive desktop+narrow/reopen assertions. Native folder-dialog selection/cancel was not exercised by headless smoke, and exported `file://` runtime remains unavailable; neither is treated as pass.
- The renderer now displays only a safe folder label, keeps selected output separate from the project default, and does not start a job on picker cancellation. No requirement is `VERIFIED`.
- Remaining blockers: real video/FFmpeg, actual player/sync/drift, native dialog/human folder-picker evidence, exported folder/ZIP browser `file://`, responsive human evidence, and AT-A through AT-G.

## Historical current provenance snapshot (2026-08-14, Wave 4 serial gate)

- Current code checkpoint before this docs reconciliation: `4ba8704421c75d1b57a98afecd2e3340f4e9fc86` on `worker/desktop-vertical-slice`; origin is `https://github.com/treepolo/pitching-analysis-report-generator.git`, the remote branch SHA matched, and the worktree was clean.
- Integrated ancestry includes `93ffb61` block editor, `56f7159` media lifecycle, `646df8a` block-local sync, `121d857` referenced-video-only export, `4f83eb3` parallel governance, `d31244b` player runtime, `dad97d0` media timing/tool seam, `21a1bd4` sync hardening, `2278320` export bridge, and `4ba8704` export UI.
- Fresh evidence: `npm test` reports 94 tests, 93 pass, 1 explicit Electron exported-folder/extracted-ZIP `file://` runtime skip, and 0 failures; 33 JavaScript files pass `node --check`; package/lock metadata, `git diff --check`, and tracked artifact/security scan pass.
- Fresh Electron smoke reports block-editor, persistence/reopen, media-list, player-empty, sync-fallback, IPC-security, payload-schema, close-flush, and responsive desktop/narrow controls including export. This is synthetic/domain smoke evidence, not real-video or human acceptance.
- The export UI uses the project-root-safe `output` directory because no arbitrary output-folder picker bridge exists. This is a follow-up UX limitation, not arbitrary-folder evidence and not fake success.
- QA gate remains `CONDITIONAL FAIL / IN PROGRESS`; no requirement is `VERIFIED`. Real video/FFmpeg, real player/sync, exported folder/ZIP browser `file://`, responsive human evidence, and AT-A through AT-G remain incomplete.

這是本專案跨 Session / Agent 延續所需的最小 current state。治理方向以目前提供的 Layer 1 / Layer 2 為準；不要把本文件擴張成工程 SOP。

## Product

- 產品：供投球教練本人建立投球動作分析報告的 Desktop application。
- 核心結果：可持續編輯的報告專案，包含文字、圖片、單影片與兩影片比較，最後輸出可線上部署與 desktop `file://` 離線閱讀的 HTML folder/ZIP。
- 不做：AI 自動判讀或寫作、登入/會員/CRM/付款、雲端 DB/同步/OAuth、學生互動、醫療診斷、自動部署、Google Drive API、自動寄送與 analytics。

## Decisions and boundaries

- Generator architecture：Desktop shell + portable web renderer；已由使用者確認。
- Project data：`PROJECT_ROOT/projects/<project-id>/`；暫存 `.tmp/`；backup `.backups/`；generated output `output/`。私人素材與產物不進 Git。
- GitHub：預定 Private；目前沒有 `origin`、帳號授權或 push evidence。
- Repository root：`D:\Vibe Coding\投球報告輸出器`。

## Current repository

- Branch：`worker/desktop-vertical-slice`。
- Shell/Report Model implementation handoff commit：`35c21a430b5c7a16ea065d542fec71a02c47b81b fix: harden report shell persistence boundaries`。
- `bc0e004 feat: add desktop project vertical slice` 是歷史 implementation baseline；`f678f2e2c1d6601623a08241dc4789b52b426ccc` 是前一個 provenance reconciliation，並非目前整合 HEAD。
- 目前 code integration checkpoint：`fcaa4a6 feat: integrate media tools and export runtime seams`，承接 app-facing/player checkpoint `d941b5c`，已整合 `src/media/**`、`src/sync/**`、`src/export/**` 及對應 tests。這些 slice 仍只代表可驗證的 contract/domain/export/runtime seam，不代表完整產品驗收。
- Recoverable pre-retrofit tag：`checkpoint/pre-governance-retrofit-2026-08-14`。
- `fcaa4a6` 已納入原先三個 owner 的 dirty/untracked media/export slice；目前 code integration commit 為 `fcaa4a6`，本次 provenance 文件變更另行記錄。私人素材、generated report、ZIP 與 `.tmp` artifacts 未進 Git。
- 本地 checkpoint 可回復被刪除的舊治理檔案。

## Implemented slice

目前已有 Electron shell、隔離 preload/IPC、project list/create/open/save、project-root persistence、autosave/explicit save/close flush/reopen、最小 section editor、`.txt`/`.md` import persistence、media register/list/remove seam、renderer-only report contract/preview、app-facing single/comparison player/sync runtime；另已整合 media contract/path policy、read-only signature inspection、realpath/symlink tool boundary、FFprobe/FFmpeg adapter verification-pending seam，以及帶 allowlist、project-root realpath/symlink boundary、folder/ZIP checksum/parity、atomic extraction、file URL runtime smoke 的 export slice。這些是 implementation 與 automated evidence，不等於所有 requirement 已驗證。

## Not yet complete or not yet verified

- 真實圖片/影片 metadata、normalization 與可播放 media pipeline。
- app-facing Single Video、Comparison Video、sync anchor、逐幀 fallback、不同 FPS/VFR relative-time runtime seam 已存在；real video/frame/drift acceptance 仍未完成。
- self-contained report folder、offline `file://`、ZIP/完整交付包與 export consumer 仍未完成產品驗收；目前有 fixture-based folder/ZIP seam、atomic recovery 與 explicit Electron `file://` runtime check，但該 runtime 在本環境 unavailable 而 skip，沒有 real-media/browser/human acceptance evidence。
- 真實 media ingest/metadata/normalization、FFmpeg、實際 player/anchor/sync 與長片 drift correction 仍未完成。
- responsive 與 Scenario A–G 真人驗收。
- IPC sender/source-frame hardening、project/media symlink realpath containment、tool command/path checks 與 ZIP atomic extraction 已有 focused tests/smoke evidence；完整產品 persistence/recovery acceptance 仍未完成。
- `fcaa4a6` 整合 evidence：65 pass / 1 skip 的 `npm test`、全部 JS `node --check`、media/export/player targeted tests 23 pass / 1 skip、package/lock consistency、`git diff --check`，以及 app Electron smoke。export `file://` runtime skip 明確保留為 unavailable，未冒充 pass。
- 沒有 requirement 可只因程式存在而標 `VERIFIED`。

## Execution

- Main control plane 只做規劃、拆分、調度、驗證與交接；開發工作在可見的 persistent project Worker threads 執行。
- 平行化只限於不共寫的 scope；shared model、shell、renderer contract 使用 single writer，QA 可 read-only 平行。
- Subagent 只作短期輔助；不要用它取代可見的 Worker thread。
- 只有帳號授權、外部登入、真人主觀驗收或使用者重大產品決策才建立 Human Checkpoint。

## Source of truth

- Product/spec facts：`PRODUCT_REQUIREMENTS.md`、`USER_FLOWS.md`、`UI_UX_SPEC.md`、`DATA_MODEL.md`、`DATA_AND_SYNC.md`、`MEDIA_PIPELINE.md`、`REPORT_OUTPUT_SPEC.md`。
- Acceptance/evidence：`ACCEPTANCE_TESTS.md`、`TRACEABILITY_MATRIX.md`、`VERTICAL_SLICE_SCOPE.md`。
- Current implementation status：本文件與實際 Git/source/test evidence；過期敘述不得覆蓋實際 repository。
