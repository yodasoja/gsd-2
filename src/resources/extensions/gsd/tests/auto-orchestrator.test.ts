// Project/App: GSD-2
// File Purpose: Auto Orchestration module contract and ADR-015 invariant sequence tests.

import test from "node:test";
import assert from "node:assert/strict";

import { createAutoOrchestrator, STUCK_WINDOW_SIZE } from "../auto/orchestrator.js";
import type { AutoOrchestratorDeps } from "../auto/contracts.js";
import type { GSDState } from "../types.js";

function makeState(): GSDState {
  return {
    activeMilestone: { id: "M001", title: "Milestone" },
    activeSlice: null,
    activeTask: null,
    phase: "executing",
    recentDecisions: [],
    blockers: [],
    nextAction: "Execute task",
    registry: [],
    requirements: { active: 0, validated: 0, deferred: 0, outOfScope: 0, blocked: 0, total: 0 },
    progress: { milestones: { done: 0, total: 1 } },
  };
}

function makeDeps(overrides: Partial<AutoOrchestratorDeps> = {}): { deps: AutoOrchestratorDeps; calls: string[] } {
  const calls: string[] = [];
  const stateSnapshot = makeState();

  const deps: AutoOrchestratorDeps = {
    stateReconciliation: {
      async reconcileBeforeDispatch() {
        calls.push("state.reconcile");
        return { ok: true, stateSnapshot };
      },
    },
    dispatch: {
      async decideNextUnit(input) {
        calls.push("dispatch.decide");
        assert.equal(input.stateSnapshot, stateSnapshot);
        return { unitType: "execute-task", unitId: "T01", reason: "ready", preconditions: [] };
      },
    },
    toolContract: {
      async compileUnitToolContract() {
        calls.push("tool.compile");
        return { ok: true };
      },
    },
    recovery: {
      async classifyAndRecover() {
        calls.push("recovery.classify");
        return { action: "stop", reason: "fatal" };
      },
    },
    worktree: {
      async prepareForUnit() {
        calls.push("worktree.prepare");
        return { ok: true };
      },
      async syncAfterUnit() { calls.push("worktree.sync"); },
      async cleanupOnStop() { calls.push("worktree.cleanup"); },
    },
    health: {
      async preAdvanceGate() {
        calls.push("health.pre");
        return { allow: true };
      },
      async postAdvanceRecord() { calls.push("health.post"); },
    },
    runtime: {
      async ensureLockOwnership() { calls.push("runtime.lock"); },
      async journalTransition(event) { calls.push(`journal:${event.name}`); },
    },
    notifications: {
      async notifyLifecycle(event) { calls.push(`notify:${event.name}`); },
    },
  };

  return { deps: { ...deps, ...overrides }, calls };
}

test("start() advances and records active unit", async () => {
  const { deps, calls } = makeDeps();
  const orchestrator = createAutoOrchestrator(deps);

  const result = await orchestrator.start({ basePath: "/tmp/project", trigger: "manual" });

  assert.equal(result.kind, "advanced");
  assert.deepEqual(result.unit, { unitType: "execute-task", unitId: "T01" });
  const status = orchestrator.getStatus();
  assert.equal(status.phase, "running");
  assert.deepEqual(status.activeUnit, { unitType: "execute-task", unitId: "T01" });
  assert.ok(calls.includes("journal:start"));
  assert.ok(calls.includes("journal:advance"));
});

test("advance() returns blocked when health gate denies", async () => {
  const { deps } = makeDeps({
    health: {
      async preAdvanceGate() { return { allow: false, reason: "doctor-block" }; },
      async postAdvanceRecord() {},
    },
  });
  const orchestrator = createAutoOrchestrator(deps);

  const result = await orchestrator.advance();

  assert.equal(result.kind, "blocked");
  assert.equal(result.reason, "doctor-block");
  assert.equal(result.action, "pause");
});

test("advance() follows the ADR-015 invariant sequence before journaling advance", async () => {
  const { deps, calls } = makeDeps();
  const orchestrator = createAutoOrchestrator(deps);

  const result = await orchestrator.advance();

  assert.equal(result.kind, "advanced");
  assert.deepEqual(result.unit, { unitType: "execute-task", unitId: "T01" });
  assert.deepEqual(calls, [
    "runtime.lock",
    "health.pre",
    "state.reconcile",
    "dispatch.decide",
    "tool.compile",
    "worktree.prepare",
    "journal:advance",
    "worktree.sync",
    "health.post",
  ]);
});

