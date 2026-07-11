import type { LoopState, QueryLoopParams } from '../types.js'
import type { Message } from '../../types/message.js'
import type { ToolUseContext } from '../../tools/core/index.js'
import type { AutoCompactTrackingState } from '../../services/compact/autoCompact.js'
import type { ToolUseSummaryMessage } from '../../types/message.js'
import type { Continue } from '../transitions.js'

/**
 * Mutable state carried between queryLoop iterations.
 *
 * Each of the 7 `continue` sites in queryLoop constructs a complete new
 * State object — any field omitted there is lost. Migrated verbatim from
 * src/query.ts.
 */
export type State = {
  messages: Message[]
  toolUseContext: ToolUseContext
  autoCompactTracking: AutoCompactTrackingState | undefined
  maxOutputTokensRecoveryCount: number
  hasAttemptedReactiveCompact: boolean
  maxOutputTokensOverride: number | undefined
  pendingToolUseSummary: Promise<ToolUseSummaryMessage | null> | undefined
  stopHookActive: boolean | undefined
  turnCount: number
  // Why the previous iteration continued. Undefined on first iteration.
  // Lets tests assert recovery paths fired without inspecting message contents.
  transition: Continue | undefined
}

// --- skeleton types below (Plan B verification, kept for compatibility) ---

export function initLoopState(params: QueryLoopParams): LoopState {
  return {
    params,
    turn: 0,
    messages: [...params.messages],
    fatalError: false,
    toolUseCount: 0,
    tokenUsage: { input: 0, output: 0 },
  }
}

export function shouldContinue(state: LoopState): boolean {
  if (state.fatalError) return false
  if (state.stopReason === 'end_turn') return false
  if (state.turn >= (state.params.maxTokens ?? 100)) return false
  return true
}
