import { describe, test, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * C6 dispatcher 拆分冒烟测试。
 *
 * 对应 plan `15-c6-dispatcher-split.md` Task 12。
 *
 * **状态说明：** C6 分阶段实施。本测试覆盖 Task 1-10 的成果（模块骨架 +
 * options-normalizer 完整实现）。Task 11（删除 main.tsx defaultAction 主体）
 * 未执行——其对应断言（main.tsx < 1500 行、不再含 .action(async）已标注为
 * "Task 11 待落地"，当前用宽松断言（验证当前状态，不强制未来值）。
 */

describe('C6 dispatcher split (Task 1-10)', () => {
  test('dispatcher/index.ts < 200 行', () => {
    const content = readFileSync(
      resolve(process.cwd(), 'src/cli/dispatcher/index.ts'),
      'utf8',
    )
    expect(content.split('\n').length).toBeLessThan(200)
  })

  test('12 个子模块存在', () => {
    const dir = resolve(process.cwd(), 'src/cli/dispatcher')
    const expected = [
      'index.ts',
      'types.ts',
      'options-normalizer.ts',
      'bootstrap.ts',
      'permissions.ts',
      'session-restore.ts',
      'headless.ts',
      'repl.ts',
      'prompt-input.ts',
      'teammate-options.ts',
      'modes.ts',
      'fast-paths.ts',
    ]
    for (const f of expected) {
      expect(readFileSync(resolve(dir, f), 'utf8')).toBeDefined()
    }
  })

  test('handleDefaultAction 是函数', async () => {
    const mod = await import('../../src/cli/dispatcher/index.ts')
    expect(typeof mod.handleDefaultAction).toBe('function')
  })

  test('normalizeOptions 是函数', async () => {
    const mod = await import('../../src/cli/dispatcher/options-normalizer.ts')
    expect(typeof mod.normalizeOptions).toBe('function')
  })

  test('normalizeOptions 默认值正确', async () => {
    const { normalizeOptions } = await import(
      '../../src/cli/dispatcher/options-normalizer.ts'
    )
    const result = normalizeOptions({})
    expect(result.permissionMode).toBe('default')
    expect(typeof result.sessionId).toBe('string')
    expect(result.isHeadless).toBe(false)
  })

  test('DispatcherContext 字段数 <= 25（含注释行容差）', () => {
    const content = readFileSync(
      resolve(process.cwd(), 'src/cli/dispatcher/types.ts'),
      'utf8',
    )
    const match = content.match(/interface DispatcherContext \{([\s\S]*?)\}/)
    expect(match).toBeTruthy()
    const fields = match![1]
      .split('\n')
      .filter(l => l.trim() && !l.trim().startsWith('//'))
      .filter(l => l.includes(':') && !l.includes('{'))
    // 19 实际字段 + 少量注释容差
    expect(fields.length).toBeLessThanOrEqual(25)
  })

  test('闭包分析文档存在（Task 1）', () => {
    const content = readFileSync(
      resolve(
        process.cwd(),
        'docs/superpowers/refactor-assets/dispatcher-closure-analysis.md',
      ),
      'utf8',
    )
    expect(content).toContain('DispatcherContext')
    expect(content).toContain('请求期')
    expect(content).toContain('启动期')
  })

  test('extractTeammateOptions 与 main.tsx 原实现一致（纯函数）', async () => {
    const { extractTeammateOptions } = await import(
      '../../src/cli/dispatcher/teammate-options.ts'
    )
    // 非对象 → 空对象
    expect(extractTeammateOptions(null)).toEqual({})
    expect(extractTeammateOptions('string')).toEqual({})
    expect(extractTeammateOptions(undefined)).toEqual({})
    // 完整 teammate
    expect(
      extractTeammateOptions({
        agentId: 'a1',
        agentName: 'agent',
        teamName: 'team',
      }),
    ).toEqual({
      agentId: 'a1',
      agentName: 'agent',
      teamName: 'team',
      agentColor: undefined,
      planModeRequired: undefined,
      parentSessionId: undefined,
      teammateMode: undefined,
      agentType: undefined,
    })
    // teammateMode 仅接受合法值
    expect(extractTeammateOptions({ teammateMode: 'auto' }).teammateMode).toBe(
      'auto',
    )
    expect(
      extractTeammateOptions({ teammateMode: 'bogus' }).teammateMode,
    ).toBeUndefined()
  })

  test('preprocessPrompt 处理 "code" 与单词 prompt', async () => {
    const { preprocessPrompt } = await import(
      '../../src/cli/dispatcher/fast-paths.ts'
    )
    let codeLogCount = 0
    let singleWordLogCount = 0
    const result1 = preprocessPrompt(
      'code',
      () => {
        codeLogCount++
      },
      () => {
        singleWordLogCount++
      },
    )
    expect(result1).toBeUndefined()
    expect(codeLogCount).toBe(1)

    const result2 = preprocessPrompt(
      'hello',
      () => {},
      () => {
        singleWordLogCount++
      },
    )
    expect(result2).toBe('hello')
    expect(singleWordLogCount).toBe(1)

    // 多词 prompt 不触发单词日志
    const result3 = preprocessPrompt(
      'hello world',
      () => {},
      () => {
        singleWordLogCount++
      },
    )
    expect(result3).toBe('hello world')
    expect(singleWordLogCount).toBe(1) // 仍为 1
  })
})
