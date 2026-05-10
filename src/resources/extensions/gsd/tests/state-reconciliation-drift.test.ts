// Project/App: GSD-2
// File Purpose: ADR-017 contract tests for drift-driven State Reconciliation.
// Covers sketch-flag (#5700), merge-state (#5701), stale-render (#5702), and
// stale-worker (#5703) drift end-to-end, plus the repair-throw and
// persistent-drift error paths and Recovery Classification mapping for
// ReconciliationFailedError.

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

import {
  openDatabase,
  closeDatabase,
  insertMilestone,
  insertSlice,
  insertTask,
  getSlice,
  setSliceSummaryMd,
} from "../gsd-db.ts";
import { clearParseCache } from "../files.ts";
import { clearPathCache } from "../paths.ts";
import { detectStaleRenders } from "../markdown-renderer.ts";
import { invalidateStateCache } from "../state.ts";
import {
  reconcileBeforeDispatch,
  ReconciliationFailedError,
  type DriftHandler,
  type DriftRecord,
} from "../state-reconciliation.ts";
import { classifyFailure } from "../recovery-classification.ts";
import type { GSDState } from "../types.ts";

function makeState(overrides: Partial<GSDState> = {}): GSDState {
  return {
    activeMilestone: { id: "M001", title: "Milestone" },
    activeSlice: null,
    activeTask: null,
    phase: "planning",
    recentDecisions: [],
    blockers: [],
    nextAction: "Plan milestone",
    registry: [],
    requirements: { active: 0, validated: 0, deferred: 0, outOfScope: 0, blocked: 0, total: 0 },
    progress: { milestones: { done: 0, total: 1 } },
    ...overrides,
  };
}

function makeFixtureBase(): string {
  const base = mkdtempSync(join(tmpdir(), "gsd-adr017-drift-"));
  mkdirSync(join(base, ".gsd", "milestones", "M001", "slices", "S02"), { recursive: true });
  return base;
}

function cleanup(base: string): void {
  try {
    closeDatabase();
  } catch {
    /* noop */
  }
  try {
    rmSync(base, { recursive: true, force: true });
  } catch {
    /* noop */
  }
}

test("ADR-017 (#5700): sketch-flag drift detected and repaired end-to-end", async (t) => {
  const base = makeFixtureBase();
  t.after(() => cleanup(base));

  openDatabase(join(base, ".gsd", "gsd.db"));
  insertMilestone({ id: "M001", title: "Test", status: "active" });
  insertSlice({
    id: "S02",
    milestoneId: "M001",
    title: "Feature",
    status: "pending",
    risk: "medium",
    depends: [],
    demo: "S02 demo.",
    sequence: 1,
    isSketch: true,
    sketchScope: "limited",
  });

  // Simulate the post-crash scenario: PLAN.md exists on disk but the
  // is_sketch flag is still 1.
  writeFileSync(
    join(base, ".gsd", "milestones", "M001", "slices", "S02", "S02-PLAN.md"),
    "# S02 Plan\n",
  );
  assert.equal(getSlice("M001", "S02")?.is_sketch, 1, "pre: flagged as sketch");

  const state = makeState({ activeMilestone: { id: "M001", title: "Test" } });
  const result = await reconcileBeforeDispatch(base, {
    invalidateStateCache: () => {},
    deriveState: async () => state,
  });

  assert.equal(result.ok, true);
  assert.equal(getSlice("M001", "S02")?.is_sketch, 0, "post: flag cleared");
  assert.equal(result.repaired.length, 1);
  assert.equal(result.repaired[0]?.kind, "stale-sketch-flag");
  if (result.repaired[0]?.kind === "stale-sketch-flag") {
    assert.equal(result.repaired[0].mid, "M001");
    assert.equal(result.repaired[0].sid, "S02");
  }
});

test("ADR-017 (#5700): repair failure throws ReconciliationFailedError with shape", async () => {
  const seenDrift: DriftRecord = { kind: "stale-sketch-flag", mid: "M001", sid: "S02" };
  const handler: DriftHandler = {
    kind: "stale-sketch-flag",
    detect: () => [seenDrift],
    repair: () => {
      throw new Error("simulated repair failure");
    },
  };

  await assert.rejects(
    () =>
      reconcileBeforeDispatch("/project", {
        invalidateStateCache: () => {},
        deriveState: async () => makeState(),
        registry: [handler],
      }),
    (err: unknown) => {
      assert.ok(err instanceof ReconciliationFailedError, "must be ReconciliationFailedError");
      assert.equal(err.failures.length, 1);
      assert.equal(err.failures[0]?.drift.kind, "stale-sketch-flag");
      assert.ok(err.failures[0]?.cause instanceof Error);
      assert.equal((err.failures[0]?.cause as Error).message, "simulated repair failure");
      assert.equal(err.pass, 0);
      assert.equal(err.persistentDrift.length, 0);
      return true;
    },
  );
});

