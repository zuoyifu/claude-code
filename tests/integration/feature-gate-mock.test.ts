import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test'
import { featureGateMock } from '../mocks/feature-gate.js'

/**
 * 端到端验证 feature-gate mock 在业务测试场景下正确工作。
 *
 * 验证：
 * 1. mock.module 注入后，业务代码 import feature-gate 拿到 mock
 * 2. 状态管理（enable/disable/reset）生效
 * 3. 自定义 loader 注册工作
 * 4. warn 调用被记录
 */

describe('feature-gate mock 端到端', () => {
  beforeEach(() => {
    featureGateMock.reset()
  })

  afterEach(() => {
    featureGateMock.reset()
  })

  test('mock.module 注入后 isToolEnabled 返回 mock 值', async () => {
    mock.module('src/tools/registry/feature-gate.ts', featureGateMock)

    // 动态 import（在 mock 之后）
    const { isToolEnabled } = await import(
      '../../src/tools/registry/feature-gate.ts'
    )

    featureGateMock.enable('GOAL')
    expect(isToolEnabled('GOAL')).toBe(true)

    featureGateMock.disable('GOAL')
    expect(isToolEnabled('GOAL')).toBe(false)
  })

  test('listEnabledFeatureGatedTools 返回启用集合', async () => {
    mock.module('src/tools/registry/feature-gate.ts', featureGateMock)

    const { listEnabledFeatureGatedTools } = await import(
      '../../src/tools/registry/feature-gate.ts'
    )

    featureGateMock.enable('GOAL')
    featureGateMock.enable('KAIROS')

    const list = listEnabledFeatureGatedTools()
    expect(list).toContain('GOAL')
    expect(list).toContain('KAIROS')
    expect(list.length).toBe(2)
  })

  test('loadFeatureGatedTool 默认返回 null', async () => {
    mock.module('src/tools/registry/feature-gate.ts', featureGateMock)

    const { loadFeatureGatedTool } = await import(
      '../../src/tools/registry/feature-gate.ts'
    )

    featureGateMock.enable('GOAL')
    const result = await loadFeatureGatedTool('GOAL')
    expect(result).toBeNull()
  })

  test('registerLoader 后 loadFeatureGatedTool 返回自定义值', async () => {
    mock.module('src/tools/registry/feature-gate.ts', featureGateMock)

    const { loadFeatureGatedTool } = await import(
      '../../src/tools/registry/feature-gate.ts'
    )

    const fakeTool = { name: 'fake-goal-tool' }
    featureGateMock.enable('GOAL')
    featureGateMock.registerLoader('GOAL', async () => fakeTool)

    const result = await loadFeatureGatedTool('GOAL')
    expect(result).toEqual(fakeTool)
  })

  test('setState 一次性设置多个 flag', async () => {
    mock.module('src/tools/registry/feature-gate.ts', featureGateMock)

    const { isToolEnabled, listEnabledFeatureGatedTools } = await import(
      '../../src/tools/registry/feature-gate.ts'
    )

    featureGateMock.setState({
      enabledFlags: new Set(['GOAL', 'KAIROS', 'UDS_INBOX']),
    })

    expect(isToolEnabled('GOAL')).toBe(true)
    expect(isToolEnabled('KAIROS')).toBe(true)
    expect(isToolEnabled('UDS_INBOX')).toBe(true)
    expect(listEnabledFeatureGatedTools().length).toBe(3)
  })

  test('reset 清空状态', async () => {
    mock.module('src/tools/registry/feature-gate.ts', featureGateMock)

    const { listEnabledFeatureGatedTools } = await import(
      '../../src/tools/registry/feature-gate.ts'
    )

    featureGateMock.enable('GOAL')
    expect(listEnabledFeatureGatedTools().length).toBe(1)

    featureGateMock.reset()
    expect(listEnabledFeatureGatedTools().length).toBe(0)
  })

  test('validateFeatureGateFlags 记录 warn 调用', async () => {
    mock.module('src/tools/registry/feature-gate.ts', featureGateMock)

    const { validateFeatureGateFlags } = await import(
      '../../src/tools/registry/feature-gate.ts'
    )

    // 只给 2 个 knownFlags，应该触发其他 12+ 个 flag 的 warning
    featureGateMock.setState({ knownFlags: new Set(['GOAL', 'KAIROS']) })
    validateFeatureGateFlags()

    const warns = featureGateMock.getWarnCalls()
    expect(warns.length).toBeGreaterThan(10) // FEATURE_GATED_TOOL_FLAGS.length - 2
  })
})
