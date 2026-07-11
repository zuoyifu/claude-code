import type { EngineState, TurnEvent } from '../types.js'

export interface CompactEvent {
  type: 'compaction_started' | 'compaction_progress' | 'compaction_complete'
  [key: string]: unknown
}

/**
 * 上下文压缩（模式 A：AsyncGenerator）。
 * 调用方 yield* maybeCompact(state)。
 * 替代 QueryEngine.ts 中的 compaction yield 块。
 *
 * 注：此为 C10 拆分的新骨架实现。生产 src/QueryEngine.ts 保留原样（Plan B）。
 */
export async function* maybeCompact(
  state: EngineState,
): AsyncGenerator<TurnEvent> {
  if (!shouldCompact(state)) return

  yield { type: 'stream_event', event: { type: 'compaction_started' } }

  try {
    const compacted = await doCompaction(state)
    state.messages = compacted
    yield {
      type: 'stream_event',
      event: { type: 'compaction_complete', messageCount: compacted.length },
    }
  } catch (err) {
    yield { type: 'error', error: err as Error, recoverable: true }
  }
}

export function shouldCompact(state: EngineState): boolean {
  const totalChars = state.messages.reduce((sum, m) => {
    const content = (m as { content?: unknown[] }).content
    if (!Array.isArray(content)) return sum
    return sum + JSON.stringify(content).length
  }, 0)
  return totalChars > state.compactionThreshold
}

async function doCompaction(
  state: EngineState,
): Promise<EngineState['messages']> {
  // 调用 API 做摘要压缩
  const { callApi } = await import('../api.js')
  const summaryPrompt = buildSummaryPrompt(state.messages)

  const stream = await callApi(state.toLoopParams(), [
    { role: 'user', content: summaryPrompt } as never,
  ])

  let summary = ''
  for await (const event of stream) {
    const evt = event as { type: string; text?: string }
    if (evt.type === 'content_block_delta' && evt.text) {
      summary += evt.text
    }
  }

  return [
    {
      role: 'system',
      content: `Previous conversation summarized:\n${summary}`,
    } as never,
  ]
}

function buildSummaryPrompt(messages: EngineState['messages']): string {
  return `Summarize the following conversation concisely:\n${JSON.stringify(messages.slice(-20))}`
}