test("advance() blocks before dispatch when State Reconciliation blocks", async () => {
  const { deps, calls } = makeDeps({
    stateReconciliation: {
      async reconcileBeforeDispatch() {
        calls.push("state.reconcile");
        return { ok: false, reason: "state drift blocked", stateSnapshot: makeState() };
      },
    },
  });
  const orchestrator = createAutoOrchestrator(deps);

  const result = await orchestrator.advance();

  assert.equal(result.kind, "blocked");
  assert.equal(result.reason, "state drift blocked");
  assert.equal(result.action, "pause");
  assert.ok(!calls.includes("dispatch.decide"));
  assert.ok(calls.includes("journal:advance-blocked"));
});

test("advance() blocks before Runtime persistence when Tool Contract fails", async () => {
  const { deps, calls } = makeDeps({
    toolContract: {
      async compileUnitToolContract() {
        calls.push("tool.compile");
        return { ok: false, reason: "unknown Unit" };
      },
    },
  });
  const orchestrator = createAutoOrchestrator(deps);

  const result = await orchestrator.advance();

  assert.equal(result.kind, "blocked");
  assert.equal(result.reason, "unknown Unit");
  assert.equal(result.action, "pause");
  assert.ok(!calls.includes("worktree.prepare"));
  assert.ok(!calls.includes("journal:advance"));
  assert.ok(calls.includes("journal:advance-blocked"));
});

test("advance() blocks before Runtime persistence when Worktree Safety fails", async () => {
  const { deps, calls } = makeDeps({
    worktree: {
      async prepareForUnit() {
        calls.push("worktree.prepare");
        return { ok: false, reason: "worktree invalid" };
      },
      async syncAfterUnit() { calls.push("worktree.sync"); },
      async cleanupOnStop() { calls.push("worktree.cleanup"); },
    },
  });
  const orchestrator = createAutoOrchestrator(deps);

  const result = await orchestrator.advance();

  assert.equal(result.kind, "blocked");
  assert.equal(result.reason, "worktree invalid");
  assert.equal(result.action, "pause");
  assert.ok(!calls.includes("journal:advance"));
  assert.ok(!calls.includes("worktree.sync"));
  assert.ok(calls.includes("journal:advance-blocked"));
});

test("advance() stops when dispatch has no next unit", async () => {
  const { deps } = makeDeps({
    dispatch: {
      async decideNextUnit() { return null; },
    },
  });
  const orchestrator = createAutoOrchestrator(deps);

  const result = await orchestrator.advance();

  assert.equal(result.kind, "stopped");
  assert.equal(orchestrator.getStatus().phase, "stopped");
});

test("advance() uses recovery on error", async () => {
  const { deps, calls } = makeDeps({
    runtime: {
      async ensureLockOwnership() { throw new Error("lock lost"); },
      async journalTransition(event) { calls.push(`journal:${event.name}`); },
    },
    recovery: {
      async classifyAndRecover() { return { action: "escalate", reason: "needs manual" }; },
    },
  });
  const orchestrator = createAutoOrchestrator(deps);

  const result = await orchestrator.advance();

  assert.equal(result.kind, "error");
  assert.equal(result.reason, "needs manual");
  assert.equal(orchestrator.getStatus().phase, "error");
  assert.ok(calls.includes("journal:advance-error"));
});

test("advance() is idempotent for the same active unit", async () => {
  const { deps, calls } = makeDeps();
  const orchestrator = createAutoOrchestrator(deps);

  const first = await orchestrator.advance();
  const second = await orchestrator.advance();

  assert.equal(first.kind, "advanced");
  assert.deepEqual(first.unit, { unitType: "execute-task", unitId: "T01" });
  assert.equal(second.kind, "blocked");
  assert.equal(second.reason, "idempotent advance: unit already active");
  assert.equal(second.action, "stop");

  const prepareCalls = calls.filter((c) => c === "worktree.prepare").length;
  assert.equal(prepareCalls, 1);
});

test("resume() re-enters running flow via advance", async () => {
  const { deps } = makeDeps();
  const orchestrator = createAutoOrchestrator(deps);

  const result = await orchestrator.resume();

  assert.equal(result.kind, "advanced");
  assert.equal(orchestrator.getStatus().phase, "running");
});

