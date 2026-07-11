import { describe, test, expect } from 'bun:test'
import { mergeToolResults } from '../loop/tool-result-merge.js'
import type { Message } from '../../types/message.js'

describe('mergeToolResults (L4 MVP yield* delegation)', () => {
  test('yields one event per result and pushes to messages', async () => {
    const messages: Message[] = []
    const results = [
      { toolUseId: 'tool_1', result: 'r1' },
      { toolUseId: 'tool_2', result: 'r2' },
    ]

    const events: Array<{ type: string; toolUseId: string }> = []
    for await (const ev of mergeToolResults(results, messages)) {
      events.push(ev as { type: string; toolUseId: string })
    }

    expect(events).toHaveLength(2)
    expect(events[0].type).toBe('tool_result_merged')
    expect(events[0].toolUseId).toBe('tool_1')
    expect(events[1].toolUseId).toBe('tool_2')
    expect(messages).toHaveLength(2)
  })

  test('empty results yields nothing', async () => {
    const messages: Message[] = []
    let count = 0
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _ev of mergeToolResults([], messages)) {
      count++
    }
    expect(count).toBe(0)
    expect(messages).toHaveLength(0)
  })

  test('can be composed with yield* in another async generator', async () => {
    const messages: Message[] = []
    const results = [{ toolUseId: 'a', result: 'x' }]

    async function* parent(): AsyncGenerator<{ type: string }> {
      yield { type: 'before' }
      yield* mergeToolResults(results, messages)
      yield { type: 'after' }
    }

    const events: string[] = []
    for await (const ev of parent()) {
      events.push(ev.type)
    }

    expect(events).toEqual(['before', 'tool_result_merged', 'after'])
  })
})
