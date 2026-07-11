/**
 * Query loop 内消息处理（C10.5 迁移自 src/QueryEngine.ts submitMessage :692-1106）。
 *
 * for-await-of 主循环内 8 个 switch case 的 yield 逻辑。
 * 每个处理函数接收 loop state 并 yield SDKMessage，保持原 37 个 yield 点
 * 行为零改变。
 */
import { randomUUID } from 'crypto'
import { getSessionId } from '../../bootstrap/state.js'
import { accumulateUsage, updateUsage } from '../../services/api/claude.js'
import { categorizeRetryableAPIError } from '../../services/api/errors.js'
import {
  getTotalAPIDuration,
  getTotalCost,
  getModelUsage,
} from '../../cost-tracker.js'
import { getFastModeState } from '../../utils/fastMode.js'
import { isEnvTruthy } from '../../utils/envUtils.js'
import { countToolCalls, SYNTHETIC_MESSAGES } from '../../utils/messages.js'
import {
  flushSessionStorage,
  recordTranscript,
} from '../../utils/sessionStorage.js'
import { normalizeMessage } from '../../utils/queryHelpers.js'
import { toSDKCompactMetadata } from '../../utils/messages/mappers.js'
import { SYNTHETIC_OUTPUT_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/SyntheticOutputTool/SyntheticOutputTool.js'
import { maybeFlushSession, persistLoopMessage } from './session-persist.js'
import {
  appendMessages,
  releasePreBoundaryMessages,
  replaceMessagesInPlace,
} from './messages-state.js'
import type { BetaMessageDeltaUsage } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import type { APIError } from '@anthropic-ai/sdk'
import type { NonNullableUsage } from '@ant/model-provider'
import type {
  SDKCompactBoundaryMessage,
  SDKMessage,
  SDKUserMessageReplay,
} from '../../entrypoints/agentSdkTypes.js'
import type {
  Message,
  SystemCompactBoundaryMessage,
} from '../../types/message.js'
import type { AppState } from '../../state/AppState.js'
import type { SnipReplayFn } from './engine-state.js'

/**
 * 循环内可变状态（由 submitMessage 维护，传入各 handler）。
 */
export interface LoopMutableState {
  messages: Message[] // 本地快照（不等于 mutableMessages）
  mutableMessages: Message[]
  turnCount: number
  lastStopReason: string | null
  currentMessageUsage: NonNullableUsage
  totalUsage: NonNullableUsage
  structuredOutputFromTool: unknown
  permissionDenials: SDKMessage extends { permission_denials?: infer P }
    ? P
    : never
  persistSession: boolean
  startTime: number
  mainLoopModel: string
  initialFastMode: AppState['fastMode']
  replayUserMessages: boolean
  includePartialMessages: boolean
  jsonSchema: Record<string, unknown> | undefined
  messagesToAck: Message[]
  hasAcknowledgedInitialMessages: boolean
  initialStructuredOutputCalls: number
  snipReplay: SnipReplayFn | undefined
}

/**
 * transcript 持久化前置：compact_boundary 时 flush preservedSegment tail
 * （原 :718-734）。
 */
export async function maybeFlushPreservedSegmentTail(
  message: Message,
  mutableMessages: readonly Message[],
): Promise<void> {
  if (message.type !== 'system' || message.subtype !== 'compact_boundary')
    return
  const compactMsg = message as SystemCompactBoundaryMessage
  const tailUuid = compactMsg.compactMetadata?.preservedSegment?.tailUuid
  if (!tailUuid) return
  const tailIdx = mutableMessages.findLastIndex(m => m.uuid === tailUuid)
  if (tailIdx !== -1) {
    await recordTranscript(mutableMessages.slice(0, tailIdx + 1))
  }
}

/**
 * 处理 assistant/user/compact_boundary 的 transcript 持久化与 ack
 * （原 :704-770）。
 *
 * yield messagesToAck 中的 user 消息（每个循环至多一次，hasAcknowledgedInitialMessages 守卫）。
 */
export async function* handleLoopMessagePersist(
  message: Message,
  state: LoopMutableState,
): AsyncGenerator<SDKUserMessageReplay> {
  const { messages, persistSession, messagesToAck } = state
  if (
    message.type === 'assistant' ||
    message.type === 'user' ||
    (message.type === 'system' && message.subtype === 'compact_boundary')
  ) {
    messages.push(message)
    if (persistSession) {
      await persistLoopMessage(messages, message.type, persistSession)
    }

    if (!state.hasAcknowledgedInitialMessages && messagesToAck.length > 0) {
      state.hasAcknowledgedInitialMessages = true
      for (const msgToAck of messagesToAck) {
        if (msgToAck.type === 'user') {
          yield {
            type: 'user',
            message: msgToAck.message,
            session_id: getSessionId(),
            parent_tool_use_id: null,
            uuid: msgToAck.uuid,
            timestamp: msgToAck.timestamp,
            isReplay: true,
          } as unknown as SDKUserMessageReplay
        }
      }
    }
  }
}

/**
 * 处理 assistant 消息（原 :780-795）。
 *
 * yield* normalizeMessage 委托。
 */
export async function* handleAssistantMessage(
  message: Message,
  state: LoopMutableState,
): AsyncGenerator<SDKMessage> {
  const stopReason = message.message?.stop_reason as string | null | undefined
  if (stopReason != null) {
    state.lastStopReason = stopReason
  }
  appendMessages(state.mutableMessages, [message])
  yield* normalizeMessage(message)
}

/**
 * 处理 progress 消息（原 :796-810）。
 */
export async function* handleProgressMessage(
  message: Message,
  state: LoopMutableState,
): AsyncGenerator<SDKMessage> {
  appendMessages(state.mutableMessages, [message])
  if (state.persistSession) {
    state.messages.push(message)
    void recordTranscript(state.messages)
  }
  yield* normalizeMessage(message)
}

/**
 * 处理 user 消息（原 :811-816）。
 */
export async function* handleUserMessage(
  message: Message,
  state: LoopMutableState,
): AsyncGenerator<SDKMessage> {
  appendMessages(state.mutableMessages, [message])
  yield* normalizeMessage(message)
}

/**
 * 处理 stream_event（原 :817-865）。
 *
 * 更新 currentMessageUsage / totalUsage / lastStopReason；
 * includePartialMessages 时 yield stream_event。
 */
export async function* handleStreamEvent(
  event: Record<string, unknown>,
  state: LoopMutableState,
): AsyncGenerator<SDKMessage> {
  if (event.type === 'message_start') {
    const eventMessage = event.message as { usage: BetaMessageDeltaUsage }
    state.currentMessageUsage = updateUsage(
      state.currentMessageUsage,
      eventMessage.usage,
    )
  }
  if (event.type === 'message_delta') {
    state.currentMessageUsage = updateUsage(
      state.currentMessageUsage,
      event.usage as BetaMessageDeltaUsage,
    )
    const delta = event.delta as { stop_reason?: string | null }
    if (delta?.stop_reason != null) {
      state.lastStopReason = delta.stop_reason
    }
  }
  if (event.type === 'message_stop') {
    state.totalUsage = accumulateUsage(
      state.totalUsage,
      state.currentMessageUsage,
    )
  }

  if (state.includePartialMessages) {
    yield {
      type: 'stream_event' as const,
      event,
      session_id: getSessionId(),
      parent_tool_use_id: null,
      uuid: randomUUID(),
    }
  }
}

/**
 * 处理 attachment 消息（原 :866-939）。
 *
 * 返回 { done: true, result?: ResultYield } 表示提前 return；
 * 否则正常 yield。
 */
export async function* handleAttachmentMessage(
  message: Message,
  state: LoopMutableState,
): AsyncGenerator<SDKMessage | SDKUserMessageReplay> {
  appendMessages(state.mutableMessages, [message])
  if (state.persistSession) {
    state.messages.push(message)
    void recordTranscript(state.messages)
  }

  const attachment = message.attachment as {
    type: string
    data?: unknown
    turnCount?: number
    maxTurns?: number
    prompt?: string
    source_uuid?: string
    [key: string]: unknown
  }

  if (attachment.type === 'structured_output') {
    state.structuredOutputFromTool = attachment.data
  } else if (attachment.type === 'max_turns_reached') {
    if (state.persistSession) {
      await maybeFlushSession()
    }
    yield {
      type: 'result',
      subtype: 'error_max_turns',
      duration_ms: Date.now() - state.startTime,
      duration_api_ms: getTotalAPIDuration(),
      is_error: true,
      num_turns: attachment.turnCount as number,
      stop_reason: state.lastStopReason,
      session_id: getSessionId(),
      total_cost_usd: getTotalCost(),
      usage: state.totalUsage,
      modelUsage: getModelUsage(),
      permission_denials: state.permissionDenials,
      fast_mode_state: getFastModeState(
        state.mainLoopModel,
        state.initialFastMode,
      ),
      uuid: randomUUID(),
      errors: [`Reached maximum number of turns (${attachment.maxTurns})`],
    }
  } else if (state.replayUserMessages && attachment.type === 'queued_command') {
    yield {
      type: 'user',
      message: {
        role: 'user' as const,
        content: attachment.prompt,
      },
      session_id: getSessionId(),
      parent_tool_use_id: null,
      uuid: attachment.source_uuid || message.uuid,
      timestamp: message.timestamp,
      isReplay: true,
    } as unknown as SDKUserMessageReplay
  }
}

/**
 * 处理 system 消息（原 :943-1008）。
 *
 * snip 边界 replay → compact_boundary GC → api_error→api_retry 映射。
 * 返回 true 表示 snip 已处理（应该 break）。
 */
export async function* handleSystemMessage(
  message: Message,
  state: LoopMutableState,
): AsyncGenerator<SDKMessage> {
  const snipResult = state.snipReplay?.(message, state.mutableMessages)
  if (snipResult !== undefined) {
    if (snipResult.executed) {
      replaceMessagesInPlace(state.mutableMessages, snipResult.messages)
    }
    return
  }

  appendMessages(state.mutableMessages, [message])

  if (message.subtype === 'compact_boundary' && message.compactMetadata) {
    const compactMsg = message as SystemCompactBoundaryMessage
    releasePreBoundaryMessages(state.mutableMessages, state.messages)

    yield {
      type: 'system',
      subtype: 'compact_boundary' as const,
      session_id: getSessionId(),
      uuid: message.uuid,
      compact_metadata: toSDKCompactMetadata(compactMsg.compactMetadata),
    }
  }

  if (message.subtype === 'api_error') {
    const apiErrorMsg = message as Message & {
      retryAttempt: number
      maxRetries: number
      retryInMs: number
      error: APIError
    }
    yield {
      type: 'system',
      subtype: 'api_retry' as const,
      attempt: apiErrorMsg.retryAttempt,
      max_retries: apiErrorMsg.maxRetries,
      retry_delay_ms: apiErrorMsg.retryInMs,
      error_status: apiErrorMsg.error.status ?? null,
      error: categorizeRetryableAPIError(apiErrorMsg.error),
      session_id: getSessionId(),
      uuid: message.uuid,
    }
  }
}

/**
 * 处理 tool_use_summary（原 :1009-1023）。
 */
export function* handleToolUseSummary(
  message: Message & { summary: unknown; precedingToolUseIds: unknown },
): Generator<SDKMessage> {
  yield {
    type: 'tool_use_summary' as const,
    summary: message.summary,
    preceding_tool_use_ids: message.precedingToolUseIds,
    session_id: getSessionId(),
    uuid: message.uuid,
  }
}

/**
 * 检查 USD budget 超限（原 :1026-1059）。
 *
 * 返回 ResultYield 表示应提前 return；返回 undefined 表示继续。
 */
export async function checkBudgetExceeded(
  state: LoopMutableState,
  maxBudgetUsd: number | undefined,
): Promise<SDKMessage | undefined> {
  if (maxBudgetUsd === undefined || getTotalCost() < maxBudgetUsd) return
  if (state.persistSession) {
    if (
      isEnvTruthy(process.env.CLAUDE_CODE_EAGER_FLUSH) ||
      isEnvTruthy(process.env.CLAUDE_CODE_IS_COWORK)
    ) {
      await flushSessionStorage()
    }
  }
  return {
    type: 'result',
    subtype: 'error_max_budget_usd',
    duration_ms: Date.now() - state.startTime,
    duration_api_ms: getTotalAPIDuration(),
    is_error: true,
    num_turns: state.turnCount,
    stop_reason: state.lastStopReason,
    session_id: getSessionId(),
    total_cost_usd: getTotalCost(),
    usage: state.totalUsage,
    modelUsage: getModelUsage(),
    permission_denials: state.permissionDenials,
    fast_mode_state: getFastModeState(
      state.mainLoopModel,
      state.initialFastMode,
    ),
    uuid: randomUUID(),
    errors: [
      `Reached maximum budget ($${maxBudgetUsd}). Increase the limit with --max-budget-usd or start a new session.`,
    ],
  }
}

/**
 * 检查 structured output retry 超限（原 :1061-1105）。
 *
 * 返回 ResultYield 表示应提前 return；返回 undefined 表示继续。
 */
export async function checkStructuredOutputRetryExceeded(
  state: LoopMutableState,
  message: Message,
): Promise<SDKMessage | undefined> {
  if (message.type !== 'user' || !state.jsonSchema) return
  const currentCalls = countToolCalls(
    state.mutableMessages,
    SYNTHETIC_OUTPUT_TOOL_NAME,
  )
  const callsThisQuery = currentCalls - state.initialStructuredOutputCalls
  const maxRetries = parseInt(
    process.env.MAX_STRUCTURED_OUTPUT_RETRIES || '5',
    10,
  )
  if (callsThisQuery < maxRetries) return

  if (state.persistSession) {
    if (
      isEnvTruthy(process.env.CLAUDE_CODE_EAGER_FLUSH) ||
      isEnvTruthy(process.env.CLAUDE_CODE_IS_COWORK)
    ) {
      await flushSessionStorage()
    }
  }
  return {
    type: 'result',
    subtype: 'error_max_structured_output_retries',
    duration_ms: Date.now() - state.startTime,
    duration_api_ms: getTotalAPIDuration(),
    is_error: true,
    num_turns: state.turnCount,
    stop_reason: state.lastStopReason,
    session_id: getSessionId(),
    total_cost_usd: getTotalCost(),
    usage: state.totalUsage,
    modelUsage: getModelUsage(),
    permission_denials: state.permissionDenials,
    fast_mode_state: getFastModeState(
      state.mainLoopModel,
      state.initialFastMode,
    ),
    uuid: randomUUID(),
    errors: [
      `Failed to provide valid structured output after ${maxRetries} attempts`,
    ],
  }
}
