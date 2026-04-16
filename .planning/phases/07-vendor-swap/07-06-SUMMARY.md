---
phase: 07-vendor-swap
plan: 06
subsystem: build-infrastructure
tags: [typescript, tsc, build, error-catalogue, type-errors, vendor-swap]

# Dependency graph
requires:
  - phase: 07-05
    provides: pi-coding-agent swapped to 0.67.2 with GSD additions re-applied
  - phase: 07-04
    provides: pi-tui swapped to 0.67.2
  - phase: 07-03
    provides: pi-agent-core swapped to 0.67.2
  - phase: 07-02
    provides: pi-ai swapped to 0.67.2
provides:
  - tsc-raw-stderr.txt: full build output from npm run build:pi across all four packages
  - type-errors.md: structured D-11 error catalogue grouped by package and file (Phase 08 handoff artifact)
  - piVersion 0.67.2 verified in all four package.json files (D-12 success criterion)
affects: [08-api-migration, 09-agent-types, phase-08-planner, phase-08-researcher]

# Tech tracking
tech-stack:
  added: [partial-json@0.1.7 (was in lockfile but not installed in worktree)]
  patterns: [type-errors.md as structured handoff artifact between vendor-swap and API migration phases]

key-files:
  created:
    - .planning/phases/07-vendor-swap/tsc-raw-stderr.txt
    - .planning/phases/07-vendor-swap/type-errors.md
  modified: []

key-decisions:
  - "tsc outputs relative paths (src/...) when invoked via npm workspaces — parser must infer package from npm workspace error context, not from path prefix"
  - "24 type errors all in @gsd/pi-coding-agent: 17 in extensions/index.ts (renamed/removed exports in 0.67.2 types), 6 in provider-manager.ts (API shape changes), 1 in memory/index.ts (getMemorySettings removed)"
  - "Phase gate PASS: no TS2307 errors in full build — all errors are TS2305/TS2724/TS2345/TS2341/TS2551 (acceptable per D-05)"

patterns-established:
  - "Build clean must include tsconfig.tsbuildinfo (not just dist/) to avoid TS5055 on incremental re-runs"

requirements-completed: [VEND-01]

# Metrics
duration: 25min
completed: 2026-04-16
---

# Phase 07 Plan 06: Final Build + Error Catalogue Summary

**Full npm run build:pi across all four 0.67.2 packages: no TS2307 (phase gate PASS), 24 type errors catalogued in type-errors.md for Phase 08, all piVersion fields verified at 0.67.2**

## Performance

- **Duration:** 25 min
- **Started:** 2026-04-16T00:00:00Z
- **Completed:** 2026-04-16T00:25:00Z
- **Tasks:** 3
- **Files modified:** 2 created (.planning/), no source files

## Accomplishments
- Full build:pi ran across all four pi-mono packages (native + pi-tui + pi-ai + pi-agent-core + pi-coding-agent)
- No TS2307 (missing module) errors — phase gate PASS
- 24 type errors catalogued in type-errors.md: all in @gsd/pi-coding-agent, API shape changes from 0.57.1 → 0.67.2
- All four piVersion fields verified as "0.67.2" per D-12 success criterion

## Task Commits

Each task was committed atomically:

1. **Task 6-1: Full build and raw error capture** - `a6e2e3519` (feat)
2. **Task 6-2: Generate structured type-errors.md** - `777fea83f` (feat)
3. **Task 6-3: piVersion verification** - (no code changes, verification only)

**Plan metadata:** (see final commit hash below)

## Files Created/Modified
- `.planning/phases/07-vendor-swap/tsc-raw-stderr.txt` - Raw build output (38 lines, 24 error lines + npm headers)
- `.planning/phases/07-vendor-swap/type-errors.md` - D-11 structured error catalogue, 43 lines

