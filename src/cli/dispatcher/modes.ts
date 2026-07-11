// src/cli/dispatcher/modes.ts
//
// C6 dispatcher 子模块：proactive / brief 模式激活。
// 对应 plan `15-c6-dispatcher-split.md` Task 9。
//
// 替代 main.tsx 行 4524-4564 的 maybeActivateProactive / maybeActivateBrief 函数。
//
// **当前状态（C6 阶段）：** 骨架函数。
// 原函数依赖 feature() / require() / 全局 setter（setUserMsgOptIn） / logEvent，
// 涉及 feature-gate 与 builtin-tools 的 lazy require。C6 不迁入，
// 保持 no-op 避免破坏 proactive/brief 行为。Task 11 时从 main.tsx 迁入。

import type { DispatcherContext } from './types.js'

/**
 * 激活 proactive 模式（feature('PROACTIVE') || feature('KAIROS')）。
 *
 * 原逻辑（main.tsx 行 4524-4535）：
 * - 检查 options.proactive 或 CLAUDE_CODE_PROACTIVE 环境变量
 * - 调用 proactiveModule.activateProactive('command')
 *
 * TODO(Task11): 从 main.tsx 迁入。
 */
export async function maybeActivateProactive(
  _ctx: DispatcherContext,
): Promise<void> {
  // TODO(Task11): 完整迁移
  // if (
  //   (feature('PROACTIVE') || feature('KAIROS')) &&
  //   (_ctx.options.proactive || isEnvTruthy(process.env.CLAUDE_CODE_PROACTIVE))
  // ) {
  //   const proactiveModule = require('../../proactive/index.js')
  //   if (!proactiveModule.isProactiveActive()) {
  //     proactiveModule.activateProactive('command')
  //   }
  // }
  void _ctx
}

/**
 * 激活 brief 模式（feature('KAIROS') || feature('KAIROS_BRIEF')）。
 *
 * 原逻辑（main.tsx 行 4537-4564）：
 * - 检查 options.brief 或 CLAUDE_CODE_BRIEF 环境变量
 * - 调用 isBriefEntitled() 判断授权
 * - setUserMsgOptIn(true) 激活工具
 * - logEvent('tengu_brief_mode_enabled', ...)
 *
 * TODO(Task11): 从 main.tsx 迁入。
 */
export async function maybeActivateBrief(
  _ctx: DispatcherContext,
): Promise<void> {
  // TODO(Task11): 完整迁移
  void _ctx
}
