import type { EngineState } from '../types.js'

/**
 * 跟踪嵌套 memory 引用（模式 C：同步）。
 * 替代 QueryEngine.ts 中的 nested memory tracking。
 *
 * 注：此为 C10 拆分的新骨架实现。生产 src/QueryEngine.ts 保留原样（Plan B）。
 */
export function trackNestedMemory(state: EngineState, path: string): void {
  state.nestedMemory.add(path)
}

export function getNestedMemory(state: EngineState): Set<string> {
  return new Set(state.nestedMemory)
}

export function clearNestedMemory(state: EngineState): void {
  state.nestedMemory.clear()
}

// ────────────────────────────────────────────────────────────────────────────
// 生产 helpers（C10.5 迁移自 src/QueryEngine.ts）
// ────────────────────────────────────────────────────────────────────────────

/**
 * 创建跨 turn 持久化的 loadedNestedMemoryPaths Set（QueryEngine 构造时调用）。
 *
 * 原实现：QueryEngine 类持有 `private loadedNestedMemoryPaths = new Set<string>()`，
 * 在两处 processUserInputContext 构建中引用同一 Set 实例（跨 turn 复用）。
 */
export function createLoadedNestedMemoryPaths(): Set<string> {
  return new Set<string>()
}

/**
 * 创建 turn-scoped discoveredSkillNames Set（每 turn submitMessage 入口 clear）。
 *
 * 原实现：QueryEngine 类持有 `private discoveredSkillNames = new Set<string>()`，
 * submitMessage 起始处 `this.discoveredSkillNames.clear()`，
 * 两处 processUserInputContext 引用同一 Set 实例（同 turn 内共享）。
 */
export function createDiscoveredSkillNames(): Set<string> {
  return new Set<string>()
}
