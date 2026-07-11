import { describe, test, expect } from 'bun:test'
import { extractToolCalls } from '../tool-call-extractor.js'

describe('extractToolCalls', () => {
  test('空消息返回空数组', () => {
    expect(extractToolCalls({} as never)).toEqual([])
  })

  test('提取 tool_use blocks', () => {
    const msg = {
      content: [
        { type: 'text', text: 'hello' },
        { type: 'tool_use', id: '1', name: 'Bash', input: { cmd: 'ls' } },
        { type: 'tool_use', id: '2', name: 'Read', input: { path: '/a' } },
      ],
    } as never
    const calls = extractToolCalls(msg)
    expect(calls).toHaveLength(2)
    expect(calls[0].name).toBe('Bash')
  })

  test('无 tool_use 返回空数组', () => {
    const msg = {
      content: [
        { type: 'text', text: 'hello' },
        { type: 'text', text: 'world' },
      ],
    } as never
    const calls = extractToolCalls(msg)
    expect(calls).toEqual([])
  })
})
