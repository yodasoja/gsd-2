// Project/App: GSD-2
// File Purpose: Verifies the execution prompt renders compact required guidance.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("execute-task prompt renders compact execution and completion gates", async (t) => {
  const previousGsdHome = process.env.GSD_HOME;
  const isolatedHome = mkdtempSync(join(tmpdir(), "gsd-execute-task-render-"));
  const fixtureRoot = join("workspace", "gsd-fixture");
  process.env.GSD_HOME = isolatedHome;
  t.after(() => {
    if (previousGsdHome === undefined) delete process.env.GSD_HOME;
    else process.env.GSD_HOME = previousGsdHome;
    rmSync(isolatedHome, { recursive: true, force: true });
  });

  const { loadPrompt } = await import(`../prompt-loader.ts?test=${Date.now()}`);
  const prompt = loadPrompt("execute-task", {
    taskId: "T01",
    taskTitle: "Implement compact prompts",
    sliceId: "S01",
    sliceTitle: "Prompt reduction",
    milestoneId: "M001",
    workingDirectory: fixtureRoot,
    overridesSection: "",
    runtimeContext: "Runtime context.",
    phaseAnchorSection: "",
    resumeSection: "",
    carryForwardSection: "",
    taskPlanInline: "## Task Plan\n\n1. Edit prompt.",
    slicePlanExcerpt: "## Slice Plan\n\nReduce prompt size.",
    gatesToClose: "- Gate: prompt markers retained.",
    planPath: ".gsd/milestones/M001/slices/S01/S01-PLAN.md",
    taskPlanPath: ".gsd/milestones/M001/slices/S01/tasks/T01-PLAN.md",
    priorTaskLines: "- None",
    skillActivation: "Load relevant skills.",
    verificationBudget: "~10K chars",
    taskSummaryPath: ".gsd/milestones/M001/slices/S01/tasks/T01-SUMMARY.md",
  });

  assert.match(prompt, /You execute\./);
  assert.match(prompt, /Call `memory_query`/);
  assert.match(prompt, /Before any `Write` that creates an artifact or output file/);
  assert.match(prompt, /Build the real thing/);
  assert.match(prompt, /Background process rule/);
  assert.match(prompt, /blocker_discovered: true/);
  assert.match(prompt, /Call `gsd_task_complete`/);
  assert.match(prompt, /Do not run git commands/);
  assert.doesNotMatch(prompt, /\{\{[a-zA-Z][a-zA-Z0-9_]*\}\}/);
});
