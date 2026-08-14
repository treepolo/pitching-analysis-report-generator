# Implementation Status

## Current Wave 10A/B/C Integrator gate (2026-08-15)

- Actual product tip is `a0fcdb400aa24f36cf430fb23b4e07ef6df370c3` on `worker/desktop-vertical-slice`; Wave 10A UI localization/static gate is PASS for Traditional Chinese user-facing text/accessibility labels with no general English leakage, as reported by the QA gate.
- Fresh evidence: `npm test` 113 total / 112 pass / 1 explicit Electron exported-folder/extracted-ZIP `file://` skip; 35 JavaScript syntax checks; package/lock consistency; `git diff --check`; and tracked artifact/private scan. The Electron skip and worker-reported runtime evidence are not independent product verification.
- Product acceptance remains conditional fail/in progress. Real ffprobe/FFmpeg execution, real media/player/sync/drift, exported folder/ZIP `file://`, responsive human evidence, and AT-A through AT-G remain incomplete or unavailable. No requirement may be marked `VERIFIED`.

## Historical Wave 8D Integrator gate (superseded, 2026-08-15)

- Product checkpoint is `edeaa95a4ebb682e29fadf26d4dc161c49d19499` on `worker/desktop-vertical-slice`, including `5e8b652` media capability discovery, `f478197` export path safety, `7b15f4d` sync hardening, and `edeaa95` honest FFmpeg progress boundaries. The current provenance change is docs-only and follows this product checkpoint.
- Evidence: 108 npm tests / 107 pass / 1 explicit Electron exported `file://` skip; 34 JavaScript syntax checks; package/lock consistency; `git diff --check`; and tracked artifact/private scan. No requirement may be marked `VERIFIED`.
- Product acceptance remains conditional fail/in progress: real ffprobe/FFmpeg, real media/player/sync/drift, exported folder/ZIP `file://`, responsive human evidence, and AT-A through AT-G remain pending or unavailable.

## Historical legacy-player cleanup gate (superseded, 2026-08-15)

- Current HEAD is `cea6472b120fa81be51f03c02162ec0ff7dd6e72` on `worker/desktop-vertical-slice`; unreachable legacy renderer helpers that referenced removed global controls were removed. HTML/CSS and domain contracts were not changed. Origin matches and the worktree is clean.
- Evidence remains: 98 npm tests / 97 pass / 1 explicit Electron exported `file://` skip, 34 JavaScript syntax checks, focused renderer tests 2 pass, `git diff --check`, and a clean stale-global-element scan.
- This cleanup does not promote any requirement to `VERIFIED`; real media/FFmpeg, player/sync/drift, exported `file://`, native picker, responsive human evidence, and AT-A through AT-G remain incomplete.

## Historical Integrator renderer gate (superseded, 2026-08-15)

- Integrated HEAD is `e65240b6aeabd099af8bb24d56d0af7bb75dd82a` on `worker/desktop-vertical-slice`; ancestry includes `2db74bb` UI redesign recovery guidance, `05f442e` CSS, `c4915ff` HTML, and `e65240b` renderer behavior. Origin points to the configured private repository, remote SHA matches, and the worktree is clean.
- Renderer consumer no longer requires the legacy global media/player/preview/section panels at boot. Inline video cards and their per-block controls are delegated from `#block-canvas`; startup and optional DOM elements are guarded. No source contract was changed in this integration gate.
- Evidence: `npm test` 98 total / 97 pass / 1 explicit Electron exported `file://` skip / 0 fail; 34 current `src`/`test`/`scripts` JavaScript files pass `node --check`; focused renderer tests 2 pass; package/lock consistency, `git diff --check`, and private/generated artifact scan pass.
- Electron exported folder/ZIP `file://` runtime is unavailable in this environment, not a pass. Real video/FFmpeg, actual player/sync/drift, native picker/human interaction, responsive human evidence, and AT-A through AT-G remain incomplete. No requirement may be marked `VERIFIED`.

## Canonical scope/architecture decision (2026-08-14)

- The former fixed-form/editor UI is superseded and is not a compatibility mode. Implementation must converge on a block-based long-form editor with many text blocks and independent single/comparison video blocks.
- Dependencies: Report Model/Editor first defines block persistence and migration; Media Pipeline exposes safe project-local assets; Playback/Sync implements block-local time/frame semantics; Renderer/Export consumes the canonical block document and copies only referenced assets; Shell/QA verifies security, recovery, portability, and human acceptance.
- Existing shell, storage, media, sync, and export seams remain reusable only where they satisfy this canonical contract. This docs update does not claim migration or implementation completion.
- QA status remains conservative: no requirement is `VERIFIED`; real video/FFmpeg, real player/sync, export `file://`/ZIP runtime, responsive human evidence, and AT-A through AT-G remain incomplete.