test("ADR-017 (#5700): detector failure throws ReconciliationFailedError with shape", async () => {
  const handler: DriftHandler = {
    kind: "stale-sketch-flag",
    detect: () => {
      throw new Error("simulated detect failure");
    },
    repair: () => {
      /* detect fails before repair */
    },
  };

  await assert.rejects(
    () =>
      reconcileBeforeDispatch("/project", {
        invalidateStateCache: () => {},
        deriveState: async () => makeState(),
        registry: [handler],
      }),
    (err: unknown) => {
      assert.ok(err instanceof ReconciliationFailedError, "must be ReconciliationFailedError");
      assert.equal(err.failures.length, 1);
      assert.equal(err.failures[0]?.drift.kind, "stale-sketch-flag");
      assert.ok(err.failures[0]?.cause instanceof Error);
      assert.equal((err.failures[0]?.cause as Error).message, "simulated detect failure");
      assert.equal(err.pass, 0);
      assert.equal(err.detectionFailures.length, 0);
      assert.equal(err.persistentDrift.length, 0);
      return true;
    },
  );
});

test("ADR-017 (#5700): persistent drift after cap=2 throws ReconciliationFailedError", async () => {
  // Detect always returns one drift; repair is a no-op (drift never goes away).
  const persistent: DriftRecord = { kind: "stale-sketch-flag", mid: "M001", sid: "S02" };
  const handler: DriftHandler = {
    kind: "stale-sketch-flag",
    detect: () => [persistent],
    repair: () => {
      /* no-op: drift cannot be cleared */
    },
  };

  await assert.rejects(
    () =>
      reconcileBeforeDispatch("/project", {
        invalidateStateCache: () => {},
        deriveState: async () => makeState(),
        registry: [handler],
      }),
    (err: unknown) => {
      assert.ok(err instanceof ReconciliationFailedError);
      assert.equal(err.failures.length, 0);
      assert.equal(err.persistentDrift.length, 1);
      assert.equal(err.persistentDrift[0]?.kind, "stale-sketch-flag");
      return true;
    },
  );
});

test("ADR-017 (#5700): classifyFailure recognizes ReconciliationFailedError", () => {
  const err = new ReconciliationFailedError({
    failures: [
      {
        drift: { kind: "stale-sketch-flag", mid: "M001", sid: "S02" },
        cause: new Error("boom"),
      },
    ],
    pass: 0,
  });

  const result = classifyFailure({ error: err });

  assert.equal(result.failureKind, "reconciliation-drift");
  assert.equal(result.action, "escalate");
  assert.equal(result.exitReason, "reconciliation-drift");
  assert.match(result.remediation, /persistent or repair-failed drift kinds/);
});

// ─── #5701: merge-state drift ────────────────────────────────────────────────

function makeGitBase(): string {
  const base = join(tmpdir(), `gsd-adr017-merge-${randomUUID()}`);
  mkdirSync(base, { recursive: true });
  execFileSync("git", ["init", "--initial-branch=main"], { cwd: base, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "test@test.com"], { cwd: base, stdio: "ignore" });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: base, stdio: "ignore" });
  writeFileSync(join(base, ".gitkeep"), "");
  execFileSync("git", ["add", "."], { cwd: base, stdio: "ignore" });
  execFileSync("git", ["commit", "-m", "initial"], { cwd: base, stdio: "ignore" });
  return base;
}

function rmTreeQuiet(base: string): void {
  try {
    rmSync(base, { recursive: true, force: true });
  } catch {
    /* noop */
  }
}

