import type { Message } from '../types/message.js'
import type { Tool } from '../tools/core/types.js'

/**
 * queryLoop 的输入参数。
 *
 * 注：这是 C9 拆分的新抽象，与生产 query.ts 的 QueryParams 不同。
 * 生产 query.ts 保留原样（Plan B：薄包装层），queryLoop 为并行新实现。
 */
export interface QueryLoopParams {
  messages: Message[]
  tools: Tool[]
  systemPrompt: string
  model: string
  maxTokens?: number
  sessionId: string
  cwd: string
  permissionCtx: unknown
  apiConfig: {
    provider: string
    apiKey: string
    baseUrl?: string
  }
}

/**
 * turn 循环产生的事件（yield 给上游）。
 */
export type TurnEvent =
  | { type: 'assistant_message'; message: Message }
  | { type: 'tool_use'; toolName: string; input: unknown; toolUseId: string }
  | { type: 'tool_result'; toolUseId: string; result: unknown }
  | { type: 'tool_result_merged'; toolUseId: string; message: Message }
  | { type: 'stream_event'; event: unknown }
  | { type: 'error'; error: Error; recoverable: boolean }
  | { type: 'turn_complete'; turn: number }
  | { type: 'loop_end'; reason: string }

/**
 * loop 内部状态。
 */
export interface LoopState {
  params: QueryLoopParams
  turn: number
  messages: Message[]
  fatalError: boolean
  stopReason?: string
  lastAssistantMessage?: Message
  toolUseCount: number
  tokenUsage: { input: number; output: number }
}

/**
 * stream 处理结果。
 */
export interface StreamResult {
  message: Message
  toolCalls: Array<{ id: string; name: string; input: unknown }>
  stopReason: string
  usage: { input: number; output: number }
}

/**
 * autonomy 决策。
 */
export interface AutonomyDecision {
  shouldStop: boolean
  reason?: string
}

/**
 * Engine 会话级状态（v2 spec §7.5）。
 * 由 QueryEngine 类持有，传给各 engine 子模块。
 *
 * 注：这是 C10 拆分的新抽象，与生产 src/QueryEngine.ts 的 QueryEngineConfig 不同。
 * 生产 src/QueryEngine.ts 保留原样作为薄包装层（Plan B）。
 */
export interface EngineState {
  sessionId: string
  cwd: string
  messages: Message[]
  tools: Tool[]
  model: string
  permissionCtx: unknown
  systemPrompt: string
  apiKey: string
  provider: string
  compactionThreshold: number
  interrupted: boolean
  fileHistorySnapshots: Map<string, unknown>
  nestedMemory: Set<string>
  discoveredSkills: Set<string>
  attribution: { promptCacheHits?: number; fingerprint?: string }
  apiConfig: { provider: string; apiKey: string; baseUrl?: string }

  /** 转换为 QueryLoopParams 供 loop 调用 */
  toLoopParams(): QueryLoopParams
}
