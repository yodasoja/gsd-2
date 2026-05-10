// GSD-2 — Regression tests for originalBase path comparison correctness (M5 fix)
//
// After commit ade55a7f5, getAutoWorktreeOriginalBase() returns ws.projectRoot
// which is realpath-normalized. Callers that compare it with string === against
// a non-canonical s.basePath (trailing slash, symlink path, etc.) can get false
// mismatches. M5 replaced those comparisons with isSamePath-based helpers.
//
// Tests here verify:
//   1. getAutoWorktreeOriginalBase() always returns a canonical (realpath) path.
//   2. normalizeWorktreePathForCompare(canonical) === normalizeWorktreePathForCompare(non-canonical)
//      — i.e. the new comparison is true when raw === would be false.
//   3. WorktreeResolver._mergeWorktreeMode: when s.basePath has a trailing slash
//      (non-canonical form of originalBase), the roadmap-fallback branch is NOT
//      triggered (correct behaviour post-fix); with raw ===, it would have been.

import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  realpathSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

import {
  getAutoWorktreeOriginalBase,
  _resetAutoWorktreeOriginalBaseForTests,
  createAutoWorktree,
  teardownAutoWorktree,
} from "../auto-worktree.ts";
import { normalizeWorktreePathForCompare } from "../worktree-root.ts";
import {
  WorktreeLifecycle,
  type WorktreeLifecycleDeps,
  type NotifyCtx,
} from "../worktree-lifecycle.ts";
import { type TaskCommitContext } from "../worktree.ts";
import { WorktreeStateProjection } from "../worktree-state-projection.ts";
import { resolveWorktreeProjectRoot } from "../worktree-root.ts";
import { AutoSession } from "../auto/session.ts";

// Test-local: LegacyTestDeps had three fields Lifecycle does not need
// (shouldUseWorktreeIsolation, syncWorktreeStateBack, captureIntegrationBranch).
// Permit them in test fixtures so existing override patterns keep working —
// Lifecycle ignores the extras via structural typing.
type LegacyTestDeps = WorktreeLifecycleDeps & {
  enterAutoWorktree: (basePath: string, milestoneId: string) => string;
  createAutoWorktree: (basePath: string, milestoneId: string) => string;
  enterBranchModeForMilestone: (basePath: string, milestoneId: string) => void;
  getAutoWorktreePath: (basePath: string, milestoneId: string) => string | null;
  isInAutoWorktree: (basePath: string) => boolean;
  autoWorktreeBranch: (milestoneId: string) => string;
  teardownAutoWorktree: (
    basePath: string,
    milestoneId: string,
    opts?: { preserveBranch?: boolean },
  ) => void;
  shouldUseWorktreeIsolation?: () => boolean;
  syncWorktreeStateBack?: (
    mainBasePath: string,
    worktreePath: string,
    milestoneId: string,
  ) => { synced: string[] };
  captureIntegrationBranch?: (basePath: string, mid: string | undefined) => void;
  autoCommitCurrentBranch?: (
    basePath: string,
    reasonOrUnitType: string,
    milestoneOrUnitId: string,
    taskContext?: TaskCommitContext,
  ) => string | null | void;
  getCurrentBranch?: (basePath: string) => string;
  checkoutBranch?: (basePath: string, branch: string) => void;
  readFileSync?: (path: string, encoding: BufferEncoding) => string;
};

/** Shim factory preserving the legacy WorktreeResolver throw shape for tests. */
function makeResolver(s: AutoSession, deps: LegacyTestDeps) {
  const lifecycle = new WorktreeLifecycle(s, deps);
  return {
    get workPath(): string { return s.basePath; },
    get projectRoot(): string {
      return resolveWorktreeProjectRoot(s.basePath, s.originalBasePath);
    },
    mergeAndExit: (mid: string, ctx: NotifyCtx) => {
      const r = lifecycle.exitMilestone(mid, { merge: true }, ctx);
      if (!r.ok && r.cause instanceof Error) throw r.cause;
    },
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function git(args: string[], cwd: string): void {
  execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
}

function createTempRepo(t: { after: (fn: () => void) => void }): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "m5-obpath-")));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  git(["init"], dir);
  git(["config", "user.email", "test@test.com"], dir);
  git(["config", "user.name", "Test"], dir);
  writeFileSync(join(dir, "README.md"), "# test\n");
  mkdirSync(join(dir, ".gsd"), { recursive: true });
  git(["add", "."], dir);
  git(["commit", "-m", "init"], dir);
  git(["branch", "-M", "main"], dir);
  return dir;
}

