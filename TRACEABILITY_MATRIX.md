# Traceability Matrix

## Canonical scope/architecture decision (2026-08-14)

- The former fixed-form editor is superseded and is not a product compatibility mode. The canonical target is a block-based long-form editor with many text blocks and independent single/comparison video blocks.
- Export inclusion is derived from video-block references only; unused Media Library assets are excluded and originals remain untouched.
- The new target is planning scope only. Existing rows remain conservative and no requirement is `VERIFIED`.

## Wave 5 serial integration provenance (current, 2026-08-14)

- Code checkpoint before this docs reconciliation: `d9541b812e9853f2e9b4a08dddad742c293caeb3`; `bd9d8ee` adds the secure native output-directory picker bridge. Branch is `worker/desktop-vertical-slice`, origin is configured, and the pre-doc worktree was clean.
- Contract evidence: main trusted picker IPC returns only a project-root-contained directory or `null`; preload validates the returned value; renderer uses the selected directory or project-safe default, shows only a basename label, and does not start export when cancelled.
- Fresh evidence: 95 tests / 94 pass / 1 explicit Electron `file://` skip / 0 fail; 33 JS syntax checks; package/lock, diff, artifact/security checks; and Electron smoke for block editor, persistence/reopen, player/sync fallback, bridge security, responsive controls, and export control.
- Native folder-dialog interaction was not exercised by headless smoke; exported folder/ZIP `file://` runtime remains unavailable. Real video/FFmpeg/player/sync/drift, responsive human evidence, and AT-A through AT-G remain unresolved. No requirement row is `VERIFIED`.

## Wave 4 serial integration provenance (current, 2026-08-14)

- Code checkpoint reviewed: `4ba8704421c75d1b57a98afecd2e3340f4e9fc86` on `worker/desktop-vertical-slice`; origin is configured and the pre-doc worktree was clean.
- Integrated ancestry includes `93ffb61`, `56f7159`, `646df8a`, `121d857`, `4f83eb3`, `d31244b`, `dad97d0`, `21a1bd4`, `2278320`, and `4ba8704`.
- Cross-lane review: renderer export calls the allowlisted preload job bridge; main re-reads the saved canonical project; player source resolution stays behind the safe media bridge; sync consumes per-source timing metadata; exporter traverses only canonical video blocks and stages only referenced assets.
- Evidence: 94 tests / 93 pass / 1 explicit Electron `file://` skip / 0 fail; 33 JavaScript syntax checks; package/lock consistency; `git diff --check`; artifact/security scan; and fresh Electron smoke for block editor, persistence/reopen/security, player/sync fallback, responsive desktop+narrow controls, and export control.
- The export UI uses the project-root-safe `output` directory because no arbitrary output-folder picker bridge exists. This is follow-up UX, not arbitrary-folder evidence. Real video/FFmpeg, browser `file://`, responsive human evidence, and AT-A through AT-G remain unresolved; no requirement row is `VERIFIED`.

## Latest current provenance (2026-08-14)

- Current Git state: `4f83eb3161b2b54f3200f5c814cc2e973908c8b9` on `worker/desktop-vertical-slice`; origin is configured at `https://github.com/treepolo/pitching-analysis-report-generator.git`, the remote branch SHA matches, and the worktree is clean.
- Latest startup revisions: `dfef829` normalized the Windows launcher to ASCII/CRLF label/goto syntax; `5bbd845` added opt-in `disable-gpu`/`in-process-gpu` switches and `app.disableHardwareAcceleration()` before app ready.
- Exact launch verification kept the batch-launched Electron process alive for more than 16 seconds without GPU fatal; `node --check src/main.js` and `git diff --check` passed. These results do not change any requirement row to `VERIFIED`.
- Evidence provenance: Wave 2 regression reports 82 tests, 81 pass, 1 explicit Electron `file://` runtime skip, 0 failures; 30 JavaScript `node --check`; package/lock consistency; `git diff --check`; Electron smoke with block-editor/persistence/reopen/security gates; and referenced-video-only export tests. The `file://` runtime skip is unavailable evidence, not a pass.
- QA gate: `CONDITIONAL FAIL / IN_PROGRESS`.
- Integrated ancestry: `93ffb61` block editor, `56f7159` media lifecycle, `646df8a` block-local sync modes, `121d857` referenced-video-only export, and `4f83eb3` governance protocol. Unresolved evidence remains real video/FFmpeg, real media player/sync, exported `file://`/ZIP runtime, responsive human evidence, and AT-A through AT-G. GitHub Private remote is configured and verified; no requirement is `VERIFIED`.

目前狀態：**Phase 1/2 planning + implementation in progress**。本矩陣是 Requirement → Artifact → Test/Acceptance → Evidence → Status 的唯一追蹤入口。`fcaa4a6` 已提供部分 implementation/unit/fixture evidence，但沒有任何 requirement 因此改標 `VERIFIED`，也沒有 real-media、browser/file:// pass 或真人 evidence。

