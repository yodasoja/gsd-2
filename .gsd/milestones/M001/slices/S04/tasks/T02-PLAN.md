---
estimated_steps: 4
estimated_files: 4
skills_used: []
---

# T02: Wire engine resolver, session, auto.ts exports, and dashboard for custom engine

**Slice:** S04 — Custom Workflow Engine + Run Manager + Loop Integration
**Milestone:** M001

## Description

Connect the pure modules from T01 into the existing auto-mode infrastructure. Four surgical changes:

1. **`engine-resolver.ts`** — Add a branch for custom engine IDs. The resolver currently throws for any `activeEngineId` other than `null`/`"dev"`. Extend `resolveEngine()` to accept `{ activeEngineId, activeRunDir }` and return `CustomWorkflowEngine(activeRunDir)` + `CustomExecutionPolicy()` for non-dev IDs. The `activeRunDir` is required for custom engines (the engine needs it to find GRAPH.yaml).

2. **`auto/session.ts`** — Add `activeRunDir: string | null = null` as a property on `AutoSession`. Add it to `reset()` (set back to null). Add it to `toJSON()` for diagnostic snapshots. This follows the existing pattern used by `activeEngineId`.

3. **`auto.ts`** — Add `setActiveRunDir(runDir: string | null)` and `getActiveRunDir()` exported functions that read/write `s.activeRunDir`. Follow the exact pattern of `setActiveEngineId()`/`getActiveEngineId()` already at lines 361-366.

4. **`auto-dashboard.ts`** — Add `"custom-step"` to the `unitVerb()` and `unitPhaseLabel()` switch statements. `unitVerb("custom-step")` → `"executing workflow step"`. `unitPhaseLabel("custom-step")` → `"WORKFLOW"`.

## Steps

1. Modify `src/resources/extensions/gsd/engine-resolver.ts`:
   - Change the `resolveEngine` parameter type from `{ activeEngineId: string | null }` to `{ activeEngineId: string | null; activeRunDir?: string | null }`.
   - Add a branch after the dev engine check: if `activeEngineId` is not null and not `"dev"`, validate that `activeRunDir` is a non-empty string (throw if not), then import `CustomWorkflowEngine` from `./custom-workflow-engine.js` and `CustomExecutionPolicy` from `./custom-execution-policy.js`, and return `{ engine: new CustomWorkflowEngine(activeRunDir), policy: new CustomExecutionPolicy() }`.
   - Remove the "Unknown engine ID" throw — the custom branch now handles all non-dev IDs.

2. Modify `src/resources/extensions/gsd/auto/session.ts`:
   - Add `activeRunDir: string | null = null;` in the Lifecycle section (right after `activeEngineId`).
   - Add `this.activeRunDir = null;` in `reset()` (right after `this.activeEngineId = null;`).
   - Add `activeRunDir: this.activeRunDir,` in `toJSON()` (right after `activeEngineId`).

3. Modify `src/resources/extensions/gsd/auto.ts`:
   - Add two exported functions immediately after `getActiveEngineId()` (around line 366):
     ```
     export function setActiveRunDir(runDir: string | null): void {
       s.activeRunDir = runDir;
     }
     export function getActiveRunDir(): string | null {
       return s.activeRunDir;
     }
     ```
   - These must NOT be `let`/`var` module-level variables — they access `s.activeRunDir` on the session instance. The auto-session-encapsulation test enforces this.

4. Modify `src/resources/extensions/gsd/auto-dashboard.ts`:
   - In `unitVerb()` switch statement, add: `case "custom-step": return "executing workflow step";`
   - In `unitPhaseLabel()` switch statement, add: `case "custom-step": return "WORKFLOW";`

## Must-Haves

- [ ] `resolveEngine({ activeEngineId: "custom", activeRunDir: "/path/to/run" })` returns `CustomWorkflowEngine`/`CustomExecutionPolicy` pair
- [ ] `resolveEngine({ activeEngineId: "my-workflow", activeRunDir: "/path" })` works (any non-dev ID)
- [ ] `resolveEngine({ activeEngineId: "custom" })` without `activeRunDir` throws
- [ ] `AutoSession.activeRunDir` exists, resets to null, and appears in `toJSON()`
- [ ] `auto.ts` has no new module-level `let`/`var` declarations
- [ ] `unitVerb("custom-step")` returns `"executing workflow step"`
- [ ] `unitPhaseLabel("custom-step")` returns `"WORKFLOW"`

## Verification

- `node --experimental-strip-types --test src/resources/extensions/gsd/tests/auto-session-encapsulation.test.ts` — session encapsulation invariant holds
- `node --experimental-strip-types --test src/resources/extensions/gsd/tests/dev-engine-wrapper.test.ts` — dev engine tests still pass (regression)
- `node --experimental-strip-types --test src/resources/extensions/gsd/tests/engine-interfaces-contract.test.ts` — contract tests still pass

## Inputs

- `src/resources/extensions/gsd/engine-resolver.ts` — existing resolver to extend
- `src/resources/extensions/gsd/auto/session.ts` — session class to extend
- `src/resources/extensions/gsd/auto.ts` — module to add exports to
- `src/resources/extensions/gsd/auto-dashboard.ts` — dashboard to add custom-step rendering
- `src/resources/extensions/gsd/custom-workflow-engine.ts` — T01 output, imported by resolver
- `src/resources/extensions/gsd/custom-execution-policy.ts` — T01 output, imported by resolver

## Expected Output

- `src/resources/extensions/gsd/engine-resolver.ts` — extended with custom engine branch
- `src/resources/extensions/gsd/auto/session.ts` — extended with activeRunDir property
- `src/resources/extensions/gsd/auto.ts` — extended with setActiveRunDir/getActiveRunDir exports
- `src/resources/extensions/gsd/auto-dashboard.ts` — extended with custom-step unit type rendering

## Observability Impact

- **New diagnostic surface:** `s.toJSON()` now includes `activeRunDir`, making the current run directory visible in diagnostic snapshots and crash recovery state. This lets agents and operators see which workflow run is active without inspecting filesystem state.
- **Dashboard signal:** `unitVerb("custom-step")` → `"executing workflow step"` and `unitPhaseLabel("custom-step")` → `"WORKFLOW"` make custom workflow steps visible in the progress widget during auto-mode execution.
- **Engine resolution tracing:** Custom engine resolution errors include the engine ID and the value of `activeRunDir` in the error message, aiding diagnosis when a custom workflow dispatch fails due to missing run state.
- **No new runtime logging:** This task adds no `debugLog` calls — those are wired in T03 when the loop dispatch path is built.
- **Failure inspection:** If `resolveEngine()` throws for a custom engine, the error message contains both the engine ID and the `activeRunDir` value (or `null`/`undefined` if missing), making it clear whether the issue is a missing run setup vs. a code path problem.