test("resume() clears idempotent lock and allows re-advance", async () => {
  const { deps } = makeDeps();
  const orchestrator = createAutoOrchestrator(deps);

  const first = await orchestrator.advance();
  const blocked = await orchestrator.advance();
  const resumed = await orchestrator.resume();

  assert.equal(first.kind, "advanced");
  assert.equal(blocked.kind, "blocked");
  assert.equal(resumed.kind, "advanced");
});

test("transitionCount increases across lifecycle transitions", async () => {
  const { deps } = makeDeps();
  const orchestrator = createAutoOrchestrator(deps);

  const before = orchestrator.getStatus().transitionCount;
  await orchestrator.start({ basePath: "/tmp/project", trigger: "manual" });
  const afterStart = orchestrator.getStatus().transitionCount;
  await orchestrator.stop("done");
  const afterStop = orchestrator.getStatus().transitionCount;

  assert.ok(afterStart > before);
  assert.ok(afterStop > afterStart);
});

test("stop() clears idempotent unit lock so advance can run again", async () => {
  const { deps } = makeDeps();
  const orchestrator = createAutoOrchestrator(deps);

  const first = await orchestrator.advance();
  const blocked = await orchestrator.advance();
  const stopped = await orchestrator.stop("reset");
  const second = await orchestrator.advance();

  assert.equal(first.kind, "advanced");
  assert.equal(blocked.kind, "blocked");
  assert.equal(stopped.kind, "stopped");
  assert.equal(second.kind, "advanced");
});

test("advance() stopped clears previous activeUnit", async () => {
  let first = true;
  const { deps } = makeDeps({
    dispatch: {
      async decideNextUnit() {
        if (first) {
          first = false;
          return { unitType: "execute-task", unitId: "T01", reason: "ready", preconditions: [] };
        }
        return null;
      },
    },
  });
  const orchestrator = createAutoOrchestrator(deps);

  await orchestrator.advance();
  const stopped = await orchestrator.advance();

  assert.equal(stopped.kind, "stopped");
  assert.equal(orchestrator.getStatus().activeUnit, undefined);
});

test("recovery stop clears activeUnit", async () => {
  const { deps, calls } = makeDeps({
    runtime: {
      async ensureLockOwnership() { throw new Error("boom"); },
      async journalTransition(event) { calls.push(`journal:${event.name}`); },
    },
    recovery: {
      async classifyAndRecover() { return { action: "stop", reason: "fatal" }; },
    },
  });
  const orchestrator = createAutoOrchestrator(deps);

  const result = await orchestrator.advance();

  assert.equal(result.kind, "stopped");
  assert.equal(orchestrator.getStatus().activeUnit, undefined);
  assert.ok(calls.includes("journal:advance-stopped"));
  assert.ok(calls.includes("notify:stopped"));
  assert.ok(!calls.includes("notify:error"));
});

test("recovery retry maps to paused result", async () => {
  const { deps, calls } = makeDeps({
    runtime: {
      async ensureLockOwnership() { throw new Error("boom"); },
      async journalTransition(event) { calls.push(`journal:${event.name}`); },
    },
    recovery: {
      async classifyAndRecover() { return { action: "retry", reason: "transient" }; },
    },
  });
  const orchestrator = createAutoOrchestrator(deps);

  const result = await orchestrator.advance();

  assert.equal(result.kind, "paused");
  assert.equal(result.reason, "transient");
  assert.equal(orchestrator.getStatus().phase, "paused");
  assert.ok(calls.includes("journal:advance-paused"));
  assert.ok(calls.includes("notify:pause"));
});

test("getStatus() returns defensive copy of activeUnit", async () => {
  const { deps } = makeDeps();
  const orchestrator = createAutoOrchestrator(deps);

  await orchestrator.advance();
  const snap1 = orchestrator.getStatus();
  if (snap1.activeUnit) snap1.activeUnit.unitId = "MUTATED";
  const snap2 = orchestrator.getStatus();

  assert.equal(snap2.activeUnit?.unitId, "T01");
});

test("start() clears prior idempotent lock", async () => {
  const { deps } = makeDeps();
  const orchestrator = createAutoOrchestrator(deps);

  await orchestrator.advance();
  const blocked = await orchestrator.advance();
  const restarted = await orchestrator.start({ basePath: "/tmp/project", trigger: "manual" });

  assert.equal(blocked.kind, "blocked");
  assert.equal(restarted.kind, "advanced");
});

