---
phase: 07-vendor-swap
plan: "04"
subsystem: infra
tags: [pi-mono, vendor, pi-tui, upgrade]

# Dependency graph
requires:
  - "07-03 — pi-agent-core swapped to 0.67.2"
  - "/tmp/pi-mono-0.67.2 — pi-mono source at v0.67.2"
provides:
  - "packages/pi-tui — upgraded to 0.67.2 source with @gsd/pi-* imports and piVersion marker"
affects: [07-05, 07-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "piVersion field in package.json marks each vendored package version for traceability (D-10)"
    - "@mariozechner/pi-* → @gsd/pi-* import rename applied via sed across all source files"

key-files:
  created:
    - "packages/pi-tui/src/index.ts (replaced)"
    - "packages/pi-tui/src/tui.ts (replaced)"
    - "packages/pi-tui/src/autocomplete.ts (replaced)"
    - "packages/pi-tui/src/terminal.ts (replaced)"
    - "packages/pi-tui/src/utils.ts (replaced)"
  modified:
    - "packages/pi-tui/package.json (added piVersion: 0.67.2)"

key-decisions:
  - "0.67.2 tui source removed test files (__tests__/ directory) and overlay-layout.ts — deleted as intentional upstream removal"
  - "Build gate passed with 0 type errors — no TS2307 fixes required"
  - "Research confirmed 0 cross-pi imports in pi-tui; import rename was defensive with no changes needed"

requirements-completed: [VEND-01]

# Metrics
duration: 5min
completed: 2026-04-16
---

# Phase 07 Plan 04: Swap pi-tui Summary

**pi-tui source replaced with 0.67.2 upstream, @mariozechner/pi-* imports renamed to @gsd/pi-* (0 found, as predicted by research), piVersion marker added, and build gate passed with zero type errors**

## Performance

- **Duration:** ~5 min
- **Completed:** 2026-04-16
- **Tasks:** 2 (1 committed, 1 verification-only)
- **Files modified:** 13 source files replaced/modified, 1 package.json updated

## Accomplishments

- Replaced pi-tui/src/ with 0.67.2 source from /tmp/pi-mono-0.67.2/packages/tui/src/
- Confirmed 0 @mariozechner/pi-* cross-pi imports in pi-tui (matching research finding)
- Added piVersion: "0.67.2" to package.json per D-10 traceability requirement
- Build gate (`npm run build:pi-tui`) passed: 0 type errors, 0 TS2307, no panics

## Task Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 4-1 | Replace pi-tui source and add piVersion | ab313d807 | packages/pi-tui/src/* (31 files), packages/pi-tui/package.json |
| 4-2 | Build gate for pi-tui | (no files modified — verification only) | — |

## Files Created/Modified

- `packages/pi-tui/src/index.ts` — replaced with 0.67.2
- `packages/pi-tui/src/tui.ts` — replaced with 0.67.2
- `packages/pi-tui/src/autocomplete.ts` — replaced with 0.67.2
- `packages/pi-tui/src/terminal.ts` — replaced with 0.67.2
- `packages/pi-tui/src/terminal-image.ts` — replaced with 0.67.2
- `packages/pi-tui/src/utils.ts` — replaced with 0.67.2
- `packages/pi-tui/src/keys.ts` — replaced with 0.67.2
- `packages/pi-tui/src/keybindings.ts` — replaced with 0.67.2
- `packages/pi-tui/src/stdin-buffer.ts` — replaced with 0.67.2
- `packages/pi-tui/src/components/*.ts` — all replaced with 0.67.2
- `packages/pi-tui/package.json` — added `piVersion: "0.67.2"`

## Decisions Made

- 0.67.2 source does not ship test files (__tests__/ directory) or overlay-layout.ts — these were deleted as intentional upstream removals, not regressions
- Build gate passed cleanly with 0 type errors — no inline TS2307 fixes were needed
- Cross-pi import rename was defensive only; research correctly predicted 0 @mariozechner/pi-* imports

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None.

## Threat Flags

None — build infrastructure only, no new network endpoints or auth paths.

## Self-Check

- packages/pi-tui/src/ exists with 0.67.2 files: PASS
- piVersion === "0.67.2" in package.json: PASS
- No @mariozechner/pi-* imports remain in src/: PASS
- Build gate: 0 type errors, 0 TS2307: PASS
- Commit ab313d807 exists: PASS

## Self-Check: PASSED

---
*Phase: 07-vendor-swap*
*Completed: 2026-04-16*
