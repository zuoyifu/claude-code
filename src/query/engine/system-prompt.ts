/**
 * System prompt 组装（C10.5 迁移自 src/QueryEngine.ts submitMessage :316-348）。
 *
 * 包含 coordinator userContext merge（feature-gated）+ memoryMechanicsPrompt
 * 注入 + systemPrompt 三层拼接（customPrompt/appendSystemPrompt/memoryMechanicsPrompt）
 * + structured output hook 注册。
 */
import { feature } from 'bun:bundle'
import { getSessionId } from '../../bootstrap/state.js'
import { loadMemoryPrompt } from '../../memdir/memdir.js'
import { hasAutoMemPathOverride } from '../../memdir/paths.js'
import { asSystemPrompt } from '../../utils/systemPromptType.js'
import type { SystemPrompt } from '@ant/model-provider'
import { registerStructuredOutputEnforcement } from '../../utils/hooks/hookHelpers.js'
import { toolMatchesName } from '../../tools/core/index.js'
import { SYNTHETIC_OUTPUT_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/SyntheticOutputTool/SyntheticOutputTool.js'
import {
  getScratchpadDir,
  isScratchpadEnabled,
} from '../../utils/permissions/filesystem.js'
import type { MCPServerConnection } from '../../services/mcp/types.js'
import type { Tools } from '../../tools/core/index.js'
import type { AppState } from '../../state/AppState.js'

// Dead code elimination: conditional import for coordinator mode
/* eslint-disable @typescript-eslint/no-require-imports */
const getCoordinatorUserContext: (
  mcpClients: ReadonlyArray<{ name: string }>,
  scratchpadDir?: string,
) => { [k: string]: string } = feature('COORDINATOR_MODE')
  ? require('../../coordinator/coordinatorMode.js').getCoordinatorUserContext
  : () => ({})
/* eslint-enable @typescript-eslint/no-require-imports */

/**
 * 合并 baseUserContext 与 coordinator userContext（feature-gated）。
 * coordinator 模式禁用时 getCoordinatorUserContext 返回空对象。
 */
export function mergeCoordinatorUserContext(
  baseUserContext: Record<string, string>,
  mcpClients: ReadonlyArray<MCPServerConnection>,
): Record<string, string> {
  return {
    ...baseUserContext,
    ...getCoordinatorUserContext(
      mcpClients,
      isScratchpadEnabled() ? getScratchpadDir() : undefined,
    ),
  }
}

/**
 * 加载 memory mechanics prompt（仅当 customPrompt !== undefined && hasAutoMemPathOverride）。
 * 返回 null 表示不注入。
 */
export async function loadMemoryMechanicsPrompt(
  customPrompt: string | undefined,
): Promise<string | null> {
  if (customPrompt !== undefined && hasAutoMemPathOverride()) {
    return await loadMemoryPrompt()
  }
  return null
}

/**
 * 拼接 systemPrompt（原 submitMessage :335-339）。
 *
 * 三层：[customPrompt 或 defaultSystemPrompt] + [memoryMechanicsPrompt?] + [appendSystemPrompt?]
 */
export function assembleSystemPrompt(params: {
  customPrompt: string | undefined
  defaultSystemPrompt: readonly string[]
  memoryMechanicsPrompt: string | null
  appendSystemPrompt: string | undefined
}): SystemPrompt {
  const {
    customPrompt,
    defaultSystemPrompt,
    memoryMechanicsPrompt,
    appendSystemPrompt,
  } = params
  return asSystemPrompt([
    ...(customPrompt !== undefined ? [customPrompt] : defaultSystemPrompt),
    ...(memoryMechanicsPrompt ? [memoryMechanicsPrompt] : []),
    ...(appendSystemPrompt ? [appendSystemPrompt] : []),
  ])
}

/**
 * 注册 structured output 强制 hook（原 submitMessage :342-347）。
 *
 * 仅当 jsonSchema && hasStructuredOutputTool 时注册。
 */
export function maybeRegisterStructuredOutput(
  tools: Tools,
  jsonSchema: Record<string, unknown> | undefined,
  setAppState: (f: (prev: AppState) => AppState) => void,
): void {
  if (!jsonSchema) return
  const hasStructuredOutputTool = tools.some(t =>
    toolMatchesName(t, SYNTHETIC_OUTPUT_TOOL_NAME),
  )
  if (hasStructuredOutputTool) {
    registerStructuredOutputEnforcement(setAppState, getSessionId())
  }
}
