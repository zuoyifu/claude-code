// src/cli/dispatcher/repl.ts
//
// C6 dispatcher 子模块：交互式 REPL 启动。
// 对应 plan `15-c6-dispatcher-split.md` Task 8。
//
// 替代 main.tsx defaultAction 中 REPL 启动逻辑（行 ~3400-4300 / 实际 ~3100-4080）。
//
// **当前状态（C6 阶段）：** 骨架函数。
// main.tsx 原 REPL 启动路径调用 launchRepl()（src/replLauncher.ts），配置对象
// 涉及大量闭包变量（sessionConfig / assistantInitialState / remoteSessionConfig 等）。
// C6 不迁入，保持 no-op 避免破坏 REPL 行为。Task 11 时按"逐字段迁移"策略搬移。

import type { DispatcherContext } from './types.js'

/**
 * 启动交互式 REPL。
 *
 * plan 描述：调用 launchRepl(root, { initialState }, { ...sessionConfig, initialMessages })。
 *
 * **当前实现：no-op。** Task 11 时从 main.tsx 行 ~3100-4080 迁入。
 *
 * 注意：main.tsx 现有 REPL 启动涉及 ~15 个闭包变量构造（sessionConfig、
 * assistantInitialState、remoteSessionConfig 等），迁移需逐字段评估。
 */
export async function runRepl(
  _initialPrompt: string | undefined,
  _ctx: DispatcherContext,
): Promise<void> {
  // TODO(Task11): 完整迁移。
  //
  // const { launchRepl } = await import('../../replLauncher.js')
  // const { renderAndRun } = await import('../../ink.js')
  //
  // 构造 sessionConfig（~30 字段，需逐个从 ctx / 全局获取）
  // 构造 initialState（messages / tools / permissionCtx / fpsMetrics 等）
  // 构造 initialMessages（deepLinkBanner / hookMessages）
  //
  // await launchRepl(root, { initialState }, { ...sessionConfig, initialMessages }, renderAndRun)
  void _initialPrompt
  void _ctx
}