test("ADR-017 (#5701): merge-state drift detected and repaired end-to-end", async (t) => {
  const base = makeGitBase();
  t.after(() => rmTreeQuiet(base));

  // Build a clean fast-forward-resolvable merge: feature branch with one file,
  // then start merge --no-commit on main so MERGE_HEAD exists with no conflicts.
  execFileSync("git", ["checkout", "-b", "feature"], { cwd: base, stdio: "ignore" });
  writeFileSync(join(base, "feature.txt"), "feature content");
  execFileSync("git", ["add", "."], { cwd: base, stdio: "ignore" });
  execFileSync("git", ["commit", "-m", "add feature"], { cwd: base, stdio: "ignore" });
  execFileSync("git", ["checkout", "main"], { cwd: base, stdio: "ignore" });
  execFileSync("git", ["merge", "--no-ff", "--no-commit", "feature"], { cwd: base, stdio: "ignore" });

  assert.ok(existsSync(join(base, ".git", "MERGE_HEAD")), "pre: MERGE_HEAD exists");

  const result = await reconcileBeforeDispatch(base, {
    invalidateStateCache: () => {},
    deriveState: async () => makeState(),
  });

  assert.equal(result.ok, true);
  assert.equal(
    existsSync(join(base, ".git", "MERGE_HEAD")),
    false,
    "post: MERGE_HEAD cleared after reconciliation",
  );
  const mergeRepaired = result.repaired.find((d) => d.kind === "unmerged-merge-state");
  assert.ok(mergeRepaired, "repaired list should include the merge-state drift record");
  if (mergeRepaired?.kind === "unmerged-merge-state") {
    assert.equal(mergeRepaired.basePath, base);
  }
});

test("ADR-017 (#5701): merge-state drift is detected in linked worktrees", async (t) => {
  const base = makeGitBase();
  const worktree = join(tmpdir(), `gsd-adr017-worktree-${randomUUID()}`);
  t.after(() => {
    rmTreeQuiet(worktree);
    rmTreeQuiet(base);
  });

  execFileSync("git", ["checkout", "-b", "feature"], { cwd: base, stdio: "ignore" });
  writeFileSync(join(base, "feature.txt"), "feature content");
  execFileSync("git", ["add", "."], { cwd: base, stdio: "ignore" });
  execFileSync("git", ["commit", "-m", "add feature"], { cwd: base, stdio: "ignore" });
  execFileSync("git", ["checkout", "main"], { cwd: base, stdio: "ignore" });
  execFileSync("git", ["worktree", "add", "-b", "wt-main", worktree, "main"], {
    cwd: base,
    stdio: "ignore",
  });
  execFileSync("git", ["merge", "--no-ff", "--no-commit", "feature"], {
    cwd: worktree,
    stdio: "ignore",
  });

  const mergeHeadPath = execFileSync("git", ["rev-parse", "--git-path", "MERGE_HEAD"], {
    cwd: worktree,
    encoding: "utf-8",
  }).trim();
  assert.ok(existsSync(mergeHeadPath), "pre: MERGE_HEAD exists in resolved worktree gitdir");
  assert.equal(existsSync(join(worktree, ".git", "MERGE_HEAD")), false);

  const result = await reconcileBeforeDispatch(worktree, {
    invalidateStateCache: () => {},
    deriveState: async () => makeState(),
  });

  assert.equal(result.ok, true);
  assert.equal(existsSync(mergeHeadPath), false, "post: MERGE_HEAD cleared after reconciliation");
  assert.ok(
    result.repaired.some((d) => d.kind === "unmerged-merge-state"),
    "repaired list should include the worktree merge-state drift record",
  );
});

test("ADR-017 (#5701): no merge state → detector returns no drift", async (t) => {
  const base = makeGitBase();
  t.after(() => rmTreeQuiet(base));

  const result = await reconcileBeforeDispatch(base, {
    invalidateStateCache: () => {},
    deriveState: async () => makeState(),
  });

  assert.equal(result.ok, true);
  assert.equal(
    result.repaired.some((d) => d.kind === "unmerged-merge-state"),
    false,
    "no merge drift should be reported when the repo is clean",
  );
});

// ─── #5702: stale-render drift ───────────────────────────────────────────────

function clearRendererCaches(): void {
  clearParseCache();
  clearPathCache();
  invalidateStateCache();
}

function makeStalePlanContent(sliceId: string, tasks: Array<{ id: string; title: string; done: boolean }>): string {
  const lines: string[] = [];
  lines.push(`# ${sliceId}: Test Slice`);
  lines.push("");
  lines.push("**Goal:** Test slice goal");
  lines.push("**Demo:** Test demo");
  lines.push("");
  lines.push("## Must-Haves");
  lines.push("");
  lines.push("- Everything works");
  lines.push("");
  lines.push("## Tasks");
  lines.push("");
  for (const t of tasks) {
    const checkbox = t.done ? "[x]" : "[ ]";
    lines.push(`- ${checkbox} **${t.id}: ${t.title}** \`est:1h\``);
  }
  lines.push("");
  return lines.join("\n");
}

