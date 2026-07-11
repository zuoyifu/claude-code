/**
 * Tool lifecycle contract validation.
 *
 * C1 占位：具体校验逻辑由 L2 改进阶段补齐。当前阶段仅提供类型与最小实现，
 * 保持 core/index.ts 的 public API 完整性。
 */
import type { Tool } from './types.js'

/**
 * 校验 Tool 是否满足生命周期契约。
 * 当前实现：最小占位，仅检查 name 字段存在。
 */
export function validateToolContract(tool: Tool): {
  ok: boolean
  reason?: string
} {
  if (!tool.name || typeof tool.name !== 'string') {
    return { ok: false, reason: 'Tool.name must be a non-empty string' }
  }
  return { ok: true }
}
