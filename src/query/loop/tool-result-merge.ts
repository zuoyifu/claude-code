import type { ToolUseBlock } from '@anthropic-ai/sdk/resources/index.mjs'
import type {
  AssistantMessage,
  Message,
  UserMessage,
} from '../../types/message.js'
import { createUserMessage } from '../../utils/messages.js'

/**
 * Yield an error tool_result user message for every tool_use block found in
 * `assistantMessages` that did not receive a tool_result (e.g. because the
 * stream aborted or the API errored mid-response). Without these synthetic
 * results the next API request would contain a bare tool_use and the SDK
 * would reject it.
 *
 * 委托模式 A（AsyncGenerator）：调用方用 yield* yieldMissingToolResultBlocks(...)。
 *
 * Migrated verbatim from src/query.ts lines 149-179.
 */
export function* yieldMissingToolResultBlocks(
  assistantMessages: AssistantMessage[],
  errorMessage: string,
): Generator<UserMessage> {
  for (const assistantMessage of assistantMessages) {
    // Extract all tool use blocks from this assistant message
    const toolUseBlocks = (
      Array.isArray(assistantMessage.message?.content)
        ? assistantMessage.message.content
        : []
    ).filter(
      (content: { type: string }) => content.type === 'tool_use',
    ) as ToolUseBlock[]

    // Emit an interruption message for each tool use
    for (const toolUse of toolUseBlocks) {
      yield createUserMessage({
        content: [
          {
            type: 'tool_result',
            content: errorMessage,
            is_error: true,
            tool_use_id: toolUse.id,
          },
        ],
        toolUseResult: errorMessage,
        sourceToolAssistantUUID: assistantMessage.uuid,
      })
    }
  }
}

/**
 * MVP：验证 yield* 委托模式。
 * 从 queryLoop() 中抽取的 tool result merge 逻辑。
 *
 * 委托模式 A（AsyncGenerator）：调用方用 yield* mergeToolResults(...)
 *
 * 注：此为 C9 L4 MVP 模块，用于验证 H1 yield* 委托可行。
 * query.ts 的生产 queryLoop 内联实现保留不动（Plan B：薄包装层）。
 */
export async function* mergeToolResults(
  results: Array<{ toolUseId: string; result: unknown }>,
  messages: Message[],
): AsyncGenerator<{
  type: 'tool_result_merged'
  toolUseId: string
  message: Message
}> {
  for (const { toolUseId, result } of results) {
    const resultMessage: Message = {
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: toolUseId,
          content: result,
        },
      ],
    } as unknown as Message
    messages.push(resultMessage)
    yield { type: 'tool_result_merged', toolUseId, message: resultMessage }
  }
}
