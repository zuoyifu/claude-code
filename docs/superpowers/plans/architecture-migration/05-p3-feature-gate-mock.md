# P3: feature-gate 共享 mock

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 P1 中已经创建的 `tests/mocks/feature-gate.ts` 完善，添加到 `tests/mocks/index.ts` 导出，并写一个端到端验证测试，确保业务测试可以正确 mock feature-gate。

**Architecture:** 共享 mock 模式遵循 CLAUDE.md §Testing/Mock 使用规范——只 mock 有副作用的依赖链（feature-gate 内部依赖 `bun:bundle`，而 `bun:bundle` 必须被 mock）。

**Tech Stack:** bun:test + mock.module。

---

## File Structure

| 文件 | 责任 |
|------|------|
| `tests/mocks/feature-gate.ts` | 修改：P1 已创建，本期完善（补全所有 export 字段） |
| `tests/mocks/index.ts` | 新建：统一 mock 导出入口（可选，方便测试 import） |
| `tests/integration/feature-gate-mock.test.ts` | 新建：端到端验证 mock 工作 |

---

## Task 1: 完善 feature-gate mock

**Files:**
- Modify: `tests/mocks/feature-gate.ts`

- [ ] **Step 1: 读 P1 创建的 mock**

Run:
```bash
cat tests/mocks/feature-gate.ts
```

确认 P1 创建的内容（应该包含 `featureGateMock` 函数 + `setEnabled` 测试辅助）。

- [ ] **Step 2: 完善为完整 mock**

Modify `tests/mocks/feature-gate.ts`（覆盖 P1 版本）:

```ts
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
 */

import { FEATURE_GATED_TOOL_FLAGS, type FeatureGatedToolFlag } from
  '../../src/tools/registry/feature-gated-flags.js'

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
export const featureGateMock = () => ({
  isToolEnabled: (flag: FeatureGatedToolFlag): boolean => state.enabledFlags.has(flag),

  loadFeatureGatedTool: async (flag: FeatureGatedToolFlag): Promise<unknown> => {
    if (!state.enabledFlags.has(flag)) return null
    const custom = state.customLoaders[flag]
    if (custom) return custom()
    return null  // 默认返回 null，测试可按需覆盖
  },

  listEnabledFeatureGatedTools: (): FeatureGatedToolFlag[] =>
    Array.from(state.enabledFlags),

  validateFeatureGateFlags: (knownFlags?: ReadonlySet<string>): void => {
    const effectiveKnown = knownFlags ?? state.knownFlags
    if (!effectiveKnown) return
    for (const flag of FEATURE_GATED_TOOL_FLAGS) {
      if (!effectiveKnown.has(flag)) {
        state.warnCalls.push(flag)
      }
    }
  },

  // —— 测试辅助 API（不参与 mock 实现）——

  /** 一次性设置全部状态。 */
  setState: (next: Partial<Omit<FeatureGateMockState, 'warnCalls'>>) => {
    if (next.enabledFlags) state.enabledFlags = new Set(next.enabledFlags)
    if (next.customLoaders) state.customLoaders = next.customLoaders
    if (next.knownFlags !== undefined) state.knownFlags = next.knownFlags
  },

  /** 启用某个 flag。 */
  enable: (flag: FeatureGatedToolFlag): void => {
    state.enabledFlags.add(flag)
  },

  /** 禁用某个 flag。 */
  disable: (flag: FeatureGatedToolFlag): void => {
    state.enabledFlags.delete(flag)
  },

  /** 注册自定义 loader。 */
  registerLoader: (flag: FeatureGatedToolFlag, loader: () => Promise<unknown>): void => {
    state.customLoaders[flag] = loader
  },

  /** 重置到初始状态——每个 beforeEach 调用。 */
  reset: (): void => {
    state.enabledFlags = new Set()
    state.customLoaders = {}
    state.knownFlags = undefined
    state.warnCalls = []
  },

  /** 获取 warn 调用记录（断言用）。 */
  getWarnCalls: (): string[] => state.warnCalls,
})

/** 类型导出，方便测试 import mock 类型。 */
export type FeatureGateMock = ReturnType<typeof featureGateMock>
```

- [ ] **Step 3: Commit**

```bash
git add tests/mocks/feature-gate.ts
git commit -m "feat: 完善 feature-gate 共享 mock（可重置 + 状态管理）"
```

