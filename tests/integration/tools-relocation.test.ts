import { describe, test, expect } from 'bun:test'
import { existsSync } from 'node:fs'
import path from 'node:path'

const SRC = path.resolve(process.cwd(), 'src')

describe('C1 tools relocation', () => {
  test('tools/core/ 存在且含关键文件', () => {
    expect(existsSync(path.join(SRC, 'tools/core/types.ts'))).toBe(true)
    expect(existsSync(path.join(SRC, 'tools/core/build-tool.ts'))).toBe(true)
    expect(existsSync(path.join(SRC, 'tools/core/lookup.ts'))).toBe(true)
    expect(existsSync(path.join(SRC, 'tools/core/index.ts'))).toBe(true)
  })

  test('tools/registry/ 含 feature-gate 与 whitelists', () => {
    expect(existsSync(path.join(SRC, 'tools/registry/feature-gate.ts'))).toBe(
      true,
    )
    expect(existsSync(path.join(SRC, 'tools/registry/whitelists.ts'))).toBe(
      true,
    )
    expect(existsSync(path.join(SRC, 'tools/registry/assembler.ts'))).toBe(true)
  })

  test('tools/execution/ 含 4 个核心执行模块', () => {
    expect(existsSync(path.join(SRC, 'tools/execution/run-tool-use.ts'))).toBe(
      true,
    )
    expect(existsSync(path.join(SRC, 'tools/execution/hooks.ts'))).toBe(true)
    expect(existsSync(path.join(SRC, 'tools/execution/orchestrator.ts'))).toBe(
      true,
    )
    expect(
      existsSync(path.join(SRC, 'tools/execution/streaming-executor.ts')),
    ).toBe(true)
  })

  test('tools/discovery/ 含 tfidf-index 与 prefetch', () => {
    expect(existsSync(path.join(SRC, 'tools/discovery/tfidf-index.ts'))).toBe(
      true,
    )
    expect(existsSync(path.join(SRC, 'tools/discovery/prefetch.ts'))).toBe(true)
    expect(
      existsSync(path.join(SRC, 'tools/discovery/deferred-loader.ts')),
    ).toBe(true)
  })

  test('tools/builtin/index.ts 存在', () => {
    expect(existsSync(path.join(SRC, 'tools/builtin/index.ts'))).toBe(true)
  })

  test('旧文件已删除', () => {
    expect(existsSync(path.join(SRC, 'Tool.ts'))).toBe(false)
    expect(existsSync(path.join(SRC, 'tools.ts'))).toBe(false)
    expect(existsSync(path.join(SRC, 'constants/tools.ts'))).toBe(false)
    expect(existsSync(path.join(SRC, 'services/tools'))).toBe(false)
    expect(existsSync(path.join(SRC, 'services/searchExtraTools'))).toBe(false)
  })

  test('tools/core/ 可被 import', async () => {
    const mod = await import('../../src/tools/core/index.js')
    expect(mod).toBeDefined()
    expect(typeof mod.buildTool).toBe('function')
    expect(typeof mod.findToolByName).toBe('function')
  })

  test('tools/registry/whitelists 含 CORE_TOOLS', async () => {
    const mod = await import('../../src/tools/registry/whitelists.js')
    expect(mod.CORE_TOOLS).toBeDefined()
    expect(Array.from(mod.CORE_TOOLS).length).toBeGreaterThan(20)
  })

  test('feature-gate 暴露 Tool 类型（非 placeholder）', async () => {
    // P1 留的 _Tool placeholder 已在 Task 3 Step 7 替换
    const mod = await import('../../src/tools/registry/feature-gate.js')
    expect(typeof mod.isToolEnabled).toBe('function')
    expect(typeof mod.loadFeatureGatedTool).toBe('function')
  })
})
