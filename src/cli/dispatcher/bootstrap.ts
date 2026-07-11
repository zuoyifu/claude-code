// src/cli/dispatcher/bootstrap.ts
//
// C6 dispatcher 子模块：启动期副作用协调。
// 对应 plan `15-c6-dispatcher-split.md` Task 4。
//
// H2 原则：启动期变量（telemetry handles、settings cache、MCP connections）
// 保留在此模块内部，不暴露到 DispatcherContext。
//
// **过渡说明：** plan 假设 `cli/bootstrap/{telemetry,settings,prefetch,trust}.ts`
// 已存在（C7 迁移产物）。当前这些模块尚未从 main.tsx 抽出，C6 阶段先用动态 import
// 指向现有 src/ 路径；若 main.tsx 对应逻辑尚未模块化，函数体留空并标注 TODO（C7）。
// 这样保持 typecheck 通过，且不改变 main.tsx 现有运行时行为。
//
// 本模块在 Task 11（删除 main.tsx 主体）之前不会被 dispatcher/index.ts 调用，
// 因此当前是"骨架 + 标注"状态。

import type { DispatcherContext } from './types.js'

/**
 * 执行启动期副作用。
 *
 * 替代 main.tsx defaultAction 中 ~1600-2000 行（实际行 1300-1900）的 bootstrap 逻辑。
 * 顺序固定：telemetry → settings → migrations → mcp → prefetches → trust → feature-gate。
 *
 * **当前状态（C6 阶段）：** 骨架函数，具体逻辑在 Task 11 接入前从 main.tsx 迁入。
 * 各子函数用 TODO 标注来源行号，便于 C7/Task 11 逐个搬移。
 */
export async function runBootstrap(_ctx: DispatcherContext): Promise<void> {
  await initTelemetry(_ctx)
  await loadSettings(_ctx)
  await runMigrations(_ctx)
  await connectMcp(_ctx)
  await startPrefetches(_ctx)
  await runTrustDialog(_ctx)
  validateFeatureGateFlags()
}

/**
 * telemetry 初始化。
 * TODO(C7/Task11): 从 main.tsx logStartupTelemetry() / logSessionTelemetry() 迁入。
 */
async function initTelemetry(_ctx: DispatcherContext): Promise<void> {
  // 当前实现：no-op。原逻辑仍在 main.tsx defaultAction 内部执行。
  // 迁移点：main.tsx 行 ~1070-1190 的 profileCheckpoint / logEvent / logStartupTelemetry。
}

/**
 * settings 加载（--settings / --setting-sources / policy）。
 * TODO(C7/Task11): 从 main.tsx loadSettingsFromFlag / loadSettingSourcesFromFlag 迁入。
 */
async function loadSettings(_ctx: DispatcherContext): Promise<void> {
  // 当前实现：no-op。原逻辑仍在 main.tsx defaultAction 内部执行。
}

/**
 * 数据迁移（migrations/index）。
 * TODO(C7/Task11): 从 main.tsx 迁入（行 ~470-490 的 runMigrations 调用）。
 */
async function runMigrations(_ctx: DispatcherContext): Promise<void> {
  // 当前实现：no-op。
}

/**
 * MCP server 连接。
 * TODO(C7/Task11): 从 main.tsx 行 ~1875-2000 的 MCP connect 逻辑迁入。
 */
async function connectMcp(_ctx: DispatcherContext): Promise<void> {
  // 当前实现：no-op。
}

/**
 * 启动期预取（connectors / system context / tips）。
 * TODO(C7/Task11): 从 main.tsx prefetchSystemContextIfSafe() 迁入。
 */
async function startPrefetches(_ctx: DispatcherContext): Promise<void> {
  // 当前实现：no-op。
}

/**
 * 信任对话框（untrusted dir 防护）。
 * TODO(C7/Task11): 从 main.tsx showSetupScreens() 迁入。
 */
async function runTrustDialog(_ctx: DispatcherContext): Promise<void> {
  // 当前实现：no-op。
}

/**
 * feature-gate flag 校验（启动期一次）。
 * TODO(C7/Task11): 从 main.tsx 迁入（若存在）。
 */
function validateFeatureGateFlags(): void {
  // 当前实现：no-op。
}
