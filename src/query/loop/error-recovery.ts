import type { LoopState, TurnEvent } from '../types.js'
import type {
  AssistantMessage,
  Message,
  StreamEvent,
} from '../../types/message.js'
import type { Terminal } from '../transitions.js'
import type { AutonomyTurnOutcome } from '../../utils/autonomyQueueLifecycle.js'

/**
 * Maximum number of times the loop will retry a turn whose stop reason was
 * `max_output_tokens`. After this many escalations we surface the error.
 *
 * Migrated verbatim from src/query.ts line 163.
 */
export const MAX_OUTPUT_TOKENS_RECOVERY_LIMIT = 3

/**
 * Is this a max_output_tokens error message? If so, the streaming loop should
 * withhold it from SDK callers until we know whether the recovery loop can
 * continue. Yielding early leaks an intermediate error to SDK callers (e.g.
 * cowork/desktop) that terminate the session on any `error` field — the
 * recovery loop keeps running but nobody is listening.
 *
 * Mirrors reactiveCompact.isWithheldPromptTooLong.
 *
 * Migrated verbatim from src/query.ts lines 174-178.
 */
export function isWithheldMaxOutputTokens(
  msg: Message | StreamEvent | undefined,
): msg is AssistantMessage {
  return msg?.type === 'assistant' && msg.apiError === 'max_output_tokens'
}

/**
 * Maps the loop's Terminal outcome (and any thrown error) to an
 * AutonomyTurnOutcome consumed by the autonomy queue lifecycle in query()'s
 * finally block. Migrated verbatim from src/query.ts lines 180-205.
 */
export function getAutonomyTurnOutcome(params: {
  terminal?: Terminal
  thrownError?: unknown
}): AutonomyTurnOutcome {
  if (params.thrownError !== undefined) {
    return { type: 'failed', error: params.thrownError }
  }

  const terminal = params.terminal
  const reason = terminal?.reason
  switch (reason) {
    case 'completed':
      return { type: 'completed' }
    case undefined:
    case 'aborted_streaming':
    case 'aborted_tools':
      return { type: 'cancelled' }
    case 'model_error':
      return { type: 'failed', error: terminal.error }
    default:
      return {
        type: 'failed',
        message: `query ended without successful completion: ${reason}`,
      }
  }
}

/**
 * 错误恢复：yield 错误事件，更新 state。
 * 委托模式 A（AsyncGenerator）：调用方 yield* handleError(...)。
 *
 * 注：此为 C9 拆分的新骨架（Plan B 验证用），与上方生产 helper 并存。
 */
export async function* handleError(
  err: Error,
  state: LoopState,
): AsyncGenerator<TurnEvent> {
  const recoverable = isRecoverable(err)
  yield { type: 'error', error: err, recoverable }

  if (!recoverable) {
    state.fatalError = true
    state.stopReason = 'fatal_error'
  }
}

function isRecoverable(err: Error): boolean {
  const msg = err.message.toLowerCase()
  if (msg.includes('rate limit')) return true
  if (msg.includes('timeout')) return true
  if (msg.includes('overloaded')) return true
  return false
}
