// Temporary home for LifecycleHook* types removed from @gsd/pi-coding-agent 0.67.2.
// Phase 09 moves these to @gsd/agent-types.

export type LifecycleHookPhase = string;
export type LifecycleHookScope = "project" | "user";

export interface LifecycleHookContext {
	phase: LifecycleHookPhase;
	source: string;
	installedPath?: string;
	scope: LifecycleHookScope;
	cwd: string;
	interactive: boolean;
	log: (message: string) => void;
	warn: (message: string) => void;
	error: (message: string) => void;
}

export type LifecycleHookHandler = (context: LifecycleHookContext) => void | Promise<void>;
export type LifecycleHookMap = Partial<Record<LifecycleHookPhase, LifecycleHookHandler[]>>;
