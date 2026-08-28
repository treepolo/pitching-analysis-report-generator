# Wave 25 — Generator XP-to-Windows-7 Visual Retrofit

## Decision

- User-selected direction: an authentic transition-era desktop product that began on Windows XP and was later updated for Windows 7.
- The result must look native to roughly 2008–2011, not like a modern interface wearing a retro color palette.
- This wave changes the generator UI only. Exported report HTML, export renderer behavior, data contracts, workflows, and features are out of scope.
- This is a complete visual retrofit, not an MVP or partial theme sample.

## UI and interaction contract

- Preserve every existing control, label, command, dialog, keyboard behavior, and responsive reachability rule.
- Use period-correct Tahoma/Segoe UI-era typography, compact density, beveled buttons, inset form controls, XP cream work surfaces, Win7 blue glass-like title chrome, toolbar separators, status-bar treatment, square/group-box panels, and restrained 1–3 px radii.
- Remove the generator's modern visual language: large display typography, pill badges, card shadows, generous SaaS spacing, blurred sticky surfaces, and rounded floating panels.
- Maintain visible focus, disabled, success, warning, and error states.
- Keep narrow-window layouts usable without horizontal overflow or removed functions.

## Five implementation candidates

Scoring: scope isolation, period fidelity, regression safety, maintainability, and verifiability; each is scored out of 5.

| Candidate | Approach | Isolation | Fidelity | Safety | Maintainability | Verification | Total |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| A | Restore a historical theme commit wholesale, including its export changes | 1 | 4 | 1 | 2 | 3 | 11/25 |
| B | Replace the existing base `styles.css` rules with the period theme | 4 | 5 | 3 | 4 | 4 | 20/25 |
| C | Append a generator-scoped override block to `styles.css` | 4 | 5 | 4 | 3 | 4 | 20/25 |
| D | Add a dedicated generator-only theme stylesheet loaded only by `src/index.html` | 5 | 5 | 5 | 5 | 5 | **25/25** |
| E | Add runtime theme JavaScript and custom Electron window chrome | 3 | 5 | 2 | 2 | 3 | 15/25 |

### Adopted candidate

Candidate D is adopted. A dedicated stylesheet gives the clearest proof that the portable report renderer is untouched, keeps the current structural/responsive CSS as the fallback contract, and makes the theme independently testable. No renderer JavaScript or Electron window behavior is needed for a visual-only change.

## Implementation plan

1. Capture baseline Git state, current export renderer hash, style contract, and existing historical theme attempts.
2. Add `src/generator-xp7.css` and link it after `src/styles.css` in the generator entry document only.
3. Restyle the application surface, title band, toolbar, menus, buttons, fields, document work area, block panels, player controls, dialogs, focus states, and responsive variants.
4. Add focused contract tests proving the generator loads the theme, the theme is scoped to `.document-app`, period-defining rules are present, responsive rules remain present, and export output does not reference the generator theme.
5. Run focused tests, the complete test suite, syntax/diff checks, and export renderer scope/hash comparison.
6. Run Electron smoke and visual QA at the normal 1280×820 window and the supported 880×600 minimum window; correct overflow, overlap, illegibility, or modern-looking remnants.
7. Create a recoverable Git checkpoint containing only the Wave 25 source, test, and plan files; preserve unrelated user-owned changes and generated output.

## Progress checklist

- [x] UI direction selected by user.
- [x] Repository state and source-of-truth documents inspected.
- [x] Five implementation candidates scored and the highest-scoring candidate adopted.
- [x] Generator-only theme stylesheet added and linked.
- [x] Title, toolbar, work surface, editor blocks, video controls, status areas, and dialogs restyled.
- [x] Desktop and minimum-width responsive rules completed without removing features.
- [x] Focus, disabled, error, pending, and success states retained.
- [x] Focused theme/export-isolation tests added.
- [x] Automated and visual verification completed.
- [x] Git checkpoint created.

## Verification checklist

- [x] `src/export/report-renderer.js` remains byte-for-byte unchanged from baseline SHA-256 `71112C22D6233622067D6604D6D3B523C383966DA7EBC4A4323FE8AF9301EDAF`.
- [x] No file under `src/export/` is changed.
- [x] Generated report HTML contains no `generator-xp7.css` reference or generator-only theme marker.
- [x] Theme selectors are rooted under `body.document-app` except intentional root-page background rules.
- [x] All controls remain present, operable, and visibly focusable.
- [x] 1280×820 and 880×600 layouts have no horizontal overflow, clipped primary commands, or overlapping sticky regions.
- [x] Dialogs, project menu, rich-text toolbar, single-video blocks, and dual-video blocks retain readable states.
- [x] Focused style/theme tests pass.
- [x] Full `npm test` passes, with any environment-unavailable Electron/file URL check reported honestly.
- [x] Scoped `git diff --check` passes and the final diff excludes unrelated user-owned files.

## Verification result

- Focused generator/style contract: 9 tests passed.
- Full regression: 163 tests total, 162 passed, 0 failed, and 1 explicit exported `file://` Electron-runtime unavailable skip.
- Live Electron visual evidence: generator theme loaded; 1270×794 content viewport and 871×574 minimum-window content viewport both had no document/body horizontal overflow. All primary create/import/block/save/export controls remained visible.
- Live dialog evidence: new-document dialog rendered with the period title strip, inset field, classic command buttons, and no clipping at minimum window size.
- Existing Electron smoke is not green: it assigns `.value` to the rich-text `contenteditable` element and consistently reports `autosaved section content did not persist`. The same stale `.value` assignment exists in `HEAD` before this CSS-only wave; no renderer/autosave code was changed here.
