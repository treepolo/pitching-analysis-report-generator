# Wave 26 — XP-to-Windows-7 Companion Report Reader

## Decision

- User-selected UI direction: option 5, a read-only companion viewer that belongs to the same product family as the generator.
- Exported `report.html` uses the generator's authentic Windows XP-to-Windows-7 transition-era visual language without displaying fake editor commands or editable fields.
- Existing report structure, portable media references, native video playback, frame controls, keyboard selection, responsive behavior, folder/ZIP parity, and offline `file://` contract remain unchanged.
- This is a complete output-theme conversion, not an MVP or partial skin.

## UI and reading contract

- Use Tahoma/Segoe UI-era typography, Win7 blue title chrome, XP cream work surfaces, compact beveled controls, inset media surfaces, square section groups, and restrained 0–3 px radii.
- Text uses two visible levels: report section and readable content body.
- Video uses three visible levels: report section, player block, and video surface. Player selection changes the existing player border/background rather than adding another outline.
- Dual-video sides use a single divider, not independent nested card frames.
- The report header behaves as a document title band, not an editor toolbar.
- No external CSS, font, image, script, network API, or generator runtime dependency may be introduced.

## Five implementation candidates

Scoring: output isolation, visual fidelity, offline safety, maintainability, and verifiability; each is scored out of 5.

| Candidate | Approach | Isolation | Fidelity | Offline safety | Maintainability | Verification | Total |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| A | Rewrite the existing `renderStyles()` template in `report-renderer.js` | 4 | 5 | 5 | 3 | 4 | 21/25 |
| B | Inject `src/generator-xp7.css` directly into exported HTML | 1 | 3 | 3 | 2 | 2 | 11/25 |
| C | Refactor generator and export to consume one shared CSS source | 3 | 5 | 4 | 4 | 3 | 19/25 |
| D | Add a dedicated export reader-theme module whose CSS is embedded by `renderReportHtml()` | 5 | 5 | 5 | 5 | 5 | **25/25** |
| E | Add an external `reader.css` asset to every folder and ZIP export | 4 | 5 | 3 | 3 | 4 | 19/25 |

### Adopted candidate

Candidate D is adopted. A pure export-owned CSS module preserves self-contained output, keeps the generator theme and reader theme independently testable, avoids coupling selectors across editor and portable DOM contracts, and leaves folder/ZIP asset traversal unchanged.

## Implementation plan

1. Capture current renderer/output tests and visual structure.
2. Add an export-only reader theme module and embed it in `report.html` through the existing inline `<style>` boundary.
3. Give the report a period title band, cream workspace, two-level text hierarchy, three-level video hierarchy, classic controls, direct selected-border state, dual-side dividers, and responsive narrow/mobile rules.
4. Preserve all output DOM/data attributes and player JavaScript behavior.
5. Add focused theme tests for self-containment, period signatures, hierarchy, selection state, dual layout, responsive rules, and absence of generator/editor-only dependencies.
6. Run focused and complete automated tests, syntax checks, folder/ZIP parity, static network isolation, and available `file://` runtime checks.
7. Generate a real local report from the existing project, inspect desktop and narrow/mobile layouts, and correct any overflow, clipping, or illegibility.
8. Update project state and create/push a scoped Git checkpoint while preserving unrelated user-owned changes and generated output.

## Progress checklist

- [x] Reader UI direction selected by user.
- [x] Output specification, renderer, and test boundaries inspected.
- [x] Five implementation candidates scored and highest-scoring candidate adopted.
- [x] Export-only reader theme module added and embedded inline.
- [x] Report title, sections, text, images, video players, controls, selected state, and dual dividers restyled.
- [x] Desktop and narrow/mobile responsive rules completed without removing functionality.
- [x] Focused output-theme tests added.
- [x] Full automated and visual verification completed.
- [x] Git/GitHub checkpoint created by the scoped Wave 26 commit containing this checklist.

## Verification checklist

- [x] Generated HTML contains all required CSS inline and no external style/font URL.
- [x] No generator-only editor control or `generator-xp7.css` reference appears in output.
- [x] Text hierarchy is section plus content body; video hierarchy is section plus player plus media surface.
- [x] Selected player changes its existing border/background with no extra outline or glow layer.
- [x] Dual sides use only a divider and stack cleanly at narrow widths.
- [x] All current player buttons, ranges, numeric speed input, reset, loop, selection, and keyboard controls remain present.
- [x] Folder and ZIP output remain byte-parity equivalent for the same report snapshot.
- [x] Static network isolation and relative asset validation pass.
- [x] Desktop and narrow/mobile visual evidence shows no horizontal overflow or clipped controls.
- [x] Full `npm test` passes, with unavailable runtime evidence reported honestly.
- [x] Final Git diff contains no unrelated user-owned files or generated report artifacts.

## Verification evidence

- Focused reader/renderer tests: 8 passed, 0 failed.
- Full regression: 166 tests, 165 passed, 0 failed, 1 explicit automated Electron `file://` harness skip.
- A separately generated real-media report was loaded directly through Electron Chromium from `file://` for visual/runtime QA at 1260×900 and 390×844.
- Runtime inspection found 3 sections, 2 player blocks, no external resources, no horizontal overflow, and a successful outer-player selection transition to `data-frame-selected="true"`.
- Desktop dual video remained side by side. At 390 px it became one column, removed the left divider, and retained one top divider between sides.
- QA reports, copied media, browser profiles, and screenshots stayed under project-local `.tmp` and are not part of the checkpoint.
