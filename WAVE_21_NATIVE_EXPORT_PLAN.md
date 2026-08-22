# Wave 21 — Native-video portable export

## Decision

Use the same native `<video>` frame-player behavior in the editor and in the
portable exported HTML. The exported report may change only the media source
adapter: Electron resolves a project-local source through the bridge; the
portable report resolves a self-contained relative path under `videos/`.

Ready frame-cache PNGs are not part of this export path and must not be read,
staged, copied, or referenced by the generated report.

## UI and usage decision

The selected option is shared native frame-player behavior. Keep the existing
single/dual independent cards, frame controls, continuous rate input/slider,
1x reset, segment bounds, and loop behavior. Do not add a new synchronisation
model or change the single/dual layout semantics.

## Progress checklist

- [x] Extract or reproduce the editor's exact native seek/runtime semantics in
      a standalone-safe player runtime.
- [x] Use the runtime for exported native video players, including frame
      stepping, latest-target scrubbing, rate transitions, extended-rate clock,
      segment bounds, and loop behavior.
- [x] Make export stage referenced source videos only; do not read or stage
      frame-cache PNGs or cache indexes.
- [x] Keep folder/ZIP layout and relative video paths valid; remove misleading
      frame-cache warnings and unused cache output from this path.
- [x] Add/update contract and runtime tests for native-only output and ensure
      no `data-frame-player`, `images/frame-cache`, or cache index is emitted.
- [x] Run `npm test`, JavaScript syntax checks, `git diff --check`, and a local
      native-only export size/manifest smoke using project-local fixtures.
- [x] Update `PROJECT_STATE.md` and commit a recoverable Git checkpoint.

## Verification boundary

Automated tests can verify generated HTML, asset staging, runtime state
transitions, and folder/ZIP parity. Real browser `file://` playback, codec
behavior, and exact displayed-frame latency still require Electron/desktop
manual acceptance and must not be marked verified by tests alone.

## Implementation status (2026-08-23)

- Exported video blocks now use the standalone native-video runtime in src/export/native-frame-player.js.
- The runtime mirrors the editor contract: native currentTime frame addressing, exact seek confirmation, latest-target approximate scrubbing, keyboard/previous/next stepping, loop segment bounds, continuous log2 rate input/slider, 1x reset, and a requestAnimationFrame clock when Chromium rejects the requested native rate.
- Export staging now copies referenced source videos/images only. It ignores legacy frame-cache inputs, does not copy cache indexes or PNGs, and does not emit cache manifest entries or warnings.
- Native-only export tests cover folder/ZIP parity, ready/missing/invalid cache inputs, relative media paths, and inline runtime syntax.