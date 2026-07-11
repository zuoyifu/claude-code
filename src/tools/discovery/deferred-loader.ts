/**
 * Deferred tool loader.
 *
 * 通过 CORE_TOOLS 白名单判定工具是否延迟加载，并提供基于 TF-IDF 索引的
 * 动态加载入口。
 */
import { CORE_TOOLS } from '../registry/whitelists.js'

const CORE_SET: ReadonlySet<string> = CORE_TOOLS

/**
 * 判定工具是否为延迟加载（不在 CORE_TOOLS 白名单内）。
 */
export function isDeferredTool(name: string): boolean {
  return !CORE_SET.has(name)
}

/**
 * 根据工具名（或 alias）查找候选延迟工具。
 * 通过 TF-IDF 索引搜索；找不到则返回 null。
 *
 * 注意：本函数返回的是 ToolIndexEntry（描述/名称），而非 Tool 实例本身。
 * 调用方拿到候选后通过 builtin/index.ts 的 loadBuiltinTools 或 registry
 * 的 getTools 解析为真实 Tool 实例。
 */
export async function findDeferredToolCandidates(
  query: string,
  topK = 1,
): Promise<unknown[]> {
  if (!query.trim()) return []
  const { searchTools, getToolIndex } = await import('./tfidf-index.js')
  // getToolIndex 需要 Tools 入参；延迟加载场景下 Tools 由调用方装配。
  // 此处返回空数组，由调用方在持有 tools pool 时直接调用 searchTools。
  // 保留本入口仅为 API 完整性；实际调用见 SearchExtraToolsTool。
  void searchTools
  void getToolIndex
  return []
}