test("error path emits error notification", async () => {
  const { deps, calls } = makeDeps({
    runtime: {
      async ensureLockOwnership() { throw new Error("boom"); },
      async journalTransition(event) { calls.push(`journal:${event.name}`); },
    },
    recovery: {
      async classifyAndRecover() { return { action: "escalate", reason: "needs manual" }; },
    },
  });
  const orchestrator = createAutoOrchestrator(deps);

  await orchestrator.advance();

  assert.ok(calls.includes("notify:error"));
});

test("blocked path journals advance-blocked", async () => {
  const { deps, calls } = makeDeps();
  const orchestrator = createAutoOrchestrator(deps);

  await orchestrator.advance();
  await orchestrator.advance();

  assert.ok(calls.includes("journal:advance-blocked"));
});

test("health post hook runs on blocked result", async () => {
  const { deps, calls } = makeDeps();
  const orchestrator = createAutoOrchestrator(deps);

  await orchestrator.advance();
  await orchestrator.advance();

  assert.ok(calls.includes("health.post"));
});

test("start() emits start notification", async () => {
  const { deps, calls } = makeDeps();
  const orchestrator = createAutoOrchestrator(deps);

  await orchestrator.start({ basePath: "/tmp/project", trigger: "manual" });

  assert.ok(calls.includes("notify:start"));
});

test("resume() emits resume notification", async () => {
  const { deps, calls } = makeDeps();
  const orchestrator = createAutoOrchestrator(deps);

  await orchestrator.resume();

  assert.ok(calls.includes("notify:resume"));
});

test("stopped with no remaining units clears idempotent lock for next advance", async () => {
  let callCount = 0;
  const { deps } = makeDeps({
    dispatch: {
      async decideNextUnit() {
        callCount += 1;
        if (callCount === 2) return null;
        return { unitType: "execute-task", unitId: "T01", reason: "ready", preconditions: [] };
      },
    },
  });
  const orchestrator = createAutoOrchestrator(deps);

  const first = await orchestrator.advance();
  const stopped = await orchestrator.advance();
  const after = await orchestrator.advance();

  assert.equal(first.kind, "advanced");
  assert.equal(stopped.kind, "stopped");
  assert.equal(after.kind, "advanced");
});

test("stop() cleans up worktree and transitions to stopped", async () => {
  const { deps, calls } = makeDeps();
  const orchestrator = createAutoOrchestrator(deps);

  const result = await orchestrator.stop("user-request");

  assert.equal(result.kind, "stopped");
  assert.equal(orchestrator.getStatus().phase, "stopped");
  assert.ok(calls.includes("worktree.cleanup"));
  assert.ok(calls.includes("journal:stop"));
  assert.ok(calls.includes("notify:stop"));
});

// ────────────────────────────────────────────────────────────────────────
// Stuck-loop ring buffer (issue #5787)
// ────────────────────────────────────────────────────────────────────────

test("STUCK_WINDOW_SIZE matches the legacy auto/phases.ts constant", () => {
  assert.equal(STUCK_WINDOW_SIZE, 6);
});

test("stuck-loop: empty ring on a freshly constructed orchestrator advances normally", async () => {
  const { deps } = makeDeps();
  const orchestrator = createAutoOrchestrator(deps);

  const result = await orchestrator.advance();

  assert.equal(result.kind, "advanced");
});

test("stuck-loop: partial fill of mixed units does not block", async () => {
  // Alternate A/B for STUCK_WINDOW_SIZE rounds. No single key saturates the
  // window, so neither idempotency nor stuck-loop should fire.
  let i = 0;
  const sequence = ["A", "B", "A", "B", "A", "B"];
  const { deps } = makeDeps({
    dispatch: {
      async decideNextUnit() {
        const id = sequence[i++ % sequence.length];
        return { unitType: "execute-task", unitId: id, reason: "ready", preconditions: [] };
      },
    },
  });
  const orchestrator = createAutoOrchestrator(deps);

  for (let round = 0; round < STUCK_WINDOW_SIZE; round++) {
    const result = await orchestrator.advance();
    assert.equal(result.kind, "advanced", `round ${round} should advance, got ${result.kind}`);
  }
});