## Decisions Made
- tsc running via npm workspaces emits relative paths (`src/foo.ts`) not workspace-rooted paths. The D-11 parser in the plan assumed `packages/pi-*/src/...` format. Fixed parser to detect the failing package via `npm error workspace @gsd/pi-coding-agent` context line, then prepend `packages/pi-coding-agent/` to all `src/` paths.
- Must clean both `dist/` and `tsconfig.tsbuildinfo` before fresh builds. The plan spec only removes `dist/`. Without removing `tsbuildinfo`, tsc incremental mode on second run attempts to overwrite its own previous output `.d.ts` files as inputs (TS5055). Added tsbuildinfo cleanup to the clean step.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] partial-json not installed in worktree**
- **Found during:** Task 6-1 (first build attempt)
- **Issue:** `packages/pi-ai/src/utils/json-parse.ts` imports `partial-json` which was in the lockfile but not installed in the worktree's node_modules
- **Fix:** Ran `npm install --legacy-peer-deps` to install all missing deps
- **Files modified:** none (node_modules only)
- **Verification:** Second build attempt passed pi-ai without TS2307
- **Committed in:** a6e2e3519 (part of Task 6-1 commit)

**2. [Rule 1 - Bug] tsc TS5055 on incremental rebuild without tsbuildinfo clean**
- **Found during:** Task 6-1 (second build attempt after npm install)
- **Issue:** tsc incremental mode (enabled in tsconfig.json) writes `.tsbuildinfo` tracking dist output files. On second run, existing `dist/*.d.ts` were seen as both "previously written" and "potential inputs", causing TS5055 "Cannot write file because it would overwrite input file" 
- **Fix:** Extended clean step to also remove `tsconfig.tsbuildinfo` for all four packages
- **Files modified:** none (state files removed)
- **Verification:** Third build (after full clean) succeeded for pi-tui/pi-ai/pi-agent-core and got real type errors from pi-coding-agent
- **Committed in:** a6e2e3519 (part of Task 6-1 commit)

**3. [Rule 1 - Bug] D-11 parser assumed workspace-rooted paths; tsc emits package-relative paths**
- **Found during:** Task 6-2 (first parse produced 0 errors)
- **Issue:** The plan's Node.js parser used regex `/^(packages\/pi-[^(]+)\((\d+).../` but tsc invoked via npm workspace CWD reports `src/foo.ts(line,col)` not `packages/pi-coding-agent/src/foo.ts(line,col)`
- **Fix:** Updated parser to detect the failing package via the `npm error workspace @gsd/pi-coding-agent@` line in the captured output, then prefix `src/` paths with `packages/pi-coding-agent/`
- **Files modified:** Parser logic (inline node -e script, no file change)
- **Verification:** Second parse produced 24 errors correctly attributed to @gsd/pi-coding-agent
- **Committed in:** 777fea83f (part of Task 6-2 commit)

---

**Total deviations:** 3 auto-fixed (2 blocking, 1 bug)
**Impact on plan:** All auto-fixes necessary to produce valid output. No scope creep. The type-errors.md content is complete and correct.

## Issues Encountered
- Build must be fully clean (dist + tsbuildinfo) to avoid TS5055 incremental conflicts on second run. Plan spec only removed dist/ — this is a gap for Phase 08+ build operations.

## Known Stubs
None — type-errors.md is fully populated with real build output.

## Next Phase Readiness
- **type-errors.md** is ready for Phase 08 gsd-phase-researcher and gsd-planner to read
- Phase 08 target: fix the 24 type errors (API shape changes in @gsd/pi-coding-agent)
  - Primary cluster: `extensions/index.ts` re-exports of types renamed/removed in 0.67.2 (SessionForkEvent→SessionEvent, SessionSwitchEvent→SessionBeforeSwitchEvent, etc.)
  - Secondary: `provider-manager.ts` uses private `modelsJsonPath` field and old Keybindings keys
  - Minor: `memory/index.ts` references removed `getMemorySettings` method
- All four packages at piVersion 0.67.2, phase 07 success criteria fully met

## Self-Check: PASSED

- tsc-raw-stderr.txt: FOUND
- type-errors.md: FOUND
- 07-06-SUMMARY.md: FOUND
- Commit a6e2e3519 (Task 6-1): FOUND
- Commit 777fea83f (Task 6-2): FOUND
- No TS2307 in build: PASS
- type-errors.md header check: PASS

---
*Phase: 07-vendor-swap*
*Completed: 2026-04-16*
