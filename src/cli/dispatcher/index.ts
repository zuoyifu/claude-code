// src/cli/dispatcher/index.ts
//
// C6 dispatcher 协调入口。
// 对应 plan `15-c6-dispatcher-split.md` Task 10/11。
//
// 设计目标（H2 原则）：
// - 启动期变量在 bootstrap 内部
// - 请求期变量进 DispatcherContext（字段数 <= 20）
// - 临时变量在子模块内部
// - index.ts 本身 < 100 行（仅协调，无业务逻辑）
//
// **C6.5 迁移状态（当前）：**
// defaultAction 主体（原 main.tsx 行 1069-4083，~3014 行）已迁移到 runner.ts。
// runner.ts 保持行为 1:1 不变（单文件迁移，未拆分到骨架子模块）。
// main.tsx 通过 `program.action(handleDefaultAction)` 接入。
//
// 现有骨架子模块（bootstrap/permissions/session-restore/headless/repl）保留为
// 未来渐进式拆分的接入点。runner.ts 是当前实际运行的代码。
//
// DispatcherContext（types.ts，19 字段）保留为类型定义，供未来拆分使用。

import type { ProgramOptions } from '../program/types.js'

// Re-export handleDefaultAction as the public API of this module.
// main.tsx imports { handleDefaultAction } from './cli/dispatcher/index.js'.
export { handleDefaultAction } from './runner.js'

// Re-export types and skeleton submodules for future use.
export type { DispatcherContext, FastPathResult } from './types.js'
export { normalizeOptions } from './options-normalizer.js'
export {
  checkActionFastPath,
  activateBareMode,
  preprocessPrompt,
} from './fast-paths.js'
export { runBootstrap } from './bootstrap.js'
export { setupPermissions } from './permissions.js'
export { restoreSession } from './session-restore.js'
export { runHeadless } from './headless.js'
export { runRepl } from './repl.js'
export { getInputPrompt } from './prompt-input.js'

// Convenience: types re-exported for main.tsx compatibility.
export type { ProgramOptions as ReExportedProgramOptions } from '../program/types.js'
