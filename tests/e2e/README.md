# GSD-2 e2e tests

End-to-end tests that spawn the **real built** `gsd` binary as a child process
and exercise it through realistic flows.

These exist to catch regressions that mock-heavy unit/integration tests can't:
real argv parsing, real env handling, real signal/exit behavior, real I/O.

## Running locally

```bash
npm run build:core
chmod +x dist/loader.js
GSD_SMOKE_BINARY="$(pwd)/dist/loader.js" npm run test:e2e
```

If `GSD_SMOKE_BINARY` is not set, the suite falls back to whatever `gsd`
resolves on PATH (matching the convention used by `tests/live-regression`).

## Writing a new e2e test

1. Create `tests/e2e/<feature>.e2e.test.ts`. The `.e2e.test.ts` suffix is
   what `npm run test:e2e` globs.
2. Use `node:test` + `node:assert/strict`. No Jest, no Vitest.
3. Use `t.after()` for cleanup. Never `try`/`finally`.
4. Import helpers from `./_shared/`:

```ts
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createTmpProject, gsdSync, gsdAsync } from "./_shared/index.ts";

describe("my feature", () => {
  test("does the thing", (t) => {
    const project = createTmpProject({ git: true });
    t.after(project.cleanup);

    const result = gsdSync(["some-command"], { cwd: project.dir });

    assert.equal(result.code, 0);
    assert.match(result.stdoutClean, /expected output/);
  });
});
```

## Harness contracts (`_shared/`)

- **`spawn.ts`** — `gsdSync` / `gsdAsync` wrappers. Both:
  - Resolve `GSD_SMOKE_BINARY` → `node <path>` vs PATH `gsd` automatically.
  - Strip every `GSD_*` env var inherited from the host (prevents local
    config leaking into CI).
  - Set `TMPDIR` to the canonical (realpath) tmpdir to avoid the macOS
    `/var` vs `/private/var` symlink mismatch.
  - Force `GSD_NON_INTERACTIVE=1`.
  - Provide ANSI-stripped output via `result.stdoutClean` / `stderrClean`.
- **`tmp-project.ts`** — `createTmpProject({ git, gsdSkeleton, files })`
  returns `{ dir, cleanup, writeFile }`. Always wire `t.after(cleanup)`.
  `git: true` initializes with `--initial-branch=main` for cross-platform
  determinism.
- **`artifacts.ts`** — `artifactsFor(testSlug)` returns `{ dir, write }`.
  Use it to dump logs/screenshots/traces from a test that's about to fail
  so CI can upload them.

## Anti-patterns to avoid

- ❌ Reading source files and grepping with regex — see "No source-grep
  tests" in [CONTRIBUTING.md](../../CONTRIBUTING.md). E2e is the wrong layer
  for that anyway.
- ❌ Spawning `gsd` directly with `child_process.spawn` — bypasses the
  env-stripping and TMPDIR fix. Always go through `gsdSync` / `gsdAsync`.
- ❌ Asserting on raw ANSI-coded output. Use `result.stdoutClean`.
- ❌ Calling real LLM/network APIs. Future phases land a fake-LLM provider
  that replays scripted transcripts; until then, e2e tests must avoid any
  flow that requires network.

## Status

- ✅ Phase 0 (shared harness)
- ✅ Phase 1a (sanity: `--version`, `--help`, env isolation)
- ⏳ Phase 1b (fake-LLM provider + agent loop test) — next PR
- ⏳ Phase 2 (real-process MCP server e2e)
- ⏳ Phase 6 (native TS↔Rust ABI smoke)
- ⏳ Phase 7 (migration smoke)

See the e2e remediation plan in the parent PR description for the full sequence.