## Historical Wave 5 serial integration provenance (2026-08-14)

- Code checkpoint before this docs reconciliation: `d9541b812e9853f2e9b4a08dddad742c293caeb3`; `bd9d8ee` provides the native picker bridge. Branch is `worker/desktop-vertical-slice`, origin is configured, and the pre-doc worktree was clean.
- Picker parity review passed: main `export:pick-directory` validates trusted sender and project-root realpath containment; preload exposes `pickExportDirectory()` with `null` cancellation; renderer consumes the selected path, falls back safely, shows a display-safe label, and passes the selected directory to `startExport`.
- Fresh regression evidence: 95 total / 94 pass / 1 explicit Electron exported `file://` skip / 0 fail; 33 JS syntax checks; package/lock consistency; `git diff --check`; tracked artifact/security scan; and Electron smoke for persistence/import/block editor/media/player empty/sync fallback/security/responsive/reopen gates.
- Native dialog selection/cancel was not exercised by the headless smoke, and exported folder/ZIP `file://` runtime remains unavailable. These are explicit evidence gaps, not passes. No requirement may be marked `VERIFIED`.
- Remaining blockers: real video/FFmpeg, actual player/sync/drift, native picker/human evidence, exported `file://` runtime, responsive human evidence, and AT-A through AT-G.

## Historical Wave 4 serial integration provenance (2026-08-14)

- Code checkpoint reviewed: `4ba8704421c75d1b57a98afecd2e3340f4e9fc86` on `worker/desktop-vertical-slice`; origin is configured and the pre-doc worktree was clean.
- Integrated ancestry includes `93ffb61`, `56f7159`, `646df8a`, `121d857`, `4f83eb3`, `d31244b`, `dad97d0`, `21a1bd4`, `2278320`, and `4ba8704`.
- Fresh evidence: `npm test` 94 total / 93 pass / 1 explicit Electron exported-folder/extracted-ZIP `file://` runtime skip / 0 fail; 33 JavaScript syntax checks; package/lock consistency; `git diff --check`; tracked artifact/security scan; and Electron smoke covering persistence/import/block editor/media-list/player-empty/sync-fallback/IPC-security/responsive desktop+narrow/export-control/payload-schema/close-flush/reopen.
- The export UI uses the project-root-safe `output` directory because no arbitrary output-folder picker bridge exists; this is a follow-up UX limitation, not arbitrary-folder evidence. No requirement is `VERIFIED`; real video/FFmpeg, actual player/sync, browser `file://`, responsive human, and AT-A through AT-G evidence remain incomplete.

## Historical current provenance snapshot (2026-08-14)

- Current Git state: `4f83eb3161b2b54f3200f5c814cc2e973908c8b9` on `worker/desktop-vertical-slice`; origin is configured at `https://github.com/treepolo/pitching-analysis-report-generator.git`, the remote branch SHA matches, and the worktree is clean.
- Startup provenance: `dfef829` normalized the Windows launcher to ASCII/CRLF label/goto syntax; `5bbd845` added opt-in `disable-gpu`/`in-process-gpu` switches and `app.disableHardwareAcceleration()` before app ready.
- Exact launch verification kept `cmd.exe /d /c call start-pitching-report.bat` alive for more than 16 seconds without GPU fatal; `node --check src/main.js` and `git diff --check` passed. This does not establish full product acceptance.
- Wave 2 integrated ancestry: `93ffb61` block editor, `56f7159` media lifecycle, `646df8a` block-local sync modes, `121d857` referenced-video-only export, and `4f83eb3` parallel governance protocol.
- Current regression evidence: `npm test` 82 total / 81 pass / 1 explicit Electron `file://` runtime skip / 0 fail; 30 JavaScript `node --check`; package/lock consistency; `git diff --check`; Electron smoke with block-editor, persistence/reopen, bridge-security, and responsive-gate assertions; and referenced-asset export tests. The exported `file://` runtime skip remains unavailable evidence, not a pass.
- QA gate: `CONDITIONAL FAIL / IN_PROGRESS`. No requirement may be marked `VERIFIED`.
- Remaining blockers: real video/FFmpeg, real media player/sync, exported `file://`/ZIP runtime, responsive human evidence, and AT-A through AT-G remain incomplete. GitHub Private remote is configured and verified, but requirements remain unverified.

