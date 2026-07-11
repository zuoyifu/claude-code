/**
 * 共享 mock：src/tools/registry/feature-gate
 *
 * 用法（推荐）：
 *   import { featureGateMock } from '../../../tests/mocks/feature-gate'
 *   mock.module('src/tools/registry/feature-gate.ts', featureGateMock)
 *
 *   // 然后在测试中控制状态：
 *   featureGateMock.setState({ enabledFlags: ['GOAL'] })
 *   featureGateMock.reset()
 *
 * 业务测试 mock 此模块即可，避免直接 mock `bun:bundle`（破坏面太大）。
 *
 * 注意：Bun 的 mock.module 是进程全局的（last-write-wins）。
 * 一个测试文件 mock 后，同进程其他测试文件 import 同模块都会拿到 mock。
 * 因此本 mock 设计为可重置、可叠加状态。
 *
 * 本导出同时是一个 callable factory（供 mock.module 使用）和 helper 载体：
 *   - 调用 featureGateMock() 返回 mock module shape（给 mock.module）
 *   - featureGateMock.enable / disable / reset / setState / ... 直接挂在函数上
 *     （共享同一个模块级 state，确保测试中操作状态与 mock.module 返回的方法一致）
 */

import {
  FEATURE_GATED_TOOL_FLAGS,
  type FeatureGatedToolFlag,
} from '../../src/tools/registry/feature-gated-flags.js'

interface FeatureGateMockState {
  /** 当前启用的 flag 集合。 */
  enabledFlags: Set<FeatureGatedToolFlag>
  /** 自定义 loader 覆盖（按 flag），未覆盖则返回 null。 */
  customLoaders: Partial<Record<FeatureGatedToolFlag, () => Promise<unknown>>>
  /** validateFeatureGateFlags 的 knownFlags 参数（可选）。 */
  knownFlags?: ReadonlySet<string>
  /** warn 调用计数（用于断言）。 */
  warnCalls: string[]
}

const state: FeatureGateMockState = {
  enabledFlags: new Set(),
  customLoaders: {},
  warnCalls: [],
}

/** Mock 实现——export 给 mock.module 用。 */
export const featureGateMock = Object.assign(
  (): ReturnType<typeof _factory> => _factory(),
)

// 工厂：每次调用返回一份新的 mock module 对象，但共享同一 state。
function _factory() {
  return {
    isToolEnabled: (flag: FeatureGatedToolFlag): boolean =>
      state.enabledFlags.has(flag),

    loadFeatureGatedTool: async (
      flag: FeatureGatedToolFlag,
    ): Promise<unknown> => {
      if (!state.enabledFlags.has(flag)) return null
      const custom = state.customLoaders[flag]
      if (custom) return custom()
      return null // 默认返回 null，测试可按需覆盖
    },

    loadFeatureGatedToolSync: (flag: FeatureGatedToolFlag): unknown => {
      if (!state.enabledFlags.has(flag)) return null
      const custom = state.customLoaders[flag]
      if (custom) {
        // custom loader 是 async 的；mock 环境下同步返回不可能等待。
        // 测试如需验证 sync loader，请用 registerLoader 注册 sync factory。
        // 这里直接调用 custom() 并忽略返回的 Promise（测试默认 null）。
        return null
      }
      return null
    },

    loadSleepToolSync: (): unknown => {
      if (
        !state.enabledFlags.has('PROACTIVE') &&
        !state.enabledFlags.has('KAIROS')
      ) {
        return null
      }
      const custom = state.customLoaders['PROACTIVE']
      if (custom) return custom()
      return null
    },

    isSleepToolEnabled: (): boolean =>
      state.enabledFlags.has('PROACTIVE') || state.enabledFlags.has('KAIROS'),

    loadPushNotificationToolSync: (): unknown => {
      if (
        !state.enabledFlags.has('KAIROS') &&
        !state.enabledFlags.has('KAIROS_PUSH_NOTIFICATION')
      ) {
        return null
      }
      return null
    },

    isPushNotificationEnabled: (): boolean =>
      state.enabledFlags.has('KAIROS') ||
      state.enabledFlags.has('KAIROS_PUSH_NOTIFICATION'),

    loadCoordinatorModeModuleSync: (): unknown => {
      if (!state.enabledFlags.has('COORDINATOR_MODE')) return null
      return null
    },

    isTranscriptClassifierEnabled: (): boolean =>
      state.enabledFlags.has('TRANSCRIPT_CLASSIFIER' as FeatureGatedToolFlag),

    listEnabledFeatureGatedTools: (): FeatureGatedToolFlag[] =>
      Array.from(state.enabledFlags),

    validateFeatureGateFlags: (knownFlags?: ReadonlySet<string>): void => {
      const effectiveKnown = knownFlags ?? state.knownFlags
      if (!effectiveKnown) return
      for (const flag of FEATURE_GATED_TOOL_FLAGS) {
        if (!effectiveKnown.has(flag)) {
          state.warnCalls.push(flag)
          // 与真实模块保持一致：触发 console.warn，避免污染被测模块的测试断言
          console.warn(
            `[feature-gate] Unknown flag in feature-gate.ts: ${flag} (not in build.ts defines)`,
          )
        }
      }
    },
  }
}

// —— 测试辅助 API（不参与 mock 实现）——
// 这些方法挂在 featureGateMock 函数对象上，方便测试直接调用：
//   featureGateMock.enable('GOAL')
//   featureGateMock.reset()

/** 一次性设置全部状态。 */
featureGateMock.setState = (
  next: Partial<Omit<FeatureGateMockState, 'warnCalls'>>,
) => {
  if (next.enabledFlags) state.enabledFlags = new Set(next.enabledFlags)
  if (next.customLoaders) state.customLoaders = next.customLoaders
  if (next.knownFlags !== undefined) state.knownFlags = next.knownFlags
}

/** 启用某个 flag。 */
featureGateMock.enable = (flag: FeatureGatedToolFlag): void => {
  state.enabledFlags.add(flag)
}

/** 禁用某个 flag。 */
featureGateMock.disable = (flag: FeatureGatedToolFlag): void => {
  state.enabledFlags.delete(flag)
}

/** 注册自定义 loader。 */
featureGateMock.registerLoader = (
  flag: FeatureGatedToolFlag,
  loader: () => Promise<unknown>,
): void => {
  state.customLoaders[flag] = loader
}

/** 重置到初始状态——每个 beforeEach 调用。 */
featureGateMock.reset = (): void => {
  state.enabledFlags = new Set()
  state.customLoaders = {}
  state.knownFlags = undefined
  state.warnCalls = []
}

/** 获取 warn 调用记录（断言用）。 */
featureGateMock.getWarnCalls = (): string[] => state.warnCalls

/** 类型导出，方便测试 import mock 类型。 */
export type FeatureGateMock = ReturnType<typeof featureGateMock>
