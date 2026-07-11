import type { LoopState, TurnEvent } from '../types.js'
import type { Tool } from '../../tools/core/types.js'

/**
 * 派发工具调用，yield 执行事件。
 * 委托模式 A（AsyncGenerator）：调用方 yield* dispatchTools(...)。
 *
 * 注：此为 C9 拆分的新骨架，展示模式 A（AsyncGenerator + yield* 委托）。
 * 生产 query.ts 的工具派发逻辑保留原样（Plan B：薄包装层）。
 * runToolUse 的实际签名（需要 ToolUseBlock + AssistantMessage + CanUseToolFn + ToolUseContext）
 * 与 queryLoop 的简化抽象差异较大，因此此处仅做骨架结构。
 */
export async function* dispatchTools(
  toolCalls: Array<{ id: string; name: string; input: unknown }>,
  state: LoopState,
): AsyncGenerator<TurnEvent> {
  const toolsByName = new Map<string, Tool>(
    state.params.tools.map(t => [t.name, t]),
  )

  for (const call of toolCalls) {
    const tool = toolsByName.get(call.name)
    if (!tool) {
      yield {
        type: 'error',
        error: new Error(`Tool not found: ${call.name}`),
        recoverable: true,
      }
      continue
    }

    yield {
      type: 'tool_use',
      toolName: call.name,
      input: call.input,
      toolUseId: call.id,
    }

    try {
      // 生产代码使用 runToolUse(...) AsyncGenerator，签名较复杂。
      // 此骨架仅演示委托模式 A 结构，实际工具执行保留在生产 query.ts。
      // const { runToolUse } = await import('../../tools/execution/run-tool-use.js')
      // const result = yield* runToolUse(tool, call.input, ...)
      yield {
        type: 'tool_result',
        toolUseId: call.id,
        result: { dispatched: true, name: call.name },
      }
      state.toolUseCount++
    } catch (err) {
      yield {
        type: 'error',
        error: err as Error,
        recoverable: true,
      }
    }
  }
}
