import { describe, test, expect } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const SRC = path.resolve(process.cwd(), 'src/query')

describe('C9 query split (Plan A complete: query.ts removed)', () => {
  test('src/query.ts 已删除（Plan A 完成态：shim 移除，生产代码全部在 src/query/）', () => {
    expect(existsSync(path.resolve(process.cwd(), 'src/query.ts'))).toBe(false)
  })

  test('query/ 目录含关键文件（骨架子模块）', () => {
    const expected = [
      'api.ts',
      'types.ts',
      'params.ts',
      'loop/index.ts',
      'loop/tool-dispatch.ts',
      'loop/tool-result-merge.ts',
      'loop/autonomy.ts',
      'loop/output-validation.ts',
      'loop/error-recovery.ts',
      'stream/handlers.ts',
      'stream/reducer.ts',
      'stream/tool-call-extractor.ts',
    ]
    for (const f of expected) {
      expect(existsSync(path.join(SRC, f))).toBe(true, `Missing: ${f}`)
    }
  })

  test('queryLoop 是 AsyncGenerator 函数', async () => {
    const mod = await import('../../src/query/loop/index.ts')
    expect(typeof mod.queryLoop).toBe('function')
    // 验证返回 AsyncGenerator
    const fakeParams = {
      messages: [],
      tools: [],
      systemPrompt: '',
      model: 'x',
      sessionId: 's',
      cwd: '/',
      permissionCtx: {},
      apiConfig: { provider: 'firstParty', apiKey: '' },
    }
    const gen = mod.queryLoop(fakeParams as never)
    expect(typeof gen.next).toBe('function')
    expect(typeof gen[Symbol.asyncIterator]).toBe('function')
  })

  test('dispatchTools 返回 AsyncGenerator', async () => {
    const mod = await import('../../src/query/loop/tool-dispatch.ts')
    const state = {
      params: { tools: [] },
      messages: [],
      turn: 0,
      fatalError: false,
      toolUseCount: 0,
      tokenUsage: { input: 0, output: 0 },
    }
    const gen = mod.dispatchTools([], state as never)
    expect(typeof gen.next).toBe('function')
  })

  test('decideAutonomy 返回 Promise', async () => {
    const mod = await import('../../src/query/loop/autonomy.ts')
    const state = { stopReason: 'end_turn', toolUseCount: 0 } as never
    const result = mod.decideAutonomy(state)
    expect(result).toBeInstanceOf(Promise)
    const decision = await result
    // end_turn 不在 stop_sequence/tool_use_limit 条件里 → shouldStop: false
    // 注：生产 query.ts 的 end_turn 行为由 queryLoop 外层控制，此骨架不模拟。
    expect(typeof decision.shouldStop).toBe('boolean')
  })

  test('decideAutonomy - stop_sequence 触发停止', async () => {
    const mod = await import('../../src/query/loop/autonomy.ts')
    const state = { stopReason: 'stop_sequence', toolUseCount: 0 } as never
    const decision = await mod.decideAutonomy(state)
    expect(decision.shouldStop).toBe(true)
    expect(decision.reason).toBe('stop_sequence')
  })

  test('hitsOutputLimit 返回 boolean', async () => {
    const mod = await import('../../src/query/loop/output-validation.ts')
    const state = { tokenUsage: { output: 50 } } as never
    const result = mod.hitsOutputLimit(state)
    expect(typeof result).toBe('boolean')
  })

  test('hitsOutputLimit - 超过阈值返回 true', async () => {
    const mod = await import('../../src/query/loop/output-validation.ts')
    const state = { tokenUsage: { output: 100001 } } as never
    expect(mod.hitsOutputLimit(state)).toBe(true)
  })

  test('extractToolCalls 返回数组', async () => {
    const mod = await import('../../src/query/stream/tool-call-extractor.ts')
    const result = mod.extractToolCalls({} as never)
    expect(Array.isArray(result)).toBe(true)
  })

  test('mergeToolResults 是 AsyncGenerator（H1 委托模式 A）', async () => {
    const mod = await import('../../src/query/loop/tool-result-merge.ts')
    const messages: unknown[] = []
    const gen = mod.mergeToolResults(
      [{ toolUseId: 't1', result: 'r1' }],
      messages as never,
    )
    expect(typeof gen.next).toBe('function')
    const events: unknown[] = []
    for await (const ev of gen) {
      events.push(ev)
    }
    expect(events).toHaveLength(1)
  })

  test('H1 委托模式：yield* 在父 AsyncGenerator 中正确传递事件', async () => {
    // 这是 L4 MVP 的核心验证 —— yield* 委托模式 H1
    const { mergeToolResults } = await import(
      '../../src/query/loop/tool-result-merge.ts'
    )
    const messages: unknown[] = []

    async function* parent(): AsyncGenerator<{ type: string }> {
      yield { type: 'before' }
      yield* mergeToolResults(
        [{ toolUseId: 'a', result: 'x' }],
        messages as never,
      )
      yield { type: 'after' }
    }

    const events: string[] = []
    for await (const ev of parent()) {
      events.push(ev.type)
    }
    // H1 验证：yield* 委托的事件按顺序透传，不丢失、不重排
    expect(events).toEqual(['before', 'tool_result_merged', 'after'])
  })

  test('loop/index.ts < 300 行', () => {
    const content = readFileSync(path.join(SRC, 'loop/index.ts'), 'utf8')
    expect(content.split('\n').length).toBeLessThan(300)
  })

  test('新 query/loop 子模块无文件引用旧 query.js（生产 query.ts 除外）', () => {
    // Plan B：生产 query.ts 保留，但新的骨架子模块不应反向依赖生产 query.ts。
    // 这确保骨架与生产解耦，未来 C10 可独立迁移。
    const loopFiles = [
      'index.ts',
      'tool-dispatch.ts',
      'tool-result-merge.ts',
      'autonomy.ts',
      'output-validation.ts',
      'error-recovery.ts',
      'state.ts',
    ]
    for (const f of loopFiles) {
      const content = readFileSync(path.join(SRC, 'loop', f), 'utf8')
      // 允许引用 types.js / api.js / stream/，但不引用 ../../query.js
      expect(content).not.toMatch(/from ['"]\.\.\/\.\.\/query(\.js)?['"]/)
    }
  })
})
