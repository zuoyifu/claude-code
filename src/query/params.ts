import type { Message } from '../types/message.js'
import type { SystemPrompt } from '../utils/systemPromptType.js'
import type { CanUseToolFn } from '../hooks/useCanUseTool.js'
import type { ToolUseContext } from '../tools/core/index.js'
import type { QuerySource } from '../constants/querySource.js'
import type { QueryDeps } from './deps.js'
import type { QueryLoopParams } from './types.js'

/**
 * Public parameters accepted by the top-level query() async generator.
 *
 * Re-exported from src/query.ts so external callers (LocalMainSessionTask,
 * QueryEngine, forkedAgent, execAgentHook, REPL) can import it as
 * `import { type QueryParams } from '../query.js'`.
 *
 * Migrated verbatim from src/query.ts.
 */
export type QueryParams = {
  messages: Message[]
  systemPrompt: SystemPrompt
  userContext: { [k: string]: string }
  systemContext: { [k: string]: string }
  canUseTool: CanUseToolFn
  toolUseContext: ToolUseContext
  fallbackModel?: string
  querySource: QuerySource
  maxOutputTokensOverride?: number
  maxTurns?: number
  skipCacheWrite?: boolean
  // API task_budget (output_config.task_budget, beta task-budgets-2026-03-13).
  // Distinct from the tokenBudget +500k auto-continue feature. `total` is the
  // budget for the whole agentic turn; `remaining` is computed per iteration
  // from cumulative API usage. See configureTaskBudgetParams in claude.ts.
  taskBudget?: { total: number }
  deps?: QueryDeps
}

/**
 * 规范化 queryLoop 参数。
 * 替代 query.ts 行 276-392 的 query() 函数参数处理。
 *
 * 注：此为 C9 拆分的新骨架（Plan B 验证用），与上方生产 QueryParams 并存。
 */
export function normalizeParams(
  raw: Partial<QueryLoopParams>,
): QueryLoopParams {
  if (!raw.messages) throw new Error('messages is required')
  if (!raw.model) throw new Error('model is required')
  if (!raw.sessionId) throw new Error('sessionId is required')

  return {
    messages: raw.messages,
    tools: raw.tools ?? [],
    systemPrompt: raw.systemPrompt ?? '',
    model: raw.model,
    maxTokens: raw.maxTokens ?? 8192,
    sessionId: raw.sessionId,
    cwd: raw.cwd ?? process.cwd(),
    permissionCtx: raw.permissionCtx,
    apiConfig: raw.apiConfig ?? {
      provider: 'firstParty',
      apiKey: process.env.ANTHROPIC_API_KEY ?? '',
    },
  }
}