function makeStaleRoadmapContent(slices: Array<{ id: string; title: string; done: boolean }>): string {
  const lines: string[] = [];
  lines.push("# M001 Roadmap");
  lines.push("");
  lines.push("**Vision:** Test milestone");
  lines.push("");
  lines.push("## Slices");
  lines.push("");
  for (const s of slices) {
    const checkbox = s.done ? "[x]" : "[ ]";
    lines.push(`- ${checkbox} **${s.id}: ${s.title}** \`risk:medium\` \`depends:[]\``);
  }
  lines.push("");
  return lines.join("\n");
}

test("ADR-017 (#5702): stale-render drift detected and repaired end-to-end", async (t) => {
  const base = mkdtempSync(join(tmpdir(), "gsd-adr017-render-"));
  const sliceDir = join(base, ".gsd", "milestones", "M001", "slices", "S01");
  mkdirSync(join(sliceDir, "tasks"), { recursive: true });
  t.after(() => {
    try { closeDatabase(); } catch { /* noop */ }
    rmTreeQuiet(base);
  });

  openDatabase(join(base, ".gsd", "gsd.db"));
  clearRendererCaches();
  insertMilestone({ id: "M001", title: "Test", status: "active" });
  insertSlice({ id: "S01", milestoneId: "M001", title: "Slice", status: "pending" });
  insertTask({ id: "T01", sliceId: "S01", milestoneId: "M001", title: "First task", status: "done" });
  insertTask({ id: "T02", sliceId: "S01", milestoneId: "M001", title: "Second task", status: "done" });

  // Plan with both tasks unchecked — DB says done, file disagrees.
  const planPath = join(sliceDir, "S01-PLAN.md");
  writeFileSync(planPath, makeStalePlanContent("S01", [
    { id: "T01", title: "First task", done: false },
    { id: "T02", title: "Second task", done: false },
  ]));
  clearRendererCaches();

  const result = await reconcileBeforeDispatch(base, {
    invalidateStateCache: () => {},
    deriveState: async () => makeState(),
  });

  assert.equal(result.ok, true);
  const renderRepaired = result.repaired.find((d) => d.kind === "stale-render");
  assert.ok(renderRepaired, "repaired list should include the stale-render drift");

  const repairedContent = readFileSync(planPath, "utf-8");
  assert.match(repairedContent, /\[x\][^\n]*T01:/, "T01 checkbox should be checked after repair");
  assert.match(repairedContent, /\[x\][^\n]*T02:/, "T02 checkbox should be checked after repair");
});

test("ADR-017 (#5702): stale-render detector reason strings match repair contract", (t) => {
  const base = mkdtempSync(join(tmpdir(), "gsd-adr017-render-reasons-"));
  const sliceDir = join(base, ".gsd", "milestones", "M001", "slices", "S01");
  mkdirSync(join(sliceDir, "tasks"), { recursive: true });
  t.after(() => {
    try { closeDatabase(); } catch { /* noop */ }
    rmTreeQuiet(base);
  });

  openDatabase(join(base, ".gsd", "gsd.db"));
  clearRendererCaches();
  insertMilestone({ id: "M001", title: "Test", status: "active" });
  insertSlice({ id: "S01", milestoneId: "M001", title: "Slice", status: "complete" });
  insertTask({
    id: "T01",
    sliceId: "S01",
    milestoneId: "M001",
    title: "First task",
    status: "done",
    fullSummaryMd: "# T01 Summary\n",
  });
  setSliceSummaryMd("M001", "S01", "# S01 Summary\n", "# S01 UAT\n");

  writeFileSync(
    join(base, ".gsd", "milestones", "M001", "M001-ROADMAP.md"),
    makeStaleRoadmapContent([{ id: "S01", title: "Slice", done: false }]),
  );
  writeFileSync(
    join(sliceDir, "S01-PLAN.md"),
    makeStalePlanContent("S01", [{ id: "T01", title: "First task", done: false }]),
  );
  clearRendererCaches();

  const reasons = detectStaleRenders(base).map((entry) => entry.reason).sort();

  assert.deepEqual(reasons, [
    "S01 is closed in DB but unchecked in roadmap",
    "S01 is complete with UAT in DB but UAT.md missing on disk",
    "S01 is complete with summary in DB but SUMMARY.md missing on disk",
    "T01 is complete with summary in DB but SUMMARY.md missing on disk",
    "T01 is done in DB but unchecked in plan",
  ].sort());
});

