// Project/App: GSD-2
// File Purpose: ADR-017 contract tests for drift-driven State Reconciliation
// (issue #5700). Covers: end-to-end sketch-flag drift, repair-throw path, and
// Recovery Classification mapping for ReconciliationFailedError.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  openDatabase,
  closeDatabase,
  insertMilestone,
  insertSlice,
  getSlice,
} from "../gsd-db.ts";
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
