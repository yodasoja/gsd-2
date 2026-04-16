---
phase: 07-vendor-swap
verified: 2026-04-15T00:00:00Z
status: passed
score: 4/4 must-haves verified
overrides_applied: 0
gaps: []
deferred: []
---

# Phase 07: Vendor Swap Verification Report

**Phase Goal:** All four vendored pi-mono packages (`pi-agent-core`, `pi-ai`, `pi-tui`, `pi-coding-agent`) contain 0.67.2 source and the workspace compiles at all — type errors from API shape changes are expected and acceptable at phase end.
**Verified:** 2026-04-15
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `packages/pi-agent-core`, `packages/pi-ai`, `packages/pi-tui`, `packages/pi-coding-agent` contain 0.67.2 source (verifiable via piVersion field) | VERIFIED | All four `package.json` files have `piVersion: "0.67.2"`; pi-ai has `models.generated.ts` (0.67.2-specific file) and `src/models/` directory (0.57.1 artifact) is absent |
| 2 | `npm run build:pi` runs to completion without crashing the compiler — type errors are acceptable, panics and missing-module errors (TS2307) are not | VERIFIED | `tsc-raw-stderr.txt` contains zero TS2307 entries; all 24 errors are TS2305/TS2724/TS2341/TS2345/TS2551 (API shape changes, Phase 08 scope per D-05) |
| 3 | The number of type errors is bounded and catalogued (stderr captured to a file) so Phase 08 has a known error list | VERIFIED | `type-errors.md` exists at `.planning/phases/07-vendor-swap/type-errors.md` with 24 errors grouped by package and file; `tsc-raw-stderr.txt` contains the raw build output |
| 4 | No 0.57.1 source files remain in any vendored package directory | VERIFIED | `src/models/` directory (0.57.1 pi-ai artifact) is absent; `src/components/` directory (0.57.1 pi-coding-agent path) is absent; `src/modes/interactive/components/` (0.67.2 structure) exists; all packages have 0.67.2-only files confirmed |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/pi-ai/package.json` | piVersion: "0.67.2" | VERIFIED | `piVersion: "0.67.2"` confirmed; `partial-json: ^0.1.7` dependency added |
| `packages/pi-agent-core/package.json` | piVersion: "0.67.2" | VERIFIED | `piVersion: "0.67.2"` confirmed |
| `packages/pi-tui/package.json` | piVersion: "0.67.2" | VERIFIED | `piVersion: "0.67.2"` confirmed |
| `packages/pi-coding-agent/package.json` | piVersion: "0.67.2"; new deps ajv, cli-highlight, uuid | VERIFIED | `piVersion: "0.67.2"` confirmed; all three new deps present |
| `packages/pi-coding-agent/src/core/extensions/index.ts` | GSD version (exports GSD-only symbols) | VERIFIED | File exists with GSD re-export content |
| `packages/pi-coding-agent/src/core/keybindings-types.ts` | GSD-only file restored | VERIFIED | File exists |
| `packages/pi-coding-agent/src/core/lsp/` | GSD-only subsystem restored | VERIFIED | Directory exists with 12 files including lspmux.ts, client.ts, etc. |
| `packages/pi-coding-agent/src/core/theme/` | GSD-only subsystem restored | VERIFIED | Directory exists with theme.ts and themes.ts |
| `packages/pi-coding-agent/src/resources/` | GSD-only subsystem restored | VERIFIED | Directory exists |
| `packages/pi-coding-agent/src/types/` | GSD-only subsystem restored | VERIFIED | Directory exists |
| `packages/pi-coding-agent/src/modes/interactive/components/` | GSD component files at NEW 0.67.2 path | VERIFIED | Directory exists; chat-frame.ts, provider-manager.ts, timestamp.ts, tree-render-utils.ts all present |
| `.planning/phases/07-vendor-swap/type-errors.md` | Phase 08 handoff catalogue | VERIFIED | 43-line file with 24 errors grouped by package (0 in pi-ai, 0 in pi-agent-core, 0 in pi-tui, 24 in pi-coding-agent) |
| `.planning/phases/07-vendor-swap/tsc-raw-stderr.txt` | Raw build output | VERIFIED | File exists with 38 lines of build output |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `pi-coding-agent/src/index.ts` | `@gsd/agent-core` | re-export blocks | VERIFIED | 4 GSD re-export lines present: ContextualTips, BlobStore/isBlobRef/parseBlobRef/etc., ArtifactManager, FallbackResolver |
| `pi-coding-agent/src/core/index.ts` | `@gsd/agent-core` | re-export blocks | VERIFIED | FallbackResolver and ContextualTips re-exports present |
| `pi-coding-agent/src/core/messages.ts` | `@gsd/pi-agent-core` | module augmentation | VERIFIED | `declare module "@gsd/pi-agent-core"` (correctly renamed from @mariozechner) |
| `pi-coding-agent/src/core/keybindings.ts` | `@gsd/pi-tui` | module augmentation | VERIFIED | `declare module "@gsd/pi-tui"` (correctly renamed from @mariozechner) |
| All pi-* packages | `@gsd/pi-*` namespaced imports | sed rename pass | VERIFIED | Zero `from "@mariozechner/pi-"` imports remain across all four packages; `@mariozechner/jiti` was preserved |

### Data-Flow Trace (Level 4)

Not applicable — this phase produces source files and build artifacts, not runtime data-rendering components. The type-errors.md is a static document, not a live data feed.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| All four packages have piVersion 0.67.2 | `node -e "..."` for each package.json | pi-ai: 0.67.2, pi-agent-core: 0.67.2, pi-tui: 0.67.2, pi-coding-agent: 0.67.2 | PASS |
| No @mariozechner/pi-* imports remain | `grep -r '@mariozechner/pi-'` across all 4 src dirs | 0 matches | PASS |
| No TS2307 in build output | `grep 'TS2307' tsc-raw-stderr.txt` | 0 matches | PASS |
| type-errors.md is structured correctly | Head check + grep for section headers | 4 package sections, Total errors: 24 | PASS |
| GSD component files at new 0.67.2 path | `test -f src/modes/interactive/components/{chat-frame,provider-manager,timestamp,tree-render-utils}.ts` | All 4 present | PASS |
| Old 0.57.1 src/components/ path absent | `test -d src/components/` | Directory absent | PASS |
| All 9 task commits exist | `git cat-file -t <hash>` for each | All 9 commits verified: a9ac1c462, 937c305d3, 7bbc53fa1, ab313d807, c7d911e4b, 0a22be4b1, b4fe77213, a6e2e3519, 777fea83f | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| VEND-01 | All 6 plans | Vendored pi-mono packages replaced with 0.67.2 source | SATISFIED | All four packages have piVersion 0.67.2; no 0.57.1 artifacts remain; build gate passed (no TS2307); type-errors.md catalogue exists |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `packages/pi-coding-agent/src/modes/interactive/components/provider-manager.ts` | 20-25 | `getDiscoverableProviders()` returns `[]`; `ModelsJsonWriter` is no-op class; `providerDisplayName(name)` returns `name` | INFO | Intentional stubs for removed 0.67.2 modules (model-discovery.ts, models-json-writer.ts). Documented in 07-05-SUMMARY.md as Phase 08/09 scope. No TS2307 — these are pure behavioral stubs, not missing imports. |

No blocker anti-patterns found. The three stubs in provider-manager.ts are intentional and documented — model-discovery and models-json-writer were removed in 0.67.2 upstream; full restoration is Phase 08 scope.

### Human Verification Required

None. All success criteria are programmatically verifiable and verified.

### Gaps Summary

No gaps. All four ROADMAP success criteria are met:

1. All four packages contain 0.67.2 source — confirmed via piVersion fields, presence of 0.67.2-specific files (models.generated.ts), and absence of 0.57.1-specific artifacts (src/models/ directory, src/components/ path).
2. Build completes without compiler crashes or TS2307 (missing-module) errors — confirmed via tsc-raw-stderr.txt which contains zero TS2307 entries.
3. Type errors are bounded and catalogued — type-errors.md documents 24 errors in pi-coding-agent, all TS2305/TS2724/TS2341/TS2345/TS2551 API shape mismatches that are Phase 08 targets.
4. No 0.57.1 source files remain — confirmed by structural checks (old dirs absent, new 0.67.2 dirs present) and piVersion markers on all packages.

Phase 07 goal is achieved. Phase 08 can proceed with type-errors.md as its starting error inventory.

---

_Verified: 2026-04-15_
_Verifier: Claude (gsd-verifier)_
