# UI Redesign Crash Recovery Guide

## Purpose and current checkpoint

This guide freezes the DOM contract for the replacement of the former dashboard-style UI and defines recovery rules when a Codex session or the Electron runtime is interrupted.

At the time this guide is added, the repository is on `worker/desktop-vertical-slice` at `ddbaf460e0d63abcef3632824aa936140dd1a103` (`docs: point governance to human checkpoint`). The redesign work is intentionally uncommitted in `src/index.html` and `src/styles.css`. Those files are preserved as-is and must not be staged by this documentation checkpoint. No renderer behavior, test, package, bridge, or domain file is part of this commit.

## Frozen replacement DOM contract

The visible product is one centered long-form document workspace. The block canvas is the primary writing surface; there is no dashboard workflow made from a sidebar, a global player, a media panel, or a separate preview panel.

The HTML lane must provide these stable IDs for the renderer lane:

- Shell and document controls: `#document-command-bar`, `#project-list` (compact project control), `#editor`, `#project-title`, `#project-meta`, `#save-project`, `#save-state`, `#root-path`, and `#app-error`.
- Block document: `#block-canvas`, `#block-section-target`, `#add-text-block`, `#add-editor-single-video`, and `#add-editor-comparison-video`.
- Import and export: `#import-text`, `#import-media`, `#choose-export-directory`, `#export-kind`, `#export-report`, `#export-cancel`, `#export-retry`, `#export-directory-status`, and `#export-status`.
- Dialogs: `#new-project`, `#empty-new-project`, `#new-project-dialog`, `#new-project-form`, `#new-project-name`, `#import-text-dialog`, `#import-text-name`, `#import-text-preview`, `#import-text-error`, `#cancel-import-text`, and `#confirm-import-text`.

Each video block is rendered inline inside `#block-canvas`. Its card owns its source selection, single/comparison mode, layout, segment/settings, sync mode and anchors, and its own player controls. Inline cards should use data attributes such as `data-inline-video-block`, `data-inline-side`, and `data-inline-action`; they must not depend on one global player element. The renderer must continue resolving media through the existing safe bridge and must never construct a filesystem URL directly.

These former visible workflow elements are superseded and must not be required by the new renderer or appear as visible panels:

- `#media-library`, `#player-panel`, `#preview`, and `#section-list`;
- `.editor-grid`, `.sidebar`, `.topbar`, `.media-panel`, `.player-panel`, `.preview-panel`, and static global player control panels.

The old IDs/classes may remain in historical Git revisions, but new code must not require them to boot, render, edit, import media, play an inline card, or export.

## Ownership and safe parallel lanes

- HTML/CSS lane: `src/index.html`, `src/styles.css`, and DOM/static UI assertions. It owns IDs, structure, accessibility labels, and responsive layout.
- Renderer behavior lane: `src/renderer.js` and renderer/UI tests. It owns event delegation, block rendering, inline player behavior, and use of the existing preload/domain contracts.
- Bridge/domain lanes: `src/main.js`, `src/preload.js`, `src/storage.js`, `src/report-contract.js`, `src/media/**`, `src/sync/**`, and `src/export/**` remain owned by their existing lanes. The UI redesign consumes these APIs and does not rewrite them.
- Integrator/QA: serially reviews the DOM contract, stages only owned paths, runs the full gate, reconciles provenance, and pushes. QA remains read-only for product source.

No lane may stage another lane's dirty files. If shared workspace changes overlap, stop parallel work, record the exact paths, isolate or commit the owned slice, and resume only after a clean ownership boundary. No worker may reset, discard, force-push, or silently stop.

## Codex-session interruption and recovery

1. Treat a Codex crash as an agent-session interruption until the project runtime independently proves otherwise. Do not infer an Electron bug from a missing Codex response.
2. On resume, read `git status --short --branch`, `git rev-parse HEAD`, `git log -3 --oneline --decorate`, and `git diff --name-only` before editing.
3. Preserve all uncommitted work. Do not run `git reset`, `git checkout`, `git clean`, or broad formatting. Classify every dirty path by lane and stage only the current owner's files.
4. If a partial patch is present, inspect the diff and syntax before continuing. Finish, isolate, or explicitly hand off the partial slice; never silently overwrite it.
5. Record the parent HEAD, resulting commit, branch, remote SHA, test evidence, and remaining blocker in the handoff. A docs-only recovery commit must not absorb source/test/package changes.

## Project runtime crash diagnostics

First distinguish the failure source:

- Codex/session failure: the agent stops responding or the tool call is interrupted while the repository remains inspectable. Follow the session recovery steps above.
- Electron failure: `npm start` or the launcher emits Electron/GPU/window/process diagnostics. Capture the exact command, exit code, stderr, and whether a BrowserWindow stayed alive.

For Electron startup, preserve the existing security posture: `contextIsolation=true`, `nodeIntegration=false`, trusted IPC sender/frame checks, and project-root containment. The launcher may use the opt-in `PITCHING_DISABLE_GPU=1` fallback and `--disable-gpu` path already defined by the project; do not add `--no-sandbox` to production startup or treat a zero exit code as window/runtime success. A real launch must show a live window/process for the agreed observation interval, otherwise record the environment blocker.

## Required pre/post-merge checks

Before staging:

- `git status --short --branch` and owned-path review;
- `node --check` for every JavaScript file under `src`, `test`, and `scripts`;
- focused renderer/static tests, then `npm test`;
- package/lock metadata consistency;
- `git diff --check`;
- Electron smoke where the environment permits, with unavailable `file://`, native-dialog, or real-media evidence recorded as unavailable rather than pass;
- scan tracked files for private media, credentials, generated reports, ZIPs, videos, `node_modules`, and `.tmp` artifacts.

After staging and before handoff:

- `git diff --cached --name-status` must contain only the owned slice;
- rerun `git diff --cached --check` and relevant focused tests;
- commit with a descriptive message, push without force, and compare `git rev-parse HEAD` with `git ls-remote --heads origin <branch>`;
- confirm `git status --short --branch` is clean;
- report Status, files, commit SHA, branch/remote/worktree, tests/evidence, unavailable evidence, remaining requirements, blocker, and next owner.

No requirement is `VERIFIED` without the corresponding runtime or human evidence.
