// GSD-2 — Worktree State Projection module: directional state-flow rules between project root and auto-worktree.
/**
 * Worktree State Projection module — first-class Module for directional
 * state-file flow between the project root and the auto-worktree.
 *
 * Per ADR-016, this Module owns:
 *   - The direction-and-rules of state file flow (project-root authoritative
 *     for some classes, worktree authoritative for others)
 *   - The bug-hardened invariants encoded in `syncProjectRootToWorktree` /
 *     `syncStateToProjectRoot` (additive milestone copy #1886, ASSESSMENT
 *     verdict overwrite #2821, completed-units forward-sync, WAL/SHM
 *     cleanup #2478, .gsd symlink edge case #2184)
 *
 * The public Interface now exposes all three ADR-016 verbs
 * (`projectRootToWorktree`, `projectWorktreeToRoot`, and
 * `finalizeProjectionForMerge`) — completed in #5589, #5590, and this PR.
 */

import {
  syncProjectRootToWorktreeByScope,
  syncStateToProjectRootByScope,
  syncWorktreeStateBack,
} from "./auto-worktree.js";
import type { MilestoneScope } from "./workspace.js";

/**
 * Worktree State Projection Module instance.
 *
 * Stateless — methods are pure functions of their `MilestoneScope` input.
 * The class form is retained for testability and to keep the Interface
 * shape consistent with `WorktreeLifecycle`.
 */
export class WorktreeStateProjection {
  /**
   * Project state from the project root onto the auto-worktree for the scope
   * pair. `worktreeScope` may be omitted only for project-only/same-path
   * callers where the helper intentionally fast-paths to a no-op.
   * Called by Lifecycle's enter path after a successful create/enter, before
   * any Unit dispatches.
   *
   * Owns the rules: identity-key safety check, additive milestone copy
   * preserving worktree-local files (#1886), ASSESSMENT verdict force-
   * overwrite (#2821), forward-sync of `completed-units.json`, WAL/SHM
   * cleanup on legacy worktree-local DB (#2478), and the `.gsd` symlink
   * realpath edge case (#2184).
   *
   * Issue #5588 delegates to `syncProjectRootToWorktreeByScope` to ship the
   * typed `MilestoneScope`-only Interface without re-implementing the bug-
   * hardened rules mid-flight. The body extraction joins #5590.
   */
  projectRootToWorktree(
    rootScope: MilestoneScope,
    worktreeScope: MilestoneScope = rootScope,
  ): void {
    syncProjectRootToWorktreeByScope(rootScope, worktreeScope);
  }

  /**
   * Project state from the auto-worktree back onto the project root for the
   * scope pair. `rootScope` may be omitted only for project-only/same-path
   * callers where the helper intentionally fast-paths to a no-op.
   * Called by the post-unit pipeline between Units, and by Lifecycle's exit
   * path before merge.
   *
   * Owns the rules: identity-key safety check, project-root authoritative
   * for diagnostics, markdown projections do NOT flow back to project root,
   * non-fatal — sync failure must not block the caller.
   *
   * Issue #5589 delegates to `syncStateToProjectRootByScope` to ship the
   * typed `MilestoneScope`-only Interface without re-implementing the
   * non-fatal-on-failure contract mid-flight. The body extraction joins
   * the legacy helper retirement in #5590.
   */
  projectWorktreeToRoot(
    worktreeScope: MilestoneScope,
    rootScope: MilestoneScope = worktreeScope,
  ): void {
    syncStateToProjectRootByScope(worktreeScope, rootScope);
  }

  /**
   * Final projection from the auto-worktree to the project root before
   * teardown. Called by Lifecycle's exit path after a successful merge,
   * before the worktree directory is removed.
   *
   * Owns the rules: final state capture (completion metadata, ASSESSMENT
   * verdicts, completed-units finalization) — the post-merge superset of
   * `projectWorktreeToRoot`'s ongoing-sync rules.
   *
   * Issue #5590 delegates to `syncWorktreeStateBack` to ship the typed
   * `MilestoneScope`-only Interface. The body extraction and retirement
   * of the legacy path-based variants are a follow-up cleanup.
   *
   * Returns `{ synced }` describing which file classes were captured —
   * mirrors the existing helper's contract for callers that want
   * post-merge telemetry on what crossed the boundary.
   */
  finalizeProjectionForMerge(scope: MilestoneScope): { synced: string[] } {
    const projectRoot = scope.workspace.projectRoot;
    const worktreePath =
      scope.workspace.worktreeRoot ?? scope.workspace.projectRoot;
    return syncWorktreeStateBack(projectRoot, worktreePath, scope.milestoneId);
  }
}
