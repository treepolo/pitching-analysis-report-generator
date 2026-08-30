# Desktop Vertical Slice Scope

> Historical handoff note. This file records an early desktop vertical slice and is **not** the current project-state authority. The canonical current state is `PROJECT_STATE.md`; product, architecture, UI/data/output and acceptance contracts are the dedicated documents linked from that file.

## Supersession status

The original vertical-slice note predates the current block editor, media/player implementation and export pipeline. Its older claims that the project had no text import, Media Library, single/comparison player, native frame controls, export consumer, ZIP or offline report are now superseded and must not be used to scope current work.

The following decisions remain relevant:

- The former fixed-form/minimal editor is historical only and must not return as a compatibility mode.
- The canonical editor is the block-based long-form document described by `PRODUCT_REQUIREMENTS.md` and `UI_UX_SPEC.md`.
- Desktop shell + portable web renderer remains the approved architecture; see `ARCHITECTURE.md`.
- Project persistence and internal temporary/cache data stay within the project-root safety boundary; final user-selected export may be outside the project root only through the guarded export path policy.
- Export target is `report.html` plus only assets actually referenced by report blocks; originals and unused Media Library assets remain outside the export set.
- The old anchor/binding/relative-offset sync workflow is not a product contract. The narrower current `sync`/`commonSegment` shared-control compatibility behavior is documented in `PROJECT_STATE.md`, `DATA_MODEL.md` and `REPORT_OUTPUT_SPEC.md`.

## Current implementation pointer

Do not maintain a second implementation-status list in this file. Current implementation, limitations and latest test evidence belong in `PROJECT_STATE.md`. As of the 2026-08-30 documentation reconciliation, that file records:

- Electron shell with isolated preload/IPC and project-boundary persistence.
- Block editor with text/image/single-video/dual-video content, autosave/explicit save/reopen and text import.
- Native-video single/dual players with side-specific controls and limited dual shared controls.
- Referenced-only folder/ZIP export with `report.html`, manifest/checksum validation, path/symlink hardening and atomic recovery behavior.
- Remaining evidence gaps around real media/codec behavior, complete exported `file://` runtime, responsive/human acceptance and the broader Scenario A–G matrix.

## Evidence and commands

Historical evidence commands may still be useful as implementation checks, but they are not a substitute for current acceptance evidence:

- `node --check` for JavaScript syntax when relevant.
- `npm test` for the current automated suite.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-electron-smoke.ps1` for the maintained Electron smoke path when the local environment supports it.

Any result or completion claim must be recorded against the current contracts in `PROJECT_STATE.md` and `ACCEPTANCE_TESTS.md`, not inferred from this historical vertical-slice document.
