// Project/App: GSD-2
// File Purpose: Pure workflow-loop decisions for auto-mode before side-effect adapters run.

export type WorkflowLoopAction =
  | { action: "continue" }
  | { action: "stop"; reason: WorkflowStopReason; message: string };

export type WorkflowStopReason =
  | "inactive"
  | "max-iterations"
  | "missing-command-context"
  | "session-lock-lost";

export interface WorkflowLoopInput {
  active: boolean;
  iteration: number;
  maxIterations: number;
  hasCommandContext: boolean;
  sessionLockValid: boolean;
  sessionLockReason?: string | null;
}

export function decideWorkflowLoop(input: WorkflowLoopInput): WorkflowLoopAction {
  if (!input.active) {
    return {
      action: "stop",
      reason: "inactive",
      message: "Auto-mode is not active.",
    };
  }

  if (input.iteration > input.maxIterations) {
    return {
      action: "stop",
      reason: "max-iterations",
      message: `Safety: loop exceeded ${input.maxIterations} iterations.`,
    };
  }

  if (!input.hasCommandContext) {
    return {
      action: "stop",
      reason: "missing-command-context",
      message: "Auto-mode has no command context for dispatch.",
    };
  }

  if (!input.sessionLockValid) {
    return {
      action: "stop",
      reason: "session-lock-lost",
      message: input.sessionLockReason
        ? `Session lock lost: ${input.sessionLockReason}.`
        : "Session lock lost.",
    };
  }

  return { action: "continue" };
}
