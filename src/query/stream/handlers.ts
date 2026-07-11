import type { StreamResult, LoopState } from '../types.js'
import type { Message } from '../../types/message.js'
import { reduceMessage } from './reducer.js'
import { extractToolCalls } from './tool-call-extractor.js'

/**
 * 处理 API 流，返回聚合结果。
 * 委托模式 B（Promise<StreamResult>）：调用方 await。
 */
export async function processStream(
  stream: AsyncIterable<unknown>,
  state: LoopState,
): Promise<StreamResult> {
  let message = {} as Message
  let stopReason = 'end_turn'
  let usage = { input: 0, output: 0 }

  for await (const event of stream) {
    const reduced = reduceMessage(message, event)
    message = reduced.message

    if ((event as { type: string }).type === 'message_stop') {
      stopReason =
        (event as { message?: { stop_reason?: string } }).message
          ?.stop_reason ?? 'end_turn'
    }
    if ((event as { type: string }).type === 'message_delta') {
      const delta = (event as { usage?: { input?: number; output?: number } })
        .usage
      if (delta) {
        usage = {
          input: usage.input + (delta.input ?? 0),
          output: usage.output + (delta.output ?? 0),
        }
      }
    }
  }

  const toolCalls = extractToolCalls(message)
  state.tokenUsage.input += usage.input
  state.tokenUsage.output += usage.output

  return { message, toolCalls, stopReason, usage }
}
