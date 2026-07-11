// src/cli/dispatcher/session-restore.ts
//
// C6 dispatcher 子模块：--resume / --continue 会话恢复。
// 对应 plan `15-c6-dispatcher-split.md` Task 6。
//
// 替代 main.tsx defaultAction 中会话恢复逻辑（行 ~2200-2600 / 实际 ~1900-2300）。
//
// **当前状态（C6 阶段）：** 骨架函数。
// main.tsx 原会话恢复逻辑（sessionRepo / loadSession / findLastSession）涉及多个闭包变量
// 与 ~400 行校验代码，在 Task 11 接入前不迁入，保持 no-op 以避免破坏现有行为。
// Task 11 时按"逐 exit 迁移"策略搬移。

import type { DispatcherContext } from './types.js'

/**
 * 处理 --resume / --continue。
 *
 * - `--resume <id>`：加载指定会话
 * - `--continue`：查找最近会话并恢复；无历史会话则正常启动
 *
 * 当前实现：no-op（C6 阶段骨架）。
 * Task 11 时从 main.tsx defaultAction 迁入完整逻辑，包括：
 * - sessionRepo 校验
 * - sessionId 格式校验（validatedSessionId）
 * - session 加载与 options 注入
 * - resumeStart 定位
 */
export async function restoreSession(ctx: DispatcherContext): Promise<void> {
  if (ctx.isResume) {
    await resumeSession(ctx)
  } else if (ctx.isContinue) {
    await continueLastSession(ctx)
  }
}

/**
 * --resume <id> 路径。
 * TODO(Task11): 从 main.tsx 行 ~2200-2500 迁入。
 */
async function resumeSession(ctx: DispatcherContext): Promise<void> {
  const sessionId = ctx.options.resume
  if (!sessionId || sessionId === true) {
    throw new Error('--resume requires a session ID')
  }
  // TODO(Task11):
  // const { loadSession } = await import('../../../services/session/load.js')
  // const session = await loadSession(sessionId)
  // if (!session) throw new Error(`Session ${sessionId} not found`)
  // Object.assign(ctx.options, session.options)
  void sessionId
}

/**
 * --continue 路径：查找最近会话并恢复。
 * TODO(Task11): 从 main.tsx 行 ~2500-2600 迁入。
 */
async function continueLastSession(ctx: DispatcherContext): Promise<void> {
  // TODO(Task11):
  // const { findLastSession } = await import('../../../services/session/find.js')
  // const lastSessionId = await findLastSession(ctx.cwd)
  // if (!lastSessionId) return  // 无历史会话，正常启动
  // ctx.options.resume = lastSessionId
  // await resumeSession(ctx)
  void ctx
}