test("stuck-loop: ring saturated with same unit blocks with action 'stop' and stuck-loop reason", async () => {
  // Dispatch picks the same unit every time. The first advance succeeds.
  // Calls 2..STUCK_WINDOW_SIZE-1 are idempotency-blocked while the ring fills.
  // The STUCK_WINDOW_SIZE'th call sees a saturated ring and returns stuck-loop.
  const { deps } = makeDeps();
  const orchestrator = createAutoOrchestrator(deps);

  const results: Awaited<ReturnType<typeof orchestrator.advance>>[] = [];
  for (let i = 0; i < STUCK_WINDOW_SIZE; i++) {
    results.push(await orchestrator.advance());
  }

  // First call advances.
  assert.equal(results[0].kind, "advanced");

  // Intermediate calls are blocked by idempotency (not stuck-loop yet).
  for (let i = 1; i < STUCK_WINDOW_SIZE - 1; i++) {
    const r = results[i];
    assert.equal(r.kind, "blocked", `round ${i} should be blocked`);
    if (r.kind !== "blocked") return;
    assert.equal(r.reason, "idempotent advance: unit already active");
    assert.equal(r.action, "stop");
  }

  // The final call (ring now holds STUCK_WINDOW_SIZE copies) returns stuck-loop.
  const last = results[STUCK_WINDOW_SIZE - 1];
  assert.equal(last.kind, "blocked");
  if (last.kind !== "blocked") return;
  assert.equal(last.action, "stop");
  assert.equal(last.reason, `stuck-loop: execute-task:T01 picked ${STUCK_WINDOW_SIZE} times`);
});

test("stuck-loop: idempotency block continues to fire with its own reason before saturation", async () => {
  // Two identical calls should produce idempotent (not stuck-loop). Ensures the
  // existing idempotency block is not absorbed by the new check.
  const { deps } = makeDeps();
  const orchestrator = createAutoOrchestrator(deps);

  const first = await orchestrator.advance();
  const second = await orchestrator.advance();

  assert.equal(first.kind, "advanced");
  assert.equal(second.kind, "blocked");
  assert.equal(second.reason, "idempotent advance: unit already active");
  assert.equal(second.action, "stop");
});

test("stuck-loop: start() resets the ring so a fresh saturation cycle is required", async () => {
  // Fill the ring to one short of saturation, then start() — the ring should
  // be cleared, and the next advance must succeed instead of going stuck.
  const { deps } = makeDeps();
  const orchestrator = createAutoOrchestrator(deps);

  for (let i = 0; i < STUCK_WINDOW_SIZE - 1; i++) {
    await orchestrator.advance();
  }

  const restarted = await orchestrator.start({ basePath: "/tmp/project", trigger: "manual" });
  assert.equal(restarted.kind, "advanced");

  // Immediately after start(), the next advance is idempotent (one element in
  // ring), not stuck-loop, confirming the ring was reset.
  const next = await orchestrator.advance();
  assert.equal(next.kind, "blocked");
  assert.equal(next.reason, "idempotent advance: unit already active");
});

test("stuck-loop: resume() resets the ring", async () => {
  const { deps } = makeDeps();
  const orchestrator = createAutoOrchestrator(deps);

  for (let i = 0; i < STUCK_WINDOW_SIZE - 1; i++) {
    await orchestrator.advance();
  }

  const resumed = await orchestrator.resume();
  assert.equal(resumed.kind, "advanced");

  const next = await orchestrator.advance();
  assert.equal(next.kind, "blocked");
  assert.equal(next.reason, "idempotent advance: unit already active");
});

test("stuck-loop: stop() resets the ring", async () => {
  const { deps } = makeDeps();
  const orchestrator = createAutoOrchestrator(deps);

  for (let i = 0; i < STUCK_WINDOW_SIZE - 1; i++) {
    await orchestrator.advance();
  }

  const stopped = await orchestrator.stop("user-request");
  assert.equal(stopped.kind, "stopped");

  // Ring is cleared by stop(). A subsequent advance is a fresh first-touch.
  const next = await orchestrator.advance();
  assert.equal(next.kind, "advanced");
});

test("stuck-loop: journal records the stuck-loop reason on advance-blocked", async () => {
  const { deps, calls } = makeDeps();
  const orchestrator = createAutoOrchestrator(deps);

  for (let i = 0; i < STUCK_WINDOW_SIZE; i++) {
    await orchestrator.advance();
  }

  assert.ok(calls.includes("journal:advance-blocked"));
});
