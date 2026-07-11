import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Command } from '@commander-js/extra-typings'

describe('C5 cli/subcommands integration', () => {
  test('registerAllSubcommands 注册的 program 可正确解析 mcp/auth 子命令', async () => {
    const { registerAllSubcommands } = await import(
      '../../src/cli/subcommands/index.ts'
    )
    const program = new Command()
    registerAllSubcommands(program)
    // 模拟 commander help 解析：确认顶层 subcommand 名集合
    const topNames = program.commands.map(c => c.name())
    expect(topNames).toContain('mcp')
    expect(topNames).toContain('auth')
    expect(topNames).toContain('plugin')
    expect(topNames).toContain('doctor')
    expect(topNames).toContain('update')
    expect(topNames).toContain('agents')
    expect(topNames).toContain('autonomy')
    // mcp 子命令
    const mcp = program.commands.find(c => c.name() === 'mcp')
    const mcpSubs = mcp!.commands.map(c => c.name())
    expect(mcpSubs).toContain('serve')
    expect(mcpSubs).toContain('add')
    expect(mcpSubs).toContain('remove')
    expect(mcpSubs).toContain('list')
  })

  test('main.tsx 不再含 program.command( 链（已搬到 subcommands/）', () => {
    const content = readFileSync(resolve(process.cwd(), 'src/main.tsx'), 'utf8')
    // 仅匹配单行 `program.command(` 形式；多行 `program\n.command(` 的 fast-path
    // subcommand（ssh/open/remote-control 等，Plan B 保留）不在统计范围内。
    const commandCount = (content.match(/program\.command\(/g) || []).length
    expect(commandCount).toBeLessThan(5)
  })

  test('main.tsx 行数显著缩减（< 4700，C4+C5 共删除 ~1000 行）', () => {
    const content = readFileSync(resolve(process.cwd(), 'src/main.tsx'), 'utf8')
    const lineCount = content.split('\n').length
    // C4 前 5640 → C4 后 5147 → C5 后 ~4599（10 subcommand 搬走，~575 行删除）。
    // 阈值 4700 留出余量；Plan B 保留的 subcommand（ssh/open/server 等）仍在 main.tsx。
    expect(lineCount).toBeLessThan(4700)
  })

  test('subcommands/index.ts 静态 import 10 个 define 函数', async () => {
    const mod = await import('../../src/cli/subcommands/index.ts')
    const definers = [
      'defineMcp',
      'defineAuth',
      'definePlugin',
      'defineAgents',
      'defineDoctor',
      'defineUpdate',
      'defineServer',
      'defineAutoMode',
      'defineAutonomy',
      'defineTask',
    ]
    for (const name of definers) {
      expect(typeof mod[name as keyof typeof mod]).toBe('function')
    }
    expect(typeof mod.registerAllSubcommands).toBe('function')
  })
})
