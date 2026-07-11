import type { EngineState } from '../types.js'

/**
 * 检查是否被中断（模式 C：同步 boolean）。
 *
 * 注：此为 C10 拆分的新骨架实现。生产 src/QueryEngine.ts 保留原样（Plan B）。
 */
export function isInterrupted(state: EngineState): boolean {
  return state.interrupted
}

export function setInterrupted(state: EngineState, value: boolean): void {
  state.interrupted = value
}
