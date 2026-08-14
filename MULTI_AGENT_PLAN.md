# Multi-Agent Development Plan

## Purpose and operating rule

This plan defines the maximum safe parallelism for the desktop application. Parallel work is allowed only when ownership is disjoint, the contract is frozen, and the shared workspace has no uncommitted overlapping changes. A worker must stop and report when its intended file set overlaps another active lane. No worker may use a fake completion, claim a requirement as VERIFIED without evidence, or silently stop.

Workers commit only paths owned by their lane. Workers do not modify canonical planning documents during implementation. The Integrator performs serial reconciliation, provenance updates, full regression, and remote verification.

## Wave 0: contract freeze

Wave 0 is anchored to canonical documentation commit `1c717da`.

The frozen decisions for the implementation waves are:

- The product UI is a block-based long-form editor. The former fixed-form editor is superseded and is not retained as an in-product compatibility mode.
- A report contains many text blocks and independent video blocks.
- Each video block owns its asset selection, single/comparison mode, layout, per-side in/out segment, playback settings, sync mode, and separate sync-start anchors.
- Time sync uses a shared elapsed-time playhead and each source's own timebase/FPS. Explicit frame sync is a separate capability and must not map unlike frame rates by raw frame index.
- Export output includes only media assets referenced by video blocks. Originals remain untouched; folder and ZIP output contain copied, self-contained assets.
- Existing saved data must not be destructively deleted. Any migration is additive, bounded, and covered by persistence evidence.

No lane may change these contracts locally. A proposed contract change returns to Wave 0 review and is recorded by the Integrator before dependent implementation resumes.

## Wave 1: disjoint implementation lanes

The following lanes may run in parallel only after a clean, non-overlapping baseline is established.

| Lane | Single writer owns | Forbidden paths | Primary dependency |
| --- | --- | --- | --- |
| Shell / Report Model / Renderer | `src/index.html`, `src/styles.css`, `src/renderer.js`, `src/storage.js`, `src/report-contract.js`, and related root tests | `src/media/**`, `src/sync/**`, `src/export/**`, canonical docs | Frozen block/report contract |
| Media | `src/media/**`, `test/media/**` | Shell files, `src/sync/**`, `src/export/**`, canonical docs | Project-root and asset contract |
| Playback / Sync | `src/sync/**`, `test/sync/**` | Shell files, `src/media/**`, `src/export/**`, canonical docs | Video block and timing contract |
| Export / Offline | `src/export/**`, `test/export/**` | Shell files, `src/media/**`, `src/sync/**`, canonical docs | Report contract and referenced-asset rule |
| QA / Acceptance | Read-only gate scripts, evidence, and reports only | All product source, tests, package files, and canonical docs | Candidate lane commits |
| Packaging / Startup | Independent startup/packaging files only, when explicitly assigned | App source and domain lanes | Stable application entrypoint |

“Related root tests” means tests that exercise the shell/model contract; a test under another lane's directory remains owned by that lane. A lane may consume another lane's committed API, but may not edit the provider's files.

## Conflict and dependency graph

```text
Wave 0 contract freeze
        |
        +--> Shell / Report Model / Renderer ----+
        +--> Media ------------------------------+--> Integrator contract review
        +--> Playback / Sync --------------------+
        +--> Export / Offline --------------------+
        +--> Packaging / Startup (independent) --+
        +--> QA read-only ------------------------+
                                                   |
                                      full regression + provenance
                                                   |
                                  real-media/browser/human gates
```

The conflict graph has a shared-contract edge between Shell, Media, Sync, and Export; it is an API review dependency, not permission to edit another lane. The Integrator serializes any change that crosses those edges. QA is read-only and cannot repair product code in the gate.

## Wave 2: Integrator-only reconciliation

After lane handoffs, the Integrator:

1. checks branch, HEAD, worktree, remotes, and owned-path status;
2. reviews contract parity, path containment, private-data boundaries, and fake-success risks;
3. stages only the explicitly owned slice and reconciles cross-lane changes serially;
4. runs all JavaScript syntax checks, focused tests, full regression, package/lock checks, diff checks, and artifact scans;
5. updates current-state provenance without rewriting product requirements or marking unsupported evidence VERIFIED;
6. creates the integration checkpoint and verifies the exact remote branch SHA.

If concurrent dirty files are present, the Integrator first isolates or commits the owned slice. No “safe parallelism” claim is valid while uncommitted overlapping changes are present.

## Wave 3: acceptance gates

The final gates require evidence for real media metadata/FFmpeg, actual player and sync runtime, exported folder and ZIP `file://` loading with offline behavior, narrow/desktop responsive behavior, and human acceptance scenarios AT-A through AT-G. Missing tools, fixtures, or human review are recorded as `AWAITING_USER_SETUP`, `HUMAN_CHECKPOINT`, or an explicit unavailable blocker; they are not converted to pass.

## Stop conditions and liveness

Stop the lane and hand off when:

- a required API or contract is ambiguous;
- a path crosses another lane's ownership;
- a security or project-root containment check fails;
- a test exposes a real regression that cannot be fixed within the lane; or
- an external dependency, credential, real media fixture, or human checkpoint is required.

Every stop or completion must be reported in the same turn. Silence is not completion. The receiving owner acknowledges the handoff and names the next action.

## Handoff format

Each handoff includes:

```text
Status:
Scope/files:
Commit SHA:
Branch and remote:
Worktree:
Tests/evidence:
Remaining requirements/blockers:
Next owner:
```

Evidence must distinguish passed automated checks from skipped/unavailable runtime checks and human acceptance. Private media, credentials, generated output, ZIP artifacts, and `.tmp` files never enter Git.

## Current coordination state

- Active lane: Shell / Report Model / Renderer, first canonical block-editor vertical slice.
- Local branch: `worker/desktop-vertical-slice`.
- Local HEAD: `93ffb612542e6e202d6de8e2109f636c7b445ee7` (`feat: add canonical block editor vertical slice`).
- Configured origin: `https://github.com/treepolo/pitching-analysis-report-generator.git`.
- The code checkpoint push returned success, but the immediate follow-up `ls-remote` was blocked by a GitHub HTTPS connection failure; remote SHA verification remains pending until the command succeeds.
- At dispatch, shared workspace dirty files from another domain lane were observed; they were not staged into this checkpoint. The current post-commit status was clean. If another dirty lane reappears, ownership-aware serial integration is required before any parallel claim.
- No product requirement is marked VERIFIED by this plan. Real-media, runtime, browser/file URL, responsive human, and AT-A through AT-G evidence remain separate acceptance gates.
