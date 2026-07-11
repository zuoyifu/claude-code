/**
 * Tool permission decision types.
 *
 * 运行时权限检查逻辑仍在 run-tool-use.ts 的 checkPermissionsAndCallTool 内
 * （与 tool.call / hook / UI 询问紧耦合）。本文件仅提供类型与最小 helper，
 * 供 execution 层其他文件复用。L2 改进阶段可进一步抽取。
 */
import type { Tool, ToolPermissionContext } from '../core/types.js'

export interface PermissionDecision {
  behavior: 'allow' | 'deny' | 'ask'
  message?: string
}

/**
 * 检查工具是否被 blanket-allow / deny（基于 ToolPermissionContext）。
 * 仅供 execution 层内部使用。完整权限检查仍由 run-tool-use.ts 的
 * checkPermissionsAndCallTool 处理（含 hook / canUseTool / UI 询问）。
 */
export function quickPermissionGate(
  tool: Pick<Tool, 'name'>,
  ctx: ToolPermissionContext,
): PermissionDecision {
  const disallowed = ctx.alwaysDenyRules
  for (const source of Object.keys(disallowed)) {
    const rules = (disallowed as Record<string, unknown>)[source]
    if (rules && typeof rules === 'object') {
      // 仅做名称级检查；完整 rule-content 匹配由 permissions.ts 处理。
      const ruleObj = rules as Record<string, unknown>
      if (ruleObj[tool.name] !== undefined) {
        return { behavior: 'deny', message: `${tool.name} blanket-denied` }
      }
    }
  }
  return { behavior: 'allow' }
}
