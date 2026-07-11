import type { EngineState } from '../types.js'

/**
 * 计算 attribution（模式 C：同步）。
 * 替代 QueryEngine.ts 中的 attribution 逻辑。
 *
 * 注：此为 C10 拆分的新骨架实现。生产 src/QueryEngine.ts 保留原样（Plan B）。
 */
export function computeAttribution(state: EngineState): {
  promptCacheHits?: number
  fingerprint?: string
} {
  return {
    promptCacheHits: state.attribution.promptCacheHits,
    fingerprint: state.attribution.fingerprint,
  }
}

export function updateAttribution(
  state: EngineState,
  event: { type: string; [key: string]: unknown },
): void {
  const usage = (event as { usage?: { promptCacheHits?: number } }).usage
  if (usage?.promptCacheHits) {
    state.attribution.promptCacheHits = usage.promptCacheHits
  }
}
