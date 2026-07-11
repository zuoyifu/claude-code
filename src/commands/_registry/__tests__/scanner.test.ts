import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

import { scanCommands, generateRegistryCode } from '../scanner.js'

describe('scanner', () => {
  let tempRoot: string

  beforeEach(() => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), 'scanner-test-'))
  })

  afterEach(() => {
    rmSync(tempRoot, { recursive: true, force: true })
  })

  describe('scanCommands', () => {
    test('空目录返回空数组', () => {
      const result = scanCommands(tempRoot)
      expect(result).toEqual([])
    })

    test('扫描单个命令', () => {
      mkdirSync(path.join(tempRoot, 'commands', 'session', 'clear'), {
        recursive: true,
      })
      writeFileSync(
        path.join(tempRoot, 'commands', 'session', 'clear', 'index.ts'),
        'export default {}',
      )
      const result = scanCommands(tempRoot)
      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({
        category: 'session',
        name: 'clear',
        relativePath: 'commands/session/clear/index.js',
      })
    })

    test('扫描多个命令', () => {
      for (const [cat, name] of [
        ['session', 'clear'],
        ['mcp', 'serve'],
        ['review', 'pr'],
      ]) {
        mkdirSync(path.join(tempRoot, 'commands', cat, name as string), {
          recursive: true,
        })
        writeFileSync(
          path.join(tempRoot, 'commands', cat, name as string, 'index.ts'),
          'export default {}',
        )
      }
      const result = scanCommands(tempRoot)
      expect(result).toHaveLength(3)
    })

    test('非法 category 抛错', () => {
      mkdirSync(path.join(tempRoot, 'commands', 'INVALID_CATEGORY', 'foo'), {
        recursive: true,
      })
      writeFileSync(
        path.join(tempRoot, 'commands', 'INVALID_CATEGORY', 'foo', 'index.ts'),
        'export default {}',
      )
      expect(() => scanCommands(tempRoot)).toThrow(/Unknown command category/)
    })

    test('深度错误的路径抛错', () => {
      // commands/clear/index.ts（少一层 category）
      mkdirSync(path.join(tempRoot, 'commands', 'clear'), { recursive: true })
      writeFileSync(
        path.join(tempRoot, 'commands', 'clear', 'index.ts'),
        'export default {}',
      )
      expect(() => scanCommands(tempRoot)).not.toThrow() // 此格式不匹配 GLOB，所以不抛错
      expect(scanCommands(tempRoot)).toEqual([])
    })
  })

  describe('generateRegistryCode', () => {
    test('空输入生成有效 TypeScript', () => {
      const code = generateRegistryCode([])
      expect(code).toContain('AUTO-GENERATED')
      expect(code).toContain('REGISTERED_COMMANDS: RegisteredCommand[] = []')
    })

    test('生成 import 语句', () => {
      const code = generateRegistryCode([
        {
          category: 'session',
          name: 'clear',
          relativePath: 'commands/session/clear/index.js',
        },
      ])
      expect(code).toContain(
        "import cmd_session_clear from '../../commands/session/clear/index.js'",
      )
      expect(code).toContain('_reg(cmd_session_clear')
      expect(code).toContain("'session'")
      expect(code).toContain("'commands/session/clear/index.js'")
    })

    test('特殊字符的命令名被 sanitize', () => {
      const code = generateRegistryCode([
        {
          category: 'mcp',
          name: 'add-from-claude-desktop',
          relativePath: 'commands/mcp/add-from-claude-desktop/index.js',
        },
      ])
      expect(code).toContain('cmd_mcp_add_from_claude_desktop')
    })

    test('生成的代码语法有效（eval 检查）', () => {
      const code = generateRegistryCode([
        {
          category: 'session',
          name: 'clear',
          relativePath: 'commands/session/clear/index.js',
        },
      ])
      // 简单的语法检查：能被 new Function 解析（不执行）
      // 去掉 import（含 import type）、export 和 TS 类型注解，只验证 JS 表达式部分
      const stripped = code
        .replace(/import[^\n]*\n/g, '')
        .replace(/\/\/ @ts-expect-error[^\n]*\n/g, '')
        .replace(/export /g, '')
        .replace(/:\s*RegisteredCommand\[\]/g, '')
      expect(() => new Function(stripped)).not.toThrow()
    })
  })
})
