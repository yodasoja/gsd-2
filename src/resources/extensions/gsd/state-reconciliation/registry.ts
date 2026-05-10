// Project/App: GSD-2
// File Purpose: ADR-017 drift handler registry. Single source of truth for
// the catalog. Tests can override per-call via ReconciliationDeps.registry.

import { sketchFlagHandler } from "./drift/sketch-flag.js";
import type { DriftHandler } from "./types.js";

export const DRIFT_REGISTRY: ReadonlyArray<DriftHandler> = [
  sketchFlagHandler,
];
