import type { LoopState, AutonomyDecision } from '../types.js'

/**
 * 自主性决策：是否继续循环。
 * 委托模式 B（Promise<AutonomyDecision>）：调用方 await。
 *
 * 注：此为 C9 拆分的新骨架。生产 query.ts 的 autonomy 逻辑（更复杂）
 * 保留原样（Plan B：薄包装层）。
 */
export async function decideAutonomy(
  state: LoopState,
): Promise<AutonomyDecision> {
  // 从 query.ts autonomy 逻辑搬移
  if (state.stopReason === 'stop_sequence') {
    return { shouldStop: true, reason: 'stop_sequence' }
  }
  if (state.toolUseCount > 50) {
    return { shouldStop: true, reason: 'tool_use_limit' }
  }
  return { shouldStop: false }
}
