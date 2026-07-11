import { describe, test, expect } from 'bun:test'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

// generated.ts imports commands/debug/passes whose `description` getter calls
// getCachedReferrerReward → getOauthAccountInfo. Provide a fake token so the
// auth check short-circuits instead of throwing during module evaluation.
process.env.ANTHROPIC_API_KEY =
  process.env.ANTHROPIC_API_KEY ?? 'test-key-for-regroup-smoke'
process.env.CLAUDE_CODE_OAUTH_TOKEN =
  process.env.CLAUDE_CODE_OAUTH_TOKEN ?? 'test-token-for-regroup-smoke'

const SRC = path.resolve(process.cwd(), 'src/commands')

describe('C3+C8 commands regroup', () => {
  test('17 个分组目录存在', () => {
    const expected = [
      'session',
      'mcp',
      'model',
      'config',
      'memory',
      'skills',
      'plugins',
      'tasks',
      'ui',
      'debug',
      'review',
      'version',
      'files',
      'bridge',
      'daemon',
      '_misc',
      '_shared',
      '_registry',
    ]
    for (const cat of expected) {
      expect(existsSync(path.join(SRC, cat))).toBe(true)
    }
  })

  test('session/ 分组含 clear', () => {
    expect(existsSync(path.join(SRC, 'session/clear/index.ts'))).toBe(true)
  })

  test('session-info 命令位于 ui/ 分组', () => {
    expect(existsSync(path.join(SRC, 'ui/session-info/index.ts'))).toBe(true)
  })

  test('generated.ts 存在且非空', () => {
    const gen = path.join(SRC, '_registry/generated.ts')
    expect(existsSync(gen)).toBe(true)
    const content = readFileSync(gen, 'utf8')
    expect(content).toContain('AUTO-GENERATED')
    expect(content).toContain('REGISTERED_COMMANDS')
  })

  test('generated.ts 含至少 50 个 import（Plan B：跳过命名导出命令）', () => {
    const content = readFileSync(
      path.join(SRC, '_registry/generated.ts'),
      'utf8',
    )
    const importCount = (content.match(/^import cmd_/gm) || []).length
    expect(importCount).toBeGreaterThan(50)
  })

  test('registry.ts getRegisteredCommands 返回数组', async () => {
    const { getRegisteredCommands } = await import(
      '../../src/commands/_registry/registry.ts'
    )
    const cmds = getRegisteredCommands()
    expect(Array.isArray(cmds)).toBe(true)
    expect(cmds.length).toBeGreaterThan(30)
  })

  test('findRegisteredCommand 能找到 clear', async () => {
    const { findRegisteredCommand } = await import(
      '../../src/commands/_registry/registry.ts'
    )
    const cmd = findRegisteredCommand('clear')
    expect(cmd).toBeDefined()
    expect(cmd?.name).toBe('clear')
    expect(cmd?.category).toBe('session')
  })

  test('旧平铺命令目录已清理', () => {
    const entries = readdirSync(SRC, { withFileTypes: true })
    const flatCmds = entries.filter(
      e =>
        e.isDirectory() &&
        !e.name.startsWith('_') &&
        !e.name.startsWith('.') &&
        ![
          'session',
          'mcp',
          'model',
          'config',
          'memory',
          'skills',
          'plugins',
          'tasks',
          'ui',
          'debug',
          'review',
          'version',
          'files',
          'bridge',
          'daemon',
        ].includes(e.name),
    )
    // After migration, only category directories + _* should remain at top level.
    expect(flatCmds.length).toBe(0)
  })

  test('scanner 已不再跳过 Plan B 命令（已重构导出格式）', async () => {
    // All previously-Plan-B commands (reset-limits, extra-usage, context)
    // have been refactored to include static object default exports.
    // They should now appear in generated.ts.
    const content = readFileSync(
      path.join(SRC, '_registry/generated.ts'),
      'utf8',
    )
    expect(content).toMatch(/reset_limits/)
    expect(content).toMatch(/extra_usage/)
  })
})
