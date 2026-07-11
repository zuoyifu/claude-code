import { describe, test, expect, beforeEach, afterEach } from 'bun:test'

// 注意：bun:bundle 的 feature() 是编译时宏，无法在运行时通过 mock.module 替换。
// 因此本测试不 mock feature()，而是验证：
// 1. 数据结构不变量（flag 命名、数量）
// 2. API 形状（返回值类型、null 安全）
// 3. validateFeatureGateFlags 的 warning 行为（通过 monkey-patch console.warn）
//
// feature() 的真实启用行为由 bun --feature 标志控制，本测试默认全部禁用。
// Plan B（plan §Risk）：若 bun:bundle 无法 mock，仅验证 API 形状。

const { isToolEnabled, validateFeatureGateFlags } = await import(
  '../feature-gate.js'
)
const { FEATURE_GATED_TOOL_FLAGS } = await import('../feature-gated-flags.js')
const { listEnabledFeatureGatedTools } = await import('../feature-gate.js')

describe('feature-gate-flags', () => {
  let warnSpy: typeof console.warn
  let warnCalls: string[]

  beforeEach(() => {
    warnCalls = []
    warnSpy = console.warn
    console.warn = (...args: unknown[]) => {
      warnCalls.push(args.map(String).join(' '))
    }
  })

  afterEach(() => {
    console.warn = warnSpy
  })

  test('FEATURE_GATED_TOOL_FLAGS 至少 14 个 flag', () => {
    // 注意：HISTORY_SNIP 在 plan 列表里重复了 2 次，去重后唯一 flag 数 >= 14
    const unique = new Set(FEATURE_GATED_TOOL_FLAGS)
    expect(unique.size).toBeGreaterThanOrEqual(14)
  })

  test('flag 名全大写 + 下划线', () => {
    for (const flag of FEATURE_GATED_TOOL_FLAGS) {
      expect(flag).toMatch(/^[A-Z][A-Z0-9_]*$/)
    }
  })

  test('isToolEnabled 对任何已知 flag 返回 boolean（默认禁用）', () => {
    for (const flag of FEATURE_GATED_TOOL_FLAGS) {
      const result = isToolEnabled(flag)
      expect(typeof result).toBe('boolean')
    }
  })

  test('listEnabledFeatureGatedTools 返回数组（默认禁用时为空）', () => {
    const list = listEnabledFeatureGatedTools()
    expect(Array.isArray(list)).toBe(true)
    // 默认全部禁用（无 bun --feature 标志）
    expect(list.length).toBe(0)
  })

  test('validateFeatureGateFlags - 无 knownFlags 时不警告', () => {
    validateFeatureGateFlags()
    expect(warnCalls.length).toBe(0)
  })

  test('validateFeatureGateFlags - 有 knownFlags 时校验', () => {
    validateFeatureGateFlags(new Set(['GOAL', 'KAIROS'])) // 缺其他 12 个
    // 至少触发一条 warning
    expect(warnCalls.length).toBeGreaterThan(0)
  })
})