---

## Task 2: 创建 tests/mocks/index.ts 统一入口（可选）

**Files:**
- Create: `tests/mocks/index.ts`

- [ ] **Step 1: 创建统一入口**

Create `tests/mocks/index.ts`:

```ts
/**
 * 测试 mock 统一入口。
 *
 * 业务测试按需 import：
 *   import { featureGateMock, logMock } from '../../../tests/mocks'
 *
 * 避免测试文件内联 mock 定义（CLAUDE.md §Testing 规范）。
 */
export { featureGateMock, type FeatureGateMock } from './feature-gate.js'
export { logMock } from './log.js'  // 假设已存在
// 后续添加：debugMock, axiosMock 等
```

**注意：** 如果 `tests/mocks/log.ts` 已存在，直接 re-export；如果不存在，注释掉该行并在 Task 3 中跳过对应断言。

- [ ] **Step 2: 跑 tsc 验证**

Run:
```bash
bunx tsc --noEmit tests/mocks/index.ts
```

Expected: 零错误（如果 log.ts 不存在会报错，按 Step 1 注意处理）。

- [ ] **Step 3: Commit**

```bash
git add tests/mocks/index.ts
git commit -m "feat: 添加 tests/mocks 统一导出入口"
```

---

## Task 3: 端到端验证测试

**Files:**
- Create: `tests/integration/feature-gate-mock.test.ts`

- [ ] **Step 1: 写端到端测试**

Create `tests/integration/feature-gate-mock.test.ts`:

```ts
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
    const { isToolEnabled } = await import('../../src/tools/registry/feature-gate.ts')

    featureGateMock.enable('GOAL')
    expect(isToolEnabled('GOAL')).toBe(true)

    featureGateMock.disable('GOAL')
    expect(isToolEnabled('GOAL')).toBe(false)
  })

  test('listEnabledFeatureGatedTools 返回启用集合', async () => {
    mock.module('src/tools/registry/feature-gate.ts', featureGateMock)

    const { listEnabledFeatureGatedTools } = await import('../../src/tools/registry/feature-gate.ts')

    featureGateMock.enable('GOAL')
    featureGateMock.enable('KAIROS')

    const list = listEnabledFeatureGatedTools()
    expect(list).toContain('GOAL')
    expect(list).toContain('KAIROS')
    expect(list.length).toBe(2)
  })

  test('loadFeatureGatedTool 默认返回 null', async () => {
    mock.module('src/tools/registry/feature-gate.ts', featureGateMock)

    const { loadFeatureGatedTool } = await import('../../src/tools/registry/feature-gate.ts')

    featureGateMock.enable('GOAL')
    const result = await loadFeatureGatedTool('GOAL')
    expect(result).toBeNull()
  })

  test('registerLoader 后 loadFeatureGatedTool 返回自定义值', async () => {
    mock.module('src/tools/registry/feature-gate.ts', featureGateMock)

    const { loadFeatureGatedTool } = await import('../../src/tools/registry/feature-gate.ts')

    const fakeTool = { name: 'fake-goal-tool' }
    featureGateMock.enable('GOAL')
    featureGateMock.registerLoader('GOAL', async () => fakeTool)

    const result = await loadFeatureGatedTool('GOAL')
    expect(result).toEqual(fakeTool)
  })

  test('setState 一次性设置多个 flag', async () => {
    mock.module('src/tools/registry/feature-gate.ts', featureGateMock)

    const { isToolEnabled, listEnabledFeatureGatedTools } = await import('../../src/tools/registry/feature-gate.ts')

    featureGateMock.setState({ enabledFlags: new Set(['GOAL', 'KAIROS', 'UDS_INBOX']) })

    expect(isToolEnabled('GOAL')).toBe(true)
    expect(isToolEnabled('KAIROS')).toBe(true)
    expect(isToolEnabled('UDS_INBOX')).toBe(true)
    expect(listEnabledFeatureGatedTools().length).toBe(3)
  })

  test('reset 清空状态', async () => {
    mock.module('src/tools/registry/feature-gate.ts', featureGateMock)

    const { listEnabledFeatureGatedTools } = await import('../../src/tools/registry/feature-gate.ts')

    featureGateMock.enable('GOAL')
    expect(listEnabledFeatureGatedTools().length).toBe(1)

    featureGateMock.reset()
    expect(listEnabledFeatureGatedTools().length).toBe(0)
  })

  test('validateFeatureGateFlags 记录 warn 调用', async () => {
    mock.module('src/tools/registry/feature-gate.ts', featureGateMock)

    const { validateFeatureGateFlags } = await import('../../src/tools/registry/feature-gate.ts')

    // 只给 2 个 knownFlags，应该触发其他 12+ 个 flag 的 warning
    featureGateMock.setState({ knownFlags: new Set(['GOAL', 'KAIROS']) })
    validateFeatureGateFlags()

    const warns = featureGateMock.getWarnCalls()
    expect(warns.length).toBeGreaterThan(10)  // FEATURE_GATED_TOOL_FLAGS.length - 2
  })
})
```