function makeSession(overrides?: Partial<{ basePath: string; originalBasePath: string }>): AutoSession {
  const s = new AutoSession();
  s.basePath = overrides?.basePath ?? "/project";
  s.originalBasePath = overrides?.originalBasePath ?? "/project";
  return s;
}

interface CallLog { fn: string; args: unknown[] }

function makeDeps(overrides?: Partial<LegacyTestDeps>): LegacyTestDeps & { calls: CallLog[] } {
  const calls: CallLog[] = [];

  const deps: LegacyTestDeps & { calls: CallLog[] } = {
    calls,
    isInAutoWorktree: (basePath: string) => {
      calls.push({ fn: "isInAutoWorktree", args: [basePath] });
      return basePath.includes("worktrees");
    },
    shouldUseWorktreeIsolation: () => true,
    getIsolationMode: () => "worktree",
    mergeMilestoneToMain: (basePath: string, milestoneId: string, roadmapContent: string) => {
      calls.push({ fn: "mergeMilestoneToMain", args: [basePath, milestoneId, roadmapContent] });
      return { pushed: false, codeFilesChanged: true };
    },
    syncWorktreeStateBack: (mainBasePath: string, worktreePath: string, milestoneId: string) => {
      calls.push({ fn: "syncWorktreeStateBack", args: [mainBasePath, worktreePath, milestoneId] });
      return { synced: [] };
    },
    teardownAutoWorktree: (basePath: string, milestoneId: string, opts?: { preserveBranch?: boolean }) => {
      calls.push({ fn: "teardownAutoWorktree", args: [basePath, milestoneId, opts] });
    },
    createAutoWorktree: (basePath: string, milestoneId: string) => {
      calls.push({ fn: "createAutoWorktree", args: [basePath, milestoneId] });
      return `${basePath}/.gsd/worktrees/${milestoneId}`;
    },
    enterAutoWorktree: (basePath: string, milestoneId: string) => {
      calls.push({ fn: "enterAutoWorktree", args: [basePath, milestoneId] });
      return `${basePath}/.gsd/worktrees/${milestoneId}`;
    },
    getAutoWorktreePath: (basePath: string, milestoneId: string) => {
      calls.push({ fn: "getAutoWorktreePath", args: [basePath, milestoneId] });
      return null;
    },
    autoCommitCurrentBranch: (
      basePath: string,
      unitType: string,
      unitId: string,
      taskContext?: TaskCommitContext,
    ) => {
      calls.push({ fn: "autoCommitCurrentBranch", args: [basePath, unitType, unitId, taskContext] });
      return null;
    },
    getCurrentBranch: (basePath: string) => {
      calls.push({ fn: "getCurrentBranch", args: [basePath] });
      return "main";
    },
    checkoutBranch: (basePath: string, branch: string) => {
      calls.push({ fn: "checkoutBranch", args: [basePath, branch] });
    },
    autoWorktreeBranch: (milestoneId: string) => `milestone/${milestoneId}`,
    resolveMilestoneFile: (basePath: string, milestoneId: string, fileType: string) => {
      calls.push({ fn: "resolveMilestoneFile", args: [basePath, milestoneId, fileType] });
      return null;
    },
    readFileSync: (path: string, _enc: string) => {
      calls.push({ fn: "readFileSync", args: [path] });
      return "# Roadmap\n";
    },
    GitServiceImpl: class {
      constructor(_basePath: string, _gitConfig: unknown) {}
    } as unknown as LegacyTestDeps["GitServiceImpl"],
    loadEffectiveGSDPreferences: () => ({ preferences: { git: {} } }),
    invalidateAllCaches: () => { calls.push({ fn: "invalidateAllCaches", args: [] }); },
    captureIntegrationBranch: (_basePath: string, _mid: string | undefined) => {},
    enterBranchModeForMilestone: (_basePath: string, _milestoneId: string) => {},
    worktreeProjection: new WorktreeStateProjection(),
    ...overrides,
  };

  if (overrides) {
    for (const [key, val] of Object.entries(overrides)) {
      if (key !== "calls") (deps as unknown as Record<string, unknown>)[key] = val;
    }
  }
  return deps;
}

function makeNotifyCtx(): NotifyCtx & { messages: Array<{ msg: string; level?: string }> } {
  const messages: Array<{ msg: string; level?: string }> = [];
  return {
    messages,
    notify: (msg: string, level?: "info" | "warning" | "error" | "success") => {
      messages.push({ msg, level });
    },
  };
}