// ─── #5703: stale-worker drift ───────────────────────────────────────────────

const DEAD_PID = 999_999_999; // far above any realistic system PID; process.kill(pid, 0) → ESRCH

function writeFakeSessionLock(base: string, pid: number): string {
  const gsdDir = join(base, ".gsd");
  mkdirSync(gsdDir, { recursive: true });
  const lockFile = join(gsdDir, "auto.lock");
  // Mirror SessionLockData minimum shape
  writeFileSync(
    lockFile,
    JSON.stringify({
      pid,
      startedAt: new Date().toISOString(),
      unitType: "starting",
      unitId: "bootstrap",
    }),
  );
  // Also create the proper-lockfile directory artifact at <gsdDir>.lock
  mkdirSync(`${gsdDir}.lock`, { recursive: true });
  return lockFile;
}

test("ADR-017 (#5703): stale-worker drift detected and orphaned lock cleared", async (t) => {
  const base = mkdtempSync(join(tmpdir(), "gsd-adr017-worker-"));
  t.after(() => rmSync(base, { recursive: true, force: true }));

  const lockFile = writeFakeSessionLock(base, DEAD_PID);
  assert.ok(existsSync(lockFile), "pre: lock file written");

  const result = await reconcileBeforeDispatch(base, {
    invalidateStateCache: () => {},
    deriveState: async () => makeState(),
  });

  assert.equal(result.ok, true);
  assert.equal(existsSync(lockFile), false, "post: orphaned lock file removed");
  const workerRepaired = result.repaired.find((d) => d.kind === "stale-worker");
  assert.ok(workerRepaired, "repaired list should include the stale-worker drift");
  if (workerRepaired?.kind === "stale-worker") {
    assert.equal(workerRepaired.pid, DEAD_PID);
  }
});

test("ADR-017 (#5703): live worker lock is not cleared", async (t) => {
  const base = mkdtempSync(join(tmpdir(), "gsd-adr017-worker-live-"));
  t.after(() => rmSync(base, { recursive: true, force: true }));

  // PID 1 (init/launchd): process.kill(1, 0) returns EPERM as non-root, which
  // isPidAlive correctly treats as alive. process.pid would be rejected by the
  // self-PID guard in isPidAlive (treated as not alive).
  const ALIVE_PID = 1;
  const lockFile = writeFakeSessionLock(base, ALIVE_PID);
  assert.ok(existsSync(lockFile), "pre: lock file written");

  const result = await reconcileBeforeDispatch(base, {
    invalidateStateCache: () => {},
    deriveState: async () => makeState(),
  });

  assert.equal(result.ok, true);
  assert.equal(
    existsSync(lockFile),
    true,
    "live lock must NOT be cleared (would steal the lock from a running session)",
  );
  assert.equal(
    result.repaired.some((d) => d.kind === "stale-worker"),
    false,
    "no stale-worker drift should be reported when the lock owner is alive",
  );
});

// ─── Lifecycle and classification ────────────────────────────────────────────

test("ADR-017 (#5700): cascading drift triggers second pass within cap", async () => {
  // First pass detects drift A; repair "fixes" it. Second pass detects drift B
  // (cascading); repair fixes it. Third call would see no drift. Cap=2 means
  // we have exactly two repair passes available.
  const detectedSequence: DriftRecord[][] = [
    [{ kind: "stale-sketch-flag", mid: "M001", sid: "S02" }],
    [{ kind: "stale-sketch-flag", mid: "M001", sid: "S03" }],
    [],
  ];
  let detectCallIdx = 0;
  const repaired: DriftRecord[] = [];

  const handler: DriftHandler = {
    kind: "stale-sketch-flag",
    detect: () => detectedSequence[detectCallIdx++] ?? [],
    repair: (record) => {
      repaired.push(record);
    },
  };

  const result = await reconcileBeforeDispatch("/project", {
    invalidateStateCache: () => {},
    deriveState: async () => makeState(),
    registry: [handler],
  });

  assert.equal(result.ok, true);
  assert.equal(result.repaired.length, 2, "both passes' repairs collected");
  assert.equal(repaired.length, 2);
});