- [ ] **Step 2: 跑测试**

Run:
```bash
bun test tests/integration/feature-gate-mock.test.ts
```

Expected: 7 tests pass。如果失败常见原因：
- mock 路径不对（应该是 `'src/tools/registry/feature-gate.ts'`，注意 `.ts` 扩展名）
- 测试顺序问题（mock.module 全局污染）—— 单文件跑应该 OK，全量跑需要警惕

- [ ] **Step 3: Commit**

```bash
git add tests/integration/feature-gate-mock.test.ts
git commit -m "test: 添加 feature-gate mock 端到端验证测试"
```

---

## Task 4: 跑 precheck 与全量测试

**Files:** 无修改

- [ ] **Step 1: 单独跑相关测试**

Run:
```bash
bun test src/tools/registry/__tests__/feature-gate.test.ts tests/integration/feature-gate-mock.test.ts
```

Expected: 全部 pass（P1 的单测 + P3 的端到端）。

- [ ] **Step 2: 跑全量 precheck**

Run:
```bash
bun run precheck
```

Expected: 零错误。

**注意：** 如果遇到 mock 污染问题（其他测试文件因 feature-gate mock 失败），按 CLAUDE.md §Testing/Mock 使用规范处理——确保 mock 只在需要副作用的链上使用，不在被测模块的上游业务模块上用。

- [ ] **Step 3: 跑 dependency-cruiser**

Run:
```bash
bunx depcruise src --config
```

Expected: warning 与 P0 baseline 一致。

- [ ] **Step 4: Commit**

```bash
git commit --allow-empty -m "chore: P3 完成 - feature-gate mock 端到端验证通过"
```

---

## Risk

| 风险 | 严重度 | 缓解 |
|------|--------|------|
| mock.module 全局污染其他测试 | 高 | reset 在 beforeEach/afterEach；单测 + 端到端分开跑验证；如发现污染，把端到端测试改为独立 process |
| mock 路径在不同测试文件中不一致 | 中 | 统一用 `'src/tools/registry/feature-gate.ts'`（CLAUDE.md 规范：`.ts` 扩展 + `src/*` 别名） |
| FEATURE_GATED_TOOL_FLAGS 改名后 mock 失效 | 低 | mock 直接 import 真实 flags 常量，自动跟随 |
| `tests/mocks/log.ts` 不存在导致 import 失败 | 低 | Task 2 已在 Step 1 处理 |

---

## Workflow Adaptation

- **PR ID:** P3
- **依赖:** P1（feature-gate 模块已创建，路径稳定）
- **被依赖:** C1（C1 内的测试用 feature-gate mock）、C2（业务接入后大量测试需要）、C9/C10（query/engine 测试也用）
- **推荐 maxConcurrency:** 1
- **建议 phases:**
  1. `Complete` — 完善 mock（覆盖 P1 骨架）
  2. `Entrypoint` — 创建 tests/mocks/index.ts
  3. `E2E` — 端到端验证
  4. `Verify` — precheck 全量通过
- **验证 schema:**
  ```js
  {
    type: 'object',
    properties: {
      mockCompleted: { type: 'boolean' },
      e2eTestsPass: { type: 'boolean' },
      precheckPass: { type: 'boolean' },
      mockPollutionCheck: { type: 'boolean' }
    },
    required: ['mockCompleted', 'e2eTestsPass', 'precheckPass']
  }
  ```
- **可并行点:** P3 与 P4 都依赖前置完成，可并行。
- **Plan B 触发条件:** 若 mock 污染无法解决，feature-gate mock 只在 isolated test files 中使用（不放到共享目录）。但会损失后续 C2 接入的便利性。
