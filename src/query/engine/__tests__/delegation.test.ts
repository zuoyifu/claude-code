import { describe, test, expect } from 'bun:test'
import { runSubmitMessage } from '../submit-message.js'
import { pushMessage } from '../messages-state.js'
import { snapshotHistory } from '../file-history.js'
import { maybeCompact } from '../compaction.js'
import { isInterrupted } from '../interrupt.js'
import { computeAttribution } from '../attribution.js'
import { SkeletonQueryEngine } from '../QueryEngine.js'
import type { EngineState, QueryLoopParams } from '../../types.js'

describe('C10 H1 delegation modes', () => {
  test('submit-message 返回 AsyncGenerator（模式 A）', () => {
    expect(typeof runSubmitMessage).toBe('function')
    const fakeState = {
      messages: [],
      tools: [],
      toLoopParams(): QueryLoopParams {
        return {
          messages: [],
          tools: [],
          systemPrompt: '',
          model: 'x',
          sessionId: 's',
          cwd: '/',
          permissionCtx: {},
          apiConfig: { provider: 'firstParty', apiKey: '' },
        }
      },
    } as unknown as EngineState
    const gen = runSubmitMessage(fakeState, {
      role: 'user',
      content: 'hi',
    } as never)
    expect(typeof gen.next).toBe('function')
    expect(typeof gen[Symbol.asyncIterator]).toBe('function')
  })

  test('messages-state pushMessage 是同步（模式 C）', () => {
    expect(typeof pushMessage).toBe('function')
    const state = { messages: [] } as unknown as EngineState
    pushMessage(state, { role: 'user', content: 'x' } as never)
    // 同步执行，无 Promise
    expect(state.messages).toHaveLength(1)
  })

  test('file-history snapshotHistory 返回 Promise（模式 B）', () => {
    const state = {
      messages: [],
      fileHistorySnapshots: new Map(),
    } as unknown as EngineState
    const result = snapshotHistory(state)
    expect(result).toBeInstanceOf(Promise)
  })

  test('compaction maybeCompact 返回 AsyncGenerator（模式 A）', () => {
    const state = {
      messages: [],
      compactionThreshold: 1_000_000,
      toLoopParams: (() => ({})) as unknown as EngineState['toLoopParams'],
    } as unknown as EngineState
    const gen = maybeCompact(state)
    expect(typeof gen.next).toBe('function')
  })

  test('interrupt isInterrupted 返回 boolean（模式 C）', () => {
    const state = { interrupted: false } as unknown as EngineState
    const result = isInterrupted(state)
    expect(typeof result).toBe('boolean')
  })

  test('attribution computeAttribution 返回对象（模式 C）', () => {
    const state = {
      attribution: { promptCacheHits: 100 },
    } as unknown as EngineState
    const result = computeAttribution(state)
    expect(typeof result).toBe('object')
    expect(result.promptCacheHits).toBe(100)
  })

  test('QueryEngine.submitMessage 返回 AsyncGenerator', () => {
    const engine = new SkeletonQueryEngine({
      cwd: '/tmp',
      sessionId: 'test',
      model: 'claude-sonnet',
      permissionCtx: {},
    })
    const gen = engine.submitMessage({ role: 'user', content: 'hi' } as never)
    expect(typeof gen.next).toBe('function')
  })
})
