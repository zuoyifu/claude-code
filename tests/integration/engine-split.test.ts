import { describe, test, expect } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import path from 'node:path'

const SRC = path.resolve(process.cwd(), 'src/query/engine')

describe('C10.5 engine split (生产 src/QueryEngine.ts 迁移到 query/engine/)', () => {
  test('src/QueryEngine.ts 保留为 re-export 包装层（< 50 行）', () => {
    const wrapperPath = path.resolve(process.cwd(), 'src/QueryEngine.ts')
    expect(existsSync(wrapperPath)).toBe(true)
    const content = readFileSync(wrapperPath, 'utf8')
    // re-export wrapper 应当很短
    expect(content.split('\n').length).toBeLessThan(50)
    // 应当 re-export 自 query/engine/QueryEngine
    expect(content).toMatch(/query\/engine\/QueryEngine/)
  })

  test('engine/ 含 10 个子模块（骨架 + 生产）', () => {
    const expected = [
      'QueryEngine.ts',
      'submit-message.ts',
      'messages-state.ts',
      'file-history.ts',
      'session-persist.ts',
      'attribution.ts',
      'compaction.ts',
      'interrupt.ts',
      'nested-memory.ts',
      'skill-discovery.ts',
    ]
    for (const f of expected) {
      expect(existsSync(path.join(SRC, f))).toBe(true, `Missing: ${f}`)
    }
  })

  test('C10.5 新增生产子模块', () => {
    const expected = [
      'engine-state.ts',
      'system-prompt.ts',
      'process-user-input.ts',
      'loop-result.ts',
      'loop-message-handler.ts',
    ]
    for (const f of expected) {
      expect(existsSync(path.join(SRC, f))).toBe(true, `Missing: ${f}`)
    }
  })

  test('QueryEngine.ts 导出生产 QueryEngine 类 + ask 函数 + SkeletonQueryEngine', async () => {
    const mod = await import('../../src/query/engine/QueryEngine.ts')
    expect(typeof mod.QueryEngine).toBe('function')
    expect(typeof mod.ask).toBe('function')
    expect(typeof mod.SkeletonQueryEngine).toBe('function')
  })

  test('submit-message.ts 导出生产 runSubmitMessageProduction + 骨架 runSubmitMessage', async () => {
    const mod = await import('../../src/query/engine/submit-message.ts')
    expect(typeof mod.runSubmitMessageProduction).toBe('function')
    expect(typeof mod.runSubmitMessage).toBe('function')
  })

  test('engine → loop 单向依赖（query/loop 不 import engine）', () => {
    const output = execSync(
      'grep -rl "from \'.*engine/" src/query/loop/ 2>/dev/null || true',
      { cwd: process.cwd() },
    )
      .toString()
      .trim()
    expect(output).toBe('')
  })

  test('engine → loop 单向依赖（query/api.ts 不 import engine/loop）', () => {
    const output = execSync(
      'grep -rl "from \'.*\\(engine\\|loop\\)/" src/query/api.ts 2>/dev/null || true',
      { cwd: process.cwd() },
    )
      .toString()
      .trim()
    expect(output).toBe('')
  })

  test('SkeletonQueryEngine 类可实例化（H1 委托模式验证）', async () => {
    const mod = await import('../../src/query/engine/QueryEngine.ts')
    const engine = new mod.SkeletonQueryEngine({
      cwd: '/tmp',
      sessionId: 'test',
      model: 'claude-sonnet',
      permissionCtx: {},
    })
    expect(engine).toBeDefined()
    expect(engine.getMessages()).toEqual([])
  })

  test('engine 不 import cli/（dependency-cruiser 规则）', () => {
    const output = execSync(
      'grep -rl "from \'.*cli/" src/query/engine/ 2>/dev/null || true',
      { cwd: process.cwd() },
    )
      .toString()
      .trim()
    expect(output).toBe('')
  })
})