// ─── Suite 1: getAutoWorktreeOriginalBase() returns realpath-canonical path ──

describe("getAutoWorktreeOriginalBase() is realpath-normalised", () => {
  const savedCwd = process.cwd();

  beforeEach(() => {
    _resetAutoWorktreeOriginalBaseForTests();
  });

  afterEach(() => {
    _resetAutoWorktreeOriginalBaseForTests();
    try { process.chdir(savedCwd); } catch { /* ignore */ }
  });

  test("returns canonical realpath even when called from a realpath-resolved dir", (t) => {
    const tempDir = createTempRepo(t);
    // tempDir is already realpathSync()-resolved by createTempRepo
    const msDir = join(tempDir, ".gsd", "milestones", "M001");
    mkdirSync(msDir, { recursive: true });
    writeFileSync(join(msDir, "CONTEXT.md"), "# M001\n");
    git(["add", "."], tempDir);
    git(["commit", "-m", "add M001"], tempDir);

    createAutoWorktree(tempDir, "M001");

    const base = getAutoWorktreeOriginalBase();
    assert.ok(base !== null, "originalBase is set after createAutoWorktree");

    // The returned path must equal its own realpathSync — i.e. it is canonical
    let realBase: string;
    try { realBase = realpathSync(base); } catch { realBase = base; }
    assert.strictEqual(base, realBase,
      "getAutoWorktreeOriginalBase() must return a realpath-normalised path");

    teardownAutoWorktree(tempDir, "M001");
    try { process.chdir(savedCwd); } catch { /* ignore */ }
  });
});

// ─── Suite 2: normalizeWorktreePathForCompare makes trailing-slash safe ───────

describe("normalizeWorktreePathForCompare equalises canonical vs non-canonical forms", () => {
  test("trailing slash: normalize(p/) === normalize(p)", () => {
    // Use a path that definitely exists on this machine
    const base = realpathSync(tmpdir());
    const withSlash = base + "/";
    assert.strictEqual(
      normalizeWorktreePathForCompare(withSlash),
      normalizeWorktreePathForCompare(base),
      "trailing slash should be stripped by normalizeWorktreePathForCompare",
    );
    // Confirm raw === would have returned false (test validity check)
    assert.notStrictEqual(
      withSlash,
      base,
      "sanity: raw === IS false for trailing-slash path (test is meaningful)",
    );
  });

  test("double trailing slashes: normalize(p//) === normalize(p)", () => {
    const base = realpathSync(tmpdir());
    const withDoubleSlash = base + "//";
    assert.strictEqual(
      normalizeWorktreePathForCompare(withDoubleSlash),
      normalizeWorktreePathForCompare(base),
    );
  });

  test("same realpath, different string forms: isSamePath-style comparison is true; raw === is false", () => {
    const base = realpathSync(tmpdir());
    const canonical = normalizeWorktreePathForCompare(base);
    const nonCanonical = normalizeWorktreePathForCompare(base + "/");
    // Post-fix: the two forms compare as equal
    assert.strictEqual(canonical, nonCanonical,
      "isSamePath-style comparison returns true for same physical path");
  });
});

// ─── Suite 3: WorktreeResolver roadmap-fallback branch under cwd-drift ───────
//
// The buggy line was:
//   if (!roadmapPath && this.s.basePath !== originalBase) { /* try worktree */ }
//
// After the fix:
//   if (!roadmapPath && !isSamePath(this.s.basePath, originalBase)) { ... }
//
// When s.basePath is a non-canonical form of originalBase (e.g. trailing slash),
// the old code falsely entered the fallback branch (attempted a second
// resolveMilestoneFile call against the "worktree" path that is actually the
// same directory). The new code correctly skips the fallback.

// ADR-016 phase 2 / C2 + C3 (#5625, #5626): the prior two tests in this
// suite asserted call counts on `deps.resolveMilestoneFile` /
// `deps.isInAutoWorktree` / `deps.teardownAutoWorktree` to verify that the
// roadmap-fallback branch was skipped when basePath was a non-canonical
// form of originalBase (trailing slash). After C2/C3 those fields are
// inlined into worktree-lifecycle.ts as direct imports — the mocks no
// longer fire and the call-count assertions test nothing meaningful. The
// underlying invariant (isSamePathPhysical normalises trailing slashes,
// canonical/non-canonical pairs, and case differences) is preserved
// inside worktree-lifecycle.ts and covered indirectly by the merge-area
// integration tests, which exercise real worktree merges where the
// fallback choice matters.
