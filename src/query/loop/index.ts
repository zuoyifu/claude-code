import type { QueryLoopParams, TurnEvent } from '../types.js'
import type { Message } from '../../types/message.js'
import { callApi } from '../api.js'
import { processStream } from '../stream/handlers.js'
import { dispatchTools } from './tool-dispatch.js'
import { mergeToolResults } from './tool-result-merge.js'
import { decideAutonomy } from './autonomy.js'
import { hitsOutputLimit } from './output-validation.js'
import { handleError } from './error-recovery.js'
import { initLoopState, shouldContinue } from './state.js'

/**
 * queryLoop 主循环生成器。
 * 委托模式 A（AsyncGenerator<TurnEvent>）：被 engine/submit-message.ts 用 yield*。
 *
 * v2 spec §7.4 H1：每个子模块的委托模式已明确标注。
 *
 * 注：此为 C9 拆分的新 queryLoop 骨架，与生产 query.ts 的 queryLoop 函数不同。
 * 生产 query.ts 保留原样作为薄包装层（Plan B）。本骨架用于验证 H1 委托模式。
 */
export async function* queryLoop(
  params: QueryLoopParams,
): AsyncGenerator<TurnEvent> {
  const state = initLoopState(params)

  while (shouldContinue(state)) {
    state.turn++
    try {
      // 1. 调 API（api 层）— 模式 B: await
      const stream = await callApi(state.params, state.messages)

      // 2. 处理流（模式 B: await）
      const streamResult = await processStream(stream, state)

      // 3. 更新 messages（模式 C）
      state.messages.push(streamResult.message)
      state.lastAssistantMessage = streamResult.message
      state.stopReason = streamResult.stopReason

      yield { type: 'assistant_message', message: streamResult.message }

      // 4. 派发工具（模式 A: yield*）
      if (streamResult.toolCalls.length > 0) {
        yield* dispatchTools(streamResult.toolCalls, state)
        const recentResults = state.messages
          .filter((m): m is Message & { content?: unknown[] } =>
            Array.isArray((m as { content?: unknown[] }).content),
          )
          .flatMap(m => m.content ?? [])
          .filter(
            (
              c,
            ): c is {
              type: 'tool_result'
              tool_use_id: string
              content: unknown
            } => (c as { type?: string }).type === 'tool_result',
          )
          .map(c => ({
            toolUseId: c.tool_use_id ?? '',
            result: c.content,
          }))
        if (recentResults.length > 0) {
          yield* mergeToolResults(recentResults, state.messages)
        }
      }

      // 5. autonomy 决策（模式 B: await）
      const decision = await decideAutonomy(state)
      if (decision.shouldStop) {
        yield { type: 'turn_complete', turn: state.turn }
        break
      }

      // 6. 输出限制检查（模式 C）
      if (hitsOutputLimit(state)) {
        yield { type: 'loop_end', reason: 'output_limit' }
        break
      }

      yield { type: 'turn_complete', turn: state.turn }
    } catch (err) {
      // 7. 错误恢复（模式 A: yield*）
      yield* handleError(err as Error, state)
      if (state.fatalError) {
        yield { type: 'loop_end', reason: 'fatal_error' }
        break
      }
    }
  }
}
