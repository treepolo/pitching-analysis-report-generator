# Traceability Matrix

目前狀態：**Phase 1/2 planning**。本矩陣是 Requirement → Artifact → Test/Acceptance → Evidence → Status 的唯一追蹤入口。現階段沒有 implementation 或真人 evidence。

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
| SEC-001 | FILESYSTEM_POLICY、GIT_GITHUB_POLICY、OPERATIONS | AT-SEC | secret/sensitive scan and Git review | NOT_STARTED |
| SEC-002 | MEDIA_PIPELINE、OPERATIONS | AT-SEC、AT-G | redacted log and credential negative test | NOT_STARTED |
| FS-001 | FILESYSTEM_POLICY | setup/operations review | boundary and containment review | NOT_STARTED |
| FS-002 | ARCHITECTURE、FILESYSTEM_POLICY | architecture checkpoint | user-approved storage decision | AWAITING_USER_SETUP |
| GIT-001 | GIT_GITHUB_POLICY、MULTI_AGENT_PLAN | baseline gate | local Git/branch policy review | NOT_STARTED |
| GIT-002 | GIT_GITHUB_POLICY | visibility checkpoint | explicit Private/Public decision and remote evidence | BLOCKED_HUMAN |
| GIT-003 | GIT_GITHUB_POLICY、OPERATIONS | baseline/handoff/final gate | push, scan and no-force-push evidence | NOT_STARTED |
| QA-001 | ACCEPTANCE_TESTS | AT-A through AT-G | complete scenario evidence | NOT_STARTED |
| QA-002 | ACCEPTANCE_TESTS、TRACEABILITY_MATRIX | final gate | layered test/evidence/status audit | NOT_STARTED |

## Status audit rules

- VERIFIED 只有在 evidence link、執行環境、日期／revision 與測試層級明確時才可使用。
- BLOCKED_HUMAN 與 AWAITING_USER_SETUP 不代表功能完成。
- 若 implementation 改動影響 renderer、model、media 或 sync，必須重新評估受影響 rows，不得沿用過期 evidence。
