import type { LoopState } from '../types.js'

/**
 * 检查是否达到输出限制。
 * 委托模式 C（同步函数返回 boolean）。
 */
export function hitsOutputLimit(state: LoopState): boolean {
  const maxOutput = 100000 // 从 config 读
  return state.tokenUsage.output >= maxOutput
}
