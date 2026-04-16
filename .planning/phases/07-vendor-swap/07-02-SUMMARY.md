---
phase: 07-vendor-swap
plan: "02"
subsystem: infra
tags: [pi-mono, vendor, pi-ai, typescript]

# Dependency graph
requires:
  - "07-01 — pi-mono 0.67.2 source at /tmp/pi-mono-0.67.2"
provides:
  - "packages/pi-ai/src/ upgraded to pi-mono 0.67.2"
  - "packages/pi-ai/package.json with piVersion = '0.67.2'"
affects: [07-03, 07-04, 07-05, 07-06]

# Tech tracking
tech-stack:
  added:
    - "partial-json ^0.1.7 — new dependency required by 0.67.2 json-parse.ts"
  patterns:
    - "Vendor swap: rm -rf dist/ → rm -rf src/ → cp -r /tmp/pi-mono-0.67.2/... → defensive rename → piVersion tag"

key-files:
  created: []
  modified:
    - packages/pi-ai/src/ (all files — full source replacement)
    - packages/pi-ai/package.json
    - package-lock.json

key-decisions:
  - "partial-json added as dependency (not devDependency) — used at runtime in json-parse.ts"

requirements-completed: [VEND-01]

# Metrics
duration: 8min
completed: 2026-04-16
---

# Phase 07 Plan 02: Swap pi-ai Summary

**pi-ai source replaced with pi-mono 0.67.2 upstream, piVersion tagged, partial-json dependency added, build gate passes at exit 0 with 0 type errors**

## Performance

- **Duration:** ~8 min
- **Tasks:** 2
- **Files modified:** packages/pi-ai/src/* (full replacement), packages/pi-ai/package.json, package-lock.json

## Accomplishments

- Cleaned packages/pi-ai/dist/ and replaced packages/pi-ai/src/ with /tmp/pi-mono-0.67.2/packages/ai/src/
- Ran defensive @mariozechner/pi- → @gsd/pi- import rename (found only string-literal occurrences in cli.ts help text — no actual import statements changed)
- Added piVersion = '0.67.2' to packages/pi-ai/package.json per D-10
- Identified and fixed missing partial-json dependency (new in 0.67.2) — TS2307 during build gate
- Build gate passes: exit 0, 0 type errors

## Task Commits

| Task | Description | Commit |
|------|-------------|--------|
| 2-1 | Replace pi-ai src with 0.67.2 upstream and add piVersion | a9ac1c462 |
| 2-2 | Add partial-json dependency (TS2307 fix) + build gate pass | 937c305d3 |

## Files Created/Modified

- `packages/pi-ai/src/` — full source replacement (82 files changed: 17,957 insertions, 19,612 deletions)
- `packages/pi-ai/package.json` — piVersion added, partial-json dependency added
- `package-lock.json` — updated for partial-json installation

## Key Source Changes (0.57.1 → 0.67.2)

- `models/` subdirectory removed; replaced by flat `models.generated.ts`
- New files: `providers/faux.ts`, `utils/oauth/anthropic.ts`, `utils/oauth/oauth-page.ts`
- Removed test files (not needed in vendored copy): `*.test.ts` throughout
- `models.ts` reduced from 129 lines to a re-export shim
- New runtime dependency: `partial-json` used in `utils/json-parse.ts`

## Decisions Made

- `partial-json` added as a runtime `dependencies` entry (not devDependency) — it is imported at runtime in `src/utils/json-parse.ts` for streaming partial JSON parsing.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Missing partial-json dependency caused TS2307**
- **Found during:** Task 2-2 (build gate)
- **Issue:** 0.67.2 src/utils/json-parse.ts imports from `partial-json` which was not in packages/pi-ai/package.json
- **Fix:** Added `"partial-json": "^0.1.7"` to dependencies and ran `npm install`
- **Files modified:** packages/pi-ai/package.json, package-lock.json
- **Commit:** 937c305d3

## Self-Check

- packages/pi-ai/src/ exists with 0.67.2 source: PASS
- packages/pi-ai/package.json has piVersion = '0.67.2': PASS
- packages/pi-ai/package.json has partial-json dependency: PASS
- Build gate: exit 0, 0 type errors: PASS
- Commits a9ac1c462 and 937c305d3 exist: PASS

## Self-Check: PASSED

## Next Phase Readiness

Plan 07-03 can proceed: pi-ai is now at 0.67.2 with a passing build. Next: pi-agent-core swap.

---
*Phase: 07-vendor-swap*
*Completed: 2026-04-16*
