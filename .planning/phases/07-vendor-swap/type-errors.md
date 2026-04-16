# Phase 07 Type Error Catalogue

Generated: 2026-04-16
Total errors: 24

## @gsd/pi-ai -- 0 errors

## @gsd/pi-agent-core -- 0 errors

## @gsd/pi-tui -- 0 errors

## @gsd/pi-coding-agent -- 24 errors

### packages/pi-coding-agent/src/core/extensions/index.ts
- TS2305: Module '"./types.js"' has no exported member 'AppAction'. (line 32)
- TS2305: Module '"./types.js"' has no exported member 'AdjustToolSetEvent'. (line 43)
- TS2305: Module '"./types.js"' has no exported member 'AdjustToolSetResult'. (line 44)
- TS2305: Module '"./types.js"' has no exported member 'LifecycleHookContext'. (line 100)
- TS2305: Module '"./types.js"' has no exported member 'LifecycleHookHandler'. (line 101)
- TS2305: Module '"./types.js"' has no exported member 'LifecycleHookMap'. (line 102)
- TS2305: Module '"./types.js"' has no exported member 'LifecycleHookPhase'. (line 103)
- TS2305: Module '"./types.js"' has no exported member 'LifecycleHookScope'. (line 104)
- TS2305: Module '"./types.js"' has no exported member 'SessionDirectoryEvent'. (line 122)
- TS2305: Module '"./types.js"' has no exported member 'SessionDirectoryHandler'. (line 123)
- TS2305: Module '"./types.js"' has no exported member 'SessionDirectoryResult'. (line 124)
- TS2724: '"./types.js"' has no exported member named 'SessionForkEvent'. Did you mean 'SessionEvent'? (line 126)
- TS2724: '"./types.js"' has no exported member named 'SessionSwitchEvent'. Did you mean 'SessionBeforeSwitchEvent'? (line 130)
- TS2305: Module '"./types.js"' has no exported member 'ToolCompatibility'. (line 137)
- TS2305: Module '"./types.js"' has no exported member 'BashTransformEvent'. (line 153)
- TS2305: Module '"./types.js"' has no exported member 'BashTransformEventResult'. (line 154)
- TS2724: '"./types.js"' has no exported member named 'isToolResultEventType'. Did you mean 'LsToolResultEvent'? (line 160)

### packages/pi-coding-agent/src/modes/interactive/components/provider-manager.ts
- TS2345: Argument of type 'string | undefined' is not assignable to parameter of type 'string'. (line 69)
- TS2341: Property 'modelsJsonPath' is private and only accessible within class 'ModelRegistry'. (line 69)
- TS2345: Argument of type '"selectUp"' is not assignable to parameter of type 'keyof Keybindings'. (line 175)
- TS2345: Argument of type '"selectDown"' is not assignable to parameter of type 'keyof Keybindings'. (line 180)
- TS2345: Argument of type '"selectCancel"' is not assignable to parameter of type 'keyof Keybindings'. (line 185)
- TS2345: Argument of type '"selectConfirm"' is not assignable to parameter of type 'keyof Keybindings'. (line 216)

### packages/pi-coding-agent/src/resources/extensions/memory/index.ts
- TS2551: Property 'getMemorySettings' does not exist on type 'SettingsManager'. Did you mean 'getRetrySettings'? (line 60)

