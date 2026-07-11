import type { EngineState } from '../types.js'
import type { Command } from '../../commands/_registry/registry.js'
import { getSlashCommandToolSkills } from '../../commands/_registry/registry.js'
import { getCwd } from '../../utils/cwd.js'
import { loadAllPluginsCacheOnly } from '../../utils/plugins/pluginLoader.js'

/**
 * 跟踪发现的 skills（模式 C：同步）。
 *
 * 注：此为 C10 拆分的新骨架实现。生产 src/QueryEngine.ts 保留原样（Plan B）。
 */
export function trackDiscoveredSkill(state: EngineState, name: string): void {
  state.discoveredSkills.add(name)
}

export function getDiscoveredSkills(state: EngineState): Set<string> {
  return new Set(state.discoveredSkills)
}

// ────────────────────────────────────────────────────────────────────────────
// 生产 helpers（C10.5 迁移自 src/QueryEngine.ts submitMessage :544-553）
// ────────────────────────────────────────────────────────────────────────────

/**
 * cache-only 并行加载 skills + enabledPlugins（原 submitMessage :549-552）。
 *
 * headless/SDK/CCR 启动不得阻塞在网络请求上：CCR 通过
 * CLAUDE_CODE_SYNC_PLUGIN_INSTALL / CLAUDE_CODE_PLUGIN_SEED_DIR 预填充缓存，
 * SDK 调用方需要新鲜源时可执行 /reload-plugins。
 */
export async function loadSkillsAndPlugins(): Promise<{
  skills: ReturnType<typeof getSlashCommandToolSkills> extends Promise<infer T>
    ? T
    : never
  enabledPlugins: unknown[]
}> {
  const [skills, { enabled: enabledPlugins }] = await Promise.all([
    getSlashCommandToolSkills(getCwd()),
    loadAllPluginsCacheOnly(),
  ])
  return { skills, enabledPlugins }
}

/**
 * 占位 Command 类型再导出，便于上层避免重复 import。
 */
export type { Command }