## Current integration checkpoint

The historical checkpoint text below is superseded by this current Wave 2 reconciliation:

- Revision: `4f83eb3161b2b54f3200f5c814cc2e973908c8b9` (`docs: define safe parallel development protocol`) after serial integration of `93ffb61`, `56f7159`, `646df8a`, and `121d857`.
- Integrated scope: canonical block editor/report model, project-local media lifecycle, block-local sync semantics, report-contract allowlist parity, referenced-video-only export traversal, path/symlink guards, and deterministic folder/ZIP seams.
- Evidence: 82 tests / 81 pass / 1 explicit Electron `file://` skip / 0 fail; 30 JS syntax checks; package/lock consistency; `git diff --check`; Electron smoke block-editor/persistence/reopen/security gates; and export referenced-set tests. The exported `file://` runtime remains unavailable.
- Remaining product scope: real metadata/FFmpeg, actual player/anchors/sync runtime, exported folder/ZIP `file://` evidence, responsive human acceptance, and AT-A through AT-G. Requirement rows remain conservative and not `VERIFIED`.

- Revision：`fcaa4a6 feat: integrate media tools and export runtime seams`（承接 app-facing/player checkpoint：`d941b5c`）。
- Integrated scope：media contract/tool adapter/path and symlink checks、pure sync/player seam、shared report-contract allowlist parity、export renderer/layout/ZIP/atomic extraction/runtime-smoke seam，以及 project-root boundary tests。
- Evidence：65 pass / 1 skip 的 `npm test`、全部 JS `node --check`、media/export/player targeted 23 pass / 1 skip、package/lock consistency、`git diff --check` 與 app Electron smoke。export Electron `file://` runtime unavailable 的 skip 未轉為 pass。
- Remaining product scope：real metadata/FFmpeg、real browser player/anchors/sync、完整 export/browser `file://` pass evidence、responsive human acceptance、完整 AT-A～G；所有 requirement rows 維持原狀。

