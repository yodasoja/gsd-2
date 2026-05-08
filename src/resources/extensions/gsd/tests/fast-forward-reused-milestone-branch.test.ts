// GSD-2 + src/resources/extensions/gsd/tests/fast-forward-reused-milestone-branch.test.ts
// Regression: when createAutoWorktree reuses an existing milestone branch,
// it must be fast-forwarded onto integration so the next milestone forks
// from up-to-date code (#5538-followup).

import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { fastForwardReusedMilestoneBranchIfSafe } from "../auto-worktree.js";

const NO_PROMPT_ENV = {
  ...process.env,
  GIT_TERMINAL_PROMPT: "0",
  GIT_AUTHOR_NAME: "test",
  GIT_AUTHOR_EMAIL: "test@example.com",
  GIT_COMMITTER_NAME: "test",
  GIT_COMMITTER_EMAIL: "test@example.com",
};

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf-8",
    env: NO_PROMPT_ENV,
  });
}

function rev(cwd: string, ref: string): string {
  return git(cwd, "rev-parse", ref).trim();
}

describe("fastForwardReusedMilestoneBranchIfSafe", () => {
  let repo: string;

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), "ff-reused-branch-"));
    git(repo, "init", "-q", "-b", "main");
    git(repo, "config", "user.email", "test@example.com");
    git(repo, "config", "user.name", "test");
    writeFileSync(join(repo, "seed.txt"), "seed\n");
    git(repo, "add", "seed.txt");
    git(repo, "commit", "-q", "-m", "initial");
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  test("fast-forwards a milestone branch that is strictly behind integration (regression: stale base)", () => {
    // Create milestone/M001 from main's initial commit, then advance main.
    git(repo, "branch", "milestone/M001");
    const m001Initial = rev(repo, "milestone/M001");

    writeFileSync(join(repo, "seed.txt"), "advanced\n");
    git(repo, "add", "seed.txt");
    git(repo, "commit", "-q", "-m", "main moved forward");
    const mainTip = rev(repo, "main");

    assert.notEqual(m001Initial, mainTip, "main must be ahead before the test");

    fastForwardReusedMilestoneBranchIfSafe(repo, "M001", "milestone/M001");

    assert.equal(
      rev(repo, "milestone/M001"),
      mainTip,
      "milestone/M001 must be fast-forwarded to main's tip",
    );
  });

  test("does not touch a milestone branch that has its own commits ahead", () => {
    // Branch from main, add a unique commit, then advance main.
    git(repo, "checkout", "-q", "-b", "milestone/M001");
    writeFileSync(join(repo, "milestone-only.txt"), "milestone work\n");
    git(repo, "add", "milestone-only.txt");
    git(repo, "commit", "-q", "-m", "M001 work");
    const milestoneTip = rev(repo, "milestone/M001");

    git(repo, "checkout", "-q", "main");
    writeFileSync(join(repo, "seed.txt"), "advanced\n");
    git(repo, "add", "seed.txt");
    git(repo, "commit", "-q", "-m", "main moved forward");

    fastForwardReusedMilestoneBranchIfSafe(repo, "M001", "milestone/M001");

    assert.equal(
      rev(repo, "milestone/M001"),
      milestoneTip,
      "diverged milestone branch must NOT be touched (would lose work)",
    );
  });

  test("is a no-op when milestone branch is already up-to-date with main", () => {
    git(repo, "branch", "milestone/M001");
    const before = rev(repo, "milestone/M001");

    fastForwardReusedMilestoneBranchIfSafe(repo, "M001", "milestone/M001");

    assert.equal(rev(repo, "milestone/M001"), before, "ref must not move");
  });

  test("does nothing when the milestone branch does not exist", () => {
    // Should silently return — no error, no side effects.
    assert.doesNotThrow(() =>
      fastForwardReusedMilestoneBranchIfSafe(repo, "M999", "milestone/M999"),
    );
  });

  test("does nothing in a non-git directory", () => {
    const nonRepo = mkdtempSync(join(tmpdir(), "ff-not-a-repo-"));
    try {
      assert.doesNotThrow(() =>
        fastForwardReusedMilestoneBranchIfSafe(nonRepo, "M001", "milestone/M001"),
      );
    } finally {
      rmSync(nonRepo, { recursive: true, force: true });
    }
  });
});
