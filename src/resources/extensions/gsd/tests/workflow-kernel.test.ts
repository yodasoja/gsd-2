// Project/App: GSD-2
// File Purpose: Unit tests for pure auto-mode workflow kernel decisions.

import assert from "node:assert/strict";
import test from "node:test";

import { decideWorkflowLoop } from "../auto/workflow-kernel.ts";

test("decideWorkflowLoop continues when dispatch preconditions are valid", () => {
  assert.deepEqual(
    decideWorkflowLoop({
      active: true,
      iteration: 1,
      maxIterations: 500,
      hasCommandContext: true,
      sessionLockValid: true,
    }),
    { action: "continue" },
  );
});

test("decideWorkflowLoop stops inactive sessions before dispatch", () => {
  assert.deepEqual(
    decideWorkflowLoop({
      active: false,
      iteration: 1,
      maxIterations: 500,
      hasCommandContext: true,
      sessionLockValid: true,
    }),
    {
      action: "stop",
      reason: "inactive",
      message: "Auto-mode is not active.",
    },
  );
});

test("decideWorkflowLoop stops runaway loops with a stable reason", () => {
  assert.deepEqual(
    decideWorkflowLoop({
      active: true,
      iteration: 501,
      maxIterations: 500,
      hasCommandContext: true,
      sessionLockValid: true,
    }),
    {
      action: "stop",
      reason: "max-iterations",
      message: "Safety: loop exceeded 500 iterations.",
    },
  );
});

test("decideWorkflowLoop stops when dispatch cannot create a command session", () => {
  assert.deepEqual(
    decideWorkflowLoop({
      active: true,
      iteration: 1,
      maxIterations: 500,
      hasCommandContext: false,
      sessionLockValid: true,
    }),
    {
      action: "stop",
      reason: "missing-command-context",
      message: "Auto-mode has no command context for dispatch.",
    },
  );
});

test("decideWorkflowLoop preserves session lock loss detail", () => {
  assert.deepEqual(
    decideWorkflowLoop({
      active: true,
      iteration: 1,
      maxIterations: 500,
      hasCommandContext: true,
      sessionLockValid: false,
      sessionLockReason: "pid mismatch",
    }),
    {
      action: "stop",
      reason: "session-lock-lost",
      message: "Session lock lost: pid mismatch.",
    },
  );
});