| Requirement | Canonical artifact / owner | Test / acceptance | Evidence required | Status |
|---|---|---|---|---|
| PROJ-001 | DATA_MODEL、UI_UX_SPEC / Report Model | AT-A | project lifecycle E2E + reopen evidence | NOT_STARTED |
| PROJ-002 | DATA_MODEL、UI_UX_SPEC / Report Model | AT-A、AT-F | section/block reorder and empty-state evidence | NOT_STARTED |
| PROJ-003 | DATA_MODEL、UI_UX_SPEC / Report Model | AT-A | unsafe-name conversion evidence | NOT_STARTED |
| EDIT-001 | UI_UX_SPEC / Report Model | AT-A、AT-F | rich text keyboard/mobile evidence | NOT_STARTED |
| EDIT-002 | UI_UX_SPEC / Report Model | AT-A | txt/md import, edit, persistence evidence | NOT_STARTED |
| EDIT-003 | DATA_MODEL、UI_UX_SPEC / Report Model | AT-A、AT-F | block placement/reference evidence | NOT_STARTED |
| MEDIA-001 | MEDIA_PIPELINE、DATA_MODEL / Media owner | AT-A、AT-E | import/list/preview/manage evidence | NOT_STARTED |
| MEDIA-002 | MEDIA_PIPELINE / Media owner | AT-A、AT-E | real metadata and unknown-state evidence | NOT_STARTED |
| MEDIA-003 | DATA_MODEL、DATA_AND_SYNC / Playback owner | AT-C | repeated asset isolation evidence | NOT_STARTED |
| MEDIA-004 | MEDIA_PIPELINE / Media owner | AT-E、AT-G | VFR detection, normalized copy, original preservation | NOT_STARTED |
| PLAYER-001 | DATA_AND_SYNC、UI_UX_SPEC / Playback owner | AT-A、AT-B、AT-F | play/seek/rate/frame/fullscreen/loop interaction | NOT_STARTED |
| PLAYER-002 | DATA_MODEL、UI_UX_SPEC / Playback owner | AT-A、AT-B、AT-F | two-side layout and controls evidence | NOT_STARTED |
| PLAYER-003 | DATA_MODEL、DATA_AND_SYNC / Playback owner | AT-G | missing/unplayable/range validation evidence | NOT_STARTED |
| SYNC-001 | DATA_AND_SYNC / Playback owner | AT-A、AT-D | real anchor capture frame/time evidence | NOT_STARTED |
| SYNC-002 | DATA_MODEL、DATA_AND_SYNC / Playback owner | AT-C | block-local anchor isolation evidence | NOT_STARTED |
| SYNC-003 | DATA_AND_SYNC / Playback owner | AT-D | different FPS relative-time evidence | NOT_STARTED |
| SYNC-004 | DATA_AND_SYNC / Playback owner | AT-B、AT-D | long-play drift correction evidence | NOT_STARTED |
| SYNC-005 | DATA_AND_SYNC、MEDIA_PIPELINE / Playback + Media | AT-E | VFR/incompatible fallback precision evidence | NOT_STARTED |
| PREVIEW-001 | REPORT_OUTPUT_SPEC / Renderer owner | AT-A | preview/export structural comparison | NOT_STARTED |
| PREVIEW-002 | UI_UX_SPEC、REPORT_OUTPUT_SPEC / Shell + Renderer | AT-F | desktop/narrow/mobile preview evidence | NOT_STARTED |
| EXPORT-001 | REPORT_OUTPUT_SPEC / Renderer owner | AT-A、AT-B | self-contained folder and file:// evidence | NOT_STARTED |
| EXPORT-002 | REPORT_OUTPUT_SPEC / Renderer owner | AT-B | ZIP extraction and arbitrary-folder evidence | NOT_STARTED |
| EXPORT-003 | REPORT_OUTPUT_SPEC / Renderer owner | AT-A | folder + ZIP tree/checksum/result evidence | NOT_STARTED |
| OFFLINE-001 | REPORT_OUTPUT_SPEC / Renderer owner | AT-B | offline file:// network isolation evidence | NOT_STARTED |
| OFFLINE-002 | REPORT_OUTPUT_SPEC、UI_UX_SPEC / Renderer + UX | AT-B、AT-F | support-boundary statement and test evidence | NOT_STARTED |
| RESP-001 | UI_UX_SPEC、REPORT_OUTPUT_SPEC / Shell + Renderer | AT-F | four viewport visual evidence | NOT_STARTED |
| RESP-002 | UI_UX_SPEC、DATA_AND_SYNC / Shell + Playback | AT-F | touch reachability and capability map | NOT_STARTED |
| PERSIST-001 | DATA_MODEL、DATA_AND_SYNC / Report Model | AT-A | autosave/reopen references/anchors/settings | NOT_STARTED |
| PERSIST-002 | DATA_MODEL、OPERATIONS / Report Model | AT-G | crash/reload recovery fixture evidence | NOT_STARTED |
| PERSIST-003 | DATA_MODEL、REPORT_OUTPUT_SPEC / Renderer | AT-A、AT-B | pre/post export semantic comparison | NOT_STARTED |
| ASYNC-001 | MEDIA_PIPELINE、DATA_MODEL / Job owners | AT-A、AT-E | phase and processed/total evidence | NOT_STARTED |
| ASYNC-002 | MEDIA_PIPELINE、DATA_MODEL / Job owners | AT-E、AT-G | cancel/retry/error/reload result evidence | NOT_STARTED |
| SEC-001 | PROJECT_STATE、.gitignore | AT-SEC | secret/sensitive scan and Git review | NOT_STARTED |
| SEC-002 | MEDIA_PIPELINE、OPERATIONS | AT-SEC、AT-G | redacted log and credential negative test | NOT_STARTED |
| FS-001 | PROJECT_STATE | storage review | boundary and containment review | NOT_STARTED |
| FS-002 | ARCHITECTURE、PROJECT_STATE | implementation storage review | project-root storage evidence | NOT_STARTED |
| GIT-001 | PROJECT_STATE | local checkpoint | local Git/branch state review | NOT_STARTED |
| GIT-002 | PROJECT_STATE | external setup | Private remote evidence | AWAITING_USER_SETUP |
| GIT-003 | PROJECT_STATE | checkpoint/final gate | push, scan and no-force-push evidence | NOT_STARTED |
| QA-001 | ACCEPTANCE_TESTS | AT-A through AT-G | complete scenario evidence | NOT_STARTED |
| QA-002 | ACCEPTANCE_TESTS、TRACEABILITY_MATRIX | final gate | layered test/evidence/status audit | NOT_STARTED |

| EDIT-004 | PRODUCT_REQUIREMENTS、UI_UX_SPEC、DATA_MODEL / Report Model | planned block-editor acceptance | many text/video blocks, reorder, reopen, focused text editing | NOT_STARTED |
| EXPORT-004 | PRODUCT_REQUIREMENTS、REPORT_OUTPUT_SPEC、MEDIA_PIPELINE / Renderer + Export | planned referenced-set acceptance | unused-asset exclusion, original preservation, folder/ZIP parity | NOT_STARTED |

## Status audit rules

- VERIFIED 只有在 evidence link、執行環境、日期／revision 與測試層級明確時才可使用。
- BLOCKED_HUMAN 與 AWAITING_USER_SETUP 不代表功能完成。
- 若 implementation 改動影響 renderer、model、media 或 sync，必須重新評估受影響 rows，不得沿用過期 evidence。
