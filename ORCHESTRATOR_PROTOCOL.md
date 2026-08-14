# Orchestrator Protocol

## Authority and scope

The Orchestrator coordinates visible workers and the Integrator; it does not silently edit product code on their behalf. The Integrator is the only writer for cross-lane reconciliation. A worker's authority is limited to its assigned lane and owned paths.

Canonical requirements and decisions are frozen at Wave 0. During implementation, workers must not modify `PRODUCT_REQUIREMENTS.md`, `USER_FLOWS.md`, `UI_UX_SPEC.md`, `DATA_MODEL.md`, `DATA_AND_SYNC.md`, `MEDIA_PIPELINE.md`, `REPORT_OUTPUT_SPEC.md`, `VERTICAL_SLICE_SCOPE.md`, `ACCEPTANCE_TESTS.md`, `TRACEABILITY_MATRIX.md`, `PROJECT_STATE.md`, `IMPLEMENTATION_STATUS.md`, or other canonical planning/governance documents. Scope changes are proposed to the Orchestrator and reconciled serially by the Integrator.

## Safe dispatch protocol

Before dispatch, the Orchestrator records:

1. the contract baseline (`1c717da` for the current redesign);
2. the exact branch, HEAD, remote, and worktree state;
3. the lane's single-writer paths and forbidden paths;
4. dependencies on committed APIs from other lanes; and
5. the required tests and acceptance evidence.

The Orchestrator must not claim safe parallelism if the shared workspace contains uncommitted overlapping changes. Such changes are first isolated, committed by their owner, or serially reconciled by the Integrator. A worker never resets, force-pushes, or discards another lane's changes without explicit authorization.

## Lane ownership

The maximum Wave 1 lanes are:

- Shell / Report Model / Renderer: `src/index.html`, `src/styles.css`, `src/renderer.js`, `src/storage.js`, `src/report-contract.js`, and related root tests. It must not touch `src/media/**`, `src/sync/**`, or `src/export/**`.
- Media: `src/media/**` and `test/media/**`. It must not touch shell, sync, export, or canonical docs.
- Playback / Sync: `src/sync/**` and `test/sync/**`. It must not touch shell, media, export, or canonical docs.
- Export / Offline: `src/export/**` and `test/export/**`. It must not touch shell, media, sync, or canonical docs.
- QA / Acceptance: read-only evidence and gate work; no product source or test edits.
- Packaging / Startup: independently assigned startup/packaging files only; no app-source overlap.

Workers may read any required contract, but may write only their assigned paths and must commit only those paths. “Related root tests” never authorizes edits under another lane's test directory.

## Dependency and integration protocol

The dependency order is:

```text
Wave 0 freeze -> disjoint lane work -> Integrator review
                              -> serial integration checkpoint
                              -> full regression/provenance
                              -> Wave 3 acceptance gates
```

The Integrator reviews every boundary crossing: shared report-contract allowlists, block-local settings, project-root relative paths and realpath containment, media state and source leakage, sync fallback, export asset selection, and offline `file://` safety. The Integrator may make the smallest boundary fix needed, but does not rewrite a lane without a handoff.

## Evidence and status protocol

Automated pass, explicit skip/unavailable, and human acceptance are different states. A runtime that cannot start, an exported `file://` browser check that is unavailable, a missing real video/FFmpeg tool, or a responsive check without human review must remain visibly pending or blocked. No worker or Orchestrator may label AT-A through AT-G or a requirement VERIFIED without its actual evidence.

The required handoff is:

```text
Status:
Modified files / owned scope:
Commit SHA:
Branch / origin / push result:
Worktree:
Tests and evidence (including skips):
Unfinished requirements:
Blocker:
Next owner:
```

The sender posts this handoff on completion or blocker and does not become silently idle. If a worker cannot proceed, it reports the exact dependency and leaves the workspace recoverable.

## Integrator checkpoint protocol

The Integrator performs a serial checkpoint only after every participating lane is idle and has handed off:

- inspect actual `git status`, branch, HEAD, and remotes;
- verify only owned files are staged;
- run syntax checks, focused and full tests, diff checks, package/lock consistency, and private/generated/ZIP/`.tmp` scans;
- reconcile current provenance in the canonical status documents;
- commit with a descriptive message; and
- push without force and verify `git ls-remote` exactly matches local HEAD.

If push or remote verification fails, the local commit remains valid but the handoff says `AWAITING_USER_SETUP` or the exact network/auth blocker. No remote evidence is invented.

## Wave 3 human checkpoint

The Orchestrator schedules the final real-media, browser/file URL, responsive, and human acceptance work only after the serial integration checkpoint. The acceptance owner records the fixture identity, runtime result, viewport evidence, and human decision. Unavailable fixtures or tools are blockers, not successful substitutes.

## Current state

The current active implementation lane is Shell / Report Model / Renderer. Its latest local checkpoint is `93ffb612542e6e202d6de8e2109f636c7b445ee7` on `worker/desktop-vertical-slice`, with origin configured to the private repository URL above. The code push returned success, while the immediate remote SHA query failed to connect to GitHub; this protocol therefore records remote verification as pending. The current post-commit worktree was clean; earlier concurrent dirty domain files were deliberately kept outside the app checkpoint and require serial ownership review if they reappear.