目前狀態：**Implementation in progress**。`bc0e004` 是歷史 Desktop project persistence/editor/preview baseline；Shell/Report Model hardening 在 `35c21a430b5c7a16ea065d542fec71a02c47b81b`，app-facing/player checkpoint 在 `d941b5c`，目前 media/sync/export integration checkpoint 是 `fcaa4a6`。沒有任何完整產品 requirement 可僅因程式存在而標 `VERIFIED`。

## Historical Wave 2 integration gate override

The rows below contain historical checkpoints; this override is the current source for Wave 2 status. The integrated checkpoint is `4f83eb3161b2b54f3200f5c814cc2e973908c8b9` and origin/branch match it.

| Gate | Current status | Current evidence |
|---|---|---|
| Desktop block-editor vertical slice | IN_PROGRESS | `93ffb61` app shell/report model/renderer, `56f7159` media lifecycle, `646df8a` block-local sync, `121d857` referenced-video-only export. |
| Regression and contract checks | IN_PROGRESS | 82 tests / 81 pass / 1 explicit Electron `file://` skip / 0 fail; 30 JS syntax checks; package/lock consistency; diff check; smoke and referenced-set tests. |
| Media/player/sync/export | IN_PROGRESS | Pure seams and security/path checks integrated; real media/FFmpeg, actual player/sync runtime, and exported `file://` runtime remain incomplete or unavailable. |
| GitHub Private remote | CONFIGURED | `origin` is configured and `git ls-remote` matches local HEAD `4f83eb3`. |

No requirement is `VERIFIED`. Human responsive evidence and AT-A through AT-G remain pending.

## Historical gates (superseded by the Wave 2 integration gate override above)

| Gate | Status | Evidence |
|---|---|---|
| Layer 1 / Layer 2 retrofit | IN_PROGRESS | 新版 Layer 1/2 已讀取；舊治理檔已在 cleanup checkpoint 後移除/縮減。 |
| Governance cleanup checkpoint | DONE | `checkpoint/pre-governance-retrofit-2026-08-14` 是 `bc0e004`；cleanup retrofit commit 是 `f92516c`。 |
| Desktop vertical slice | IN_PROGRESS | `VERTICAL_SLICE_SCOPE.md`、`src/`、`test/`、`scripts/`；Shell/Report Model hardening `35c21a4`、app-facing/player `d941b5c`、media/export integration checkpoint `fcaa4a6`。 |
| Syntax/contract/storage checks | IN_PROGRESS | `fcaa4a6` 後 65 pass / 1 skip 的 `npm test`、全部 JS `node --check`、media/export/player targeted 23 pass / 1 skip、package/lock metadata、`git diff --check`；export Electron `file://` skip 保留 unavailable，不提升完整 requirement status。 |
| Media/player/sync/export | IN_PROGRESS | `fcaa4a6` 整合 media contract/tool adapter、project-root path/symlink checks、pure sync/player seam、report-contract allowlist parity、export renderer/layout/ZIP/atomic extraction/runtime-smoke seams；尚無 real-media metadata/FFmpeg execution evidence、真人 player/sync、browser/file:// pass 或 human acceptance evidence。 |
| Responsive/offline/human acceptance | NOT_STARTED | 尚無真人或完整 file:// evidence。 |
| GitHub Private remote | AWAITING_USER_SETUP | 需要帳號授權/外部 remote 設定；目前無 origin。 |

`fcaa4a6` 已整合 owner 的 `src/export/`、`src/media/` 與對應 tests，並保留 `d941b5c` 的 app-facing player/sync scope；這些變更不代表 requirement `VERIFIED`。export Electron `file://` runtime 在目前環境明確回報 unavailable/skip，真實 metadata/FFmpeg 與真人 AT-A～G 仍待後續 owner/human checkpoint。

## Current implementation

- Electron shell、隔離 preload/IPC、project list/create/open/save。
- project-root persistence、autosave/explicit save/close flush/reopen。
- 最小 section editor、renderer-only report contract/preview。
- storage/report-contract tests 與 Electron smoke script。
- media contract/path policy、pure sync domain。
- shared report-contract allowlist parity、export renderer/layout validator、project-root realpath/symlink guards、deterministic ZIP seam 與 fixture tests。
- `.txt`/`.md` import persistence、media register/list/remove seam、read-only signature inspection 與 normalization state contract。
- media tool adapter 的 command/exit-code/output verification-pending seam、ZIP atomic extraction 與 exported-folder Electron file URL runtime smoke（unavailable 狀態保留）。

## Remaining work

依 Maximum Safe Useful Concurrency 平行拆分：TXT/MD import、real Media Pipeline、Playback/Sync runtime、Renderer/Export product acceptance、QA。共用 model/contract 仍由 single writer 管理；每個 scope 必須以實際 tests/evidence 回報，不能把 fixture 或程式存在當成 VERIFIED。
