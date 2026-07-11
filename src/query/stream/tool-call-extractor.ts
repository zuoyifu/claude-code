import type { Message } from '../../types/message.js'

/**
 * 从消息中提取 tool_use 调用。
 * 委托模式 C（同步函数）。
 */
export function extractToolCalls(
  message: Message,
): Array<{ id: string; name: string; input: unknown }> {
  const content = (message as { content?: unknown[] }).content
  if (!Array.isArray(content)) return []

  return content
    .filter(
      (
        block,
      ): block is {
        type: 'tool_use'
        id: string
        name: string
        input: unknown
      } => (block as { type: string }).type === 'tool_use',
    )
    .map(block => ({
      id: block.id,
      name: block.name,
      input: block.input,
    }))
}
