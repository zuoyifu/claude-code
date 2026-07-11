import { describe, test, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * C2 feature-gate 边界接入冒烟测试。
 *
 * 验证 v2 spec §3.3（F2 feature() 边界约束）：
 *   1. src/tools/ 下 bun:bundle import 只出现在 registry/feature-gate.ts
 *   2. src/tools/ 下 feature() 调用只在 registry/feature-gate.ts
 *   3. assembler.ts 不直接 import { feature } from 'bun:bundle'
 *   4. feature-gate 暴露完整的 4+ 核心 API + Plan B 新增的 sync loader API
 *
 * 注意（H5 Plan B 触发）：原 plan 中的 "getTools 返回 Promise" 测试已改为
 * "getTools 返回同步值"，因为 C2 触发了 Plan B（保持 getTools 同步）。
 * 详见 plan §Risk 和 commit message。
 */

const ROOT = process.cwd()

/** 递归收集 src/tools/ 下所有 .ts/.tsx 文件（排除 __tests__ 和 .d.ts）。 */
function collectToolFiles(): string[] {
  const { execSync } =
    require('node:child_process') as typeof import('node:child_process')
  const out = execSync(
    "find src/tools -type f \\( -name '*.ts' -o -name '*.tsx' \\) ! -path '*__tests__*' ! -name '*.d.ts'",
    {
      cwd: ROOT,
    },
  )
    .toString()
    .trim()
  return out.split('\n').filter(Boolean)
}

/** 判断一行是否为注释（// 或 * 开头，允许前导空白）。 */
function isCommentLine(line: string): boolean {
  const trimmed = line.trim()
  return (
    trimmed.startsWith('//') ||
    trimmed.startsWith('*') ||
    trimmed.startsWith('/*')
  )
}

// 判断一行是否在块注释中：stripBlockComments 移除所有 /* ... */ 块
function stripBlockComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '')
}

/** 判断文件源码（移除注释后）是否包含给定模式。 */
function hasCodeMatching(source: string, pattern: RegExp): boolean {
  const stripped = stripBlockComments(source)
  const lines = stripped.split('\n')
  return lines.some(line => {
    // 移除行内注释（// ...），但不移除字符串中的 //
    const codePart = line.replace(/\/\/.*$/, '')
    return pattern.test(codePart)
  })
}

describe('C2 feature-gate wiring', () => {
  test('src/tools/ 下 bun:bundle import 只在 registry/feature-gate.ts', () => {
    const files = collectToolFiles()
    const violating: string[] = []
    for (const f of files) {
      const source = readFileSync(path.resolve(ROOT, f), 'utf8')
      if (hasCodeMatching(source, /from\s+['"]bun:bundle['"]/)) {
        violating.push(f)
      }
    }
    expect(violating).toEqual(['src/tools/registry/feature-gate.ts'])
  })

  test('src/tools/ 下 feature() 调用只在 registry/feature-gate.ts', () => {
    const files = collectToolFiles()
    const violating: string[] = []
    for (const f of files) {
      const source = readFileSync(path.resolve(ROOT, f), 'utf8')
      // 匹配 feature('XXX') 或 feature("XXX")，不匹配字符串中的文本
      if (hasCodeMatching(source, /\bfeature\s*\(\s*['"]/)) {
        violating.push(f)
      }
    }
    expect(violating).toEqual(['src/tools/registry/feature-gate.ts'])
  })

  test('assembler.ts 不直接 import bun:bundle', async () => {
    const mod = await import('../../src/tools/registry/assembler.ts')
    expect(mod.getTools).toBeDefined()
    expect(typeof mod.getTools).toBe('function')
    expect(mod.getAllBaseTools).toBeDefined()
    expect(typeof mod.getAllBaseTools).toBe('function')
  })

  test('getTools 返回同步值（Plan B：保持同步）', async () => {
    const { getTools } = await import('../../src/tools/registry/assembler.ts')
    const { getEmptyToolPermissionContext } = await import(
      '../../src/tools/core/index.ts'
    )
    // Plan B：getTools 保持同步。返回值不是 Promise。
    const ctx = getEmptyToolPermissionContext()
    const result = getTools(ctx)
    // 应返回数组（Tools），不是 Promise
    expect(Array.isArray(result)).toBe(true)
    expect(result).not.toBeInstanceOf(Promise)
  })

  test('feature-gate 暴露核心 API（isToolEnabled/loadFeatureGatedTool/listEnabledFeatureGatedTools/validateFeatureGateFlags）', async () => {
    const mod = await import('../../src/tools/registry/feature-gate.ts')
    expect(typeof mod.isToolEnabled).toBe('function')
    expect(typeof mod.loadFeatureGatedTool).toBe('function')
    expect(typeof mod.listEnabledFeatureGatedTools).toBe('function')
    expect(typeof mod.validateFeatureGateFlags).toBe('function')
  })

  test('feature-gate 暴露 Plan B sync loader API', async () => {
    const mod = await import('../../src/tools/registry/feature-gate.ts')
    expect(typeof mod.loadFeatureGatedToolSync).toBe('function')
    expect(typeof mod.loadSleepToolSync).toBe('function')
    expect(typeof mod.loadPushNotificationToolSync).toBe('function')
    expect(typeof mod.loadCoordinatorModeModuleSync).toBe('function')
    expect(typeof mod.isSleepToolEnabled).toBe('function')
    expect(typeof mod.isPushNotificationEnabled).toBe('function')
    expect(typeof mod.isTranscriptClassifierEnabled).toBe('function')
  })

  test('getAllBaseTools 返回 Tool 数组（同步）', () => {
    const { getAllBaseTools } =
      // 同步 import 通过 require 在 Bun 中可行
      require('../../src/tools/registry/assembler.ts')
    const tools = getAllBaseTools()
    expect(Array.isArray(tools)).toBe(true)
    // 至少包含常驻工具
    const names = tools.map((t: { name: string }) => t.name)
    expect(names).toContain('Agent')
    expect(names).toContain('Bash')
    expect(names).toContain('Read')
  })
})
