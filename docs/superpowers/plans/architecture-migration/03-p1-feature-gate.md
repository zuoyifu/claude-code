# P1: feature-gate 边界模块

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 创建 `src/tools/registry/feature-gate.ts` 边界模块，作为工具注册级 `feature()` 调用的唯一边界。本期**只新增模块**，不改业务代码——业务接入留到 C2。

**Architecture:** 模块对外暴露 `isToolEnabled` / `loadFeatureGatedTool` / `listEnabledFeatureGatedTools` / `validateFeatureGateFlags` 四个 API。所有 `feature()` 调用集中在此模块内部（受 Bun 编译器约束，调用必须在条件位置）。

**Tech Stack:** TypeScript + Bun + `bun:bundle`。

---

## File Structure

| 文件 | 责任 |
|------|------|
| `src/tools/registry/feature-gate.ts` | 新建：唯一 feature() 边界 |
| `src/tools/registry/__tests__/feature-gate.test.ts` | 新建：单测 |
| `src/tools/registry/feature-gated-flags.ts` | 新建：flag 常量声明（供 build.ts 校验） |

---

## Task 1: 创建 feature-gate 模块骨架

**Files:**
- Create: `src/tools/registry/feature-gate.ts`

- [ ] **Step 1: 写类型与常量声明**

Create `src/tools/registry/feature-gated-flags.ts`:

```ts
/**
 * 所有工具注册级 feature flag 常量。
 * 必须与 scripts/defines.ts 中的 DEFAULT_BUILD_FEATURES 对齐。
 *
 * 此文件存在的目的：
 * 1. IDE 跳转支持
 * 2. P3 mock 引用
 * 3. C2 完成后 validateFeatureGateFlags 校验
 */
export const FEATURE_GATED_TOOL_FLAGS = [
  'AGENT_TRIGGERS_REMOTE',
  'MONITOR_TOOL',
  'KAIROS',
  'KAIROS_GITHUB_WEBHOOKS',
  'GOAL',
  'OVERFLOW_TEST_TOOL',
  'CONTEXT_COLLAPSE',
  'TERMINAL_PANEL',
  'WEB_BROWSER_TOOL',
  'HISTORY_SNIP',
  'EXPERIMENTAL_SKILL_SEARCH',
  'REVIEW_ARTIFACT',
  'UDS_INBOX',
  'WORKFLOW_SCRIPTS',
  'COORDINATOR_MODE',
  'HISTORY_SNIP',
] as const

export type FeatureGatedToolFlag = (typeof FEATURE_GATED_TOOL_FLAGS)[number]
```

**注意：** 这里列出的是从 v2 spec §5.3 推断的 14 个 flag。实施时需对照 `scripts/defines.ts` 的实际定义验证完整性。

- [ ] **Step 2: 写 feature-gate.ts 主体**

Create `src/tools/registry/feature-gate.ts`:

```ts
import { feature } from 'bun:bundle'
import type { Tool } from '../core/types.js'  // 注意：core/types.ts 由 C1 创建；此处先注释
import { FEATURE_GATED_TOOL_FLAGS, type FeatureGatedToolFlag } from './feature-gated-flags.js'

/**
 * 工具注册级 feature gating 边界。
 *
 * 仅本文件内允许调用 feature('XXX')。其他业务代码必须通过本模块的 API。
 *
 * C2 之后，src/tools/ 下任何其他文件出现 `feature(...)` 都会被 dependency-cruiser
 * 的 `feature-bundle-tool-boundary` 规则警告。
 */

// C1 完成前，Tool 类型从 src/Tool.ts 引用
type _Tool = unknown  // placeholder，C1 后改为真实 Tool 类型

const FEATURE_GATED_LOADERS: Record<FeatureGatedToolFlag, () => Promise<{ default: _Tool }>> = {
  AGENT_TRIGGERS_REMOTE: () => import('../../builtin/feature-gated/RemoteTriggerTool.js'),
  MONITOR_TOOL: () => import('../../builtin/feature-gated/MonitorTool.js'),
  KAIROS: () => import('../../builtin/feature-gated/SendUserFileTool.js'),
  KAIROS_GITHUB_WEBHOOKS: () => import('../../builtin/feature-gated/SubscribePRTool.js'),
  GOAL: () => import('../../builtin/feature-gated/GoalTool.js'),
  OVERFLOW_TEST_TOOL: () => import('../../builtin/feature-gated/OverflowTestTool.js'),
  CONTEXT_COLLAPSE: () => import('../../builtin/feature-gated/CtxInspectTool.js'),
  TERMINAL_PANEL: () => import('../../builtin/feature-gated/TerminalCaptureTool.js'),
  WEB_BROWSER_TOOL: () => import('../../builtin/feature-gated/WebBrowserTool.js'),
  HISTORY_SNIP: () => import('../../builtin/feature-gated/SnipTool.js'),
  EXPERIMENTAL_SKILL_SEARCH: () => import('../../builtin/feature-gated/DiscoverSkillsTool.js'),
  REVIEW_ARTIFACT: () => import('../../builtin/feature-gated/ReviewArtifactTool.js'),
  UDS_INBOX: () => import('../../builtin/feature-gated/ListPeersTool.js'),
  WORKFLOW_SCRIPTS: () => import('../../builtin/feature-gated/WorkflowTool.js'),
  COORDINATOR_MODE: () => import('../../builtin/feature-gated/CoordinatorModeModule.js'),
}

/**
 * 检查 flag 是否启用。
 * 唯一一处 feature() 调用边界。
 */
export function isToolEnabled(flag: FeatureGatedToolFlag): boolean {
  // biome-ignore lint: feature() 必须在条件位置（Bun 编译器限制）
  return feature(flag)
}

/**
 * 加载 feature-gated 工具。
 * 返回 null 表示：flag 禁用 / import 失败 / 无 default export。
 * L2 改进：失败时打 warning，不静默。
 */
export async function loadFeatureGatedTool(flag: FeatureGatedToolFlag): Promise<_Tool | null> {
  if (!isToolEnabled(flag)) return null
  try {
    const mod = await FEATURE_GATED_LOADERS[flag]()
    if (!mod.default) {
      console.warn(`[feature-gate] ${flag}: import succeeded but no default export`)
      return null
    }
    return mod.default
  } catch (err) {
    console.warn(`[feature-gate] ${flag}: import failed`, err)
    return null
  }
}

/**
 * 列出当前启用的 feature-gated flag。
 * 在 tools/builtin/index.ts 装配时使用。
 */
export function listEnabledFeatureGatedTools(): FeatureGatedToolFlag[] {
  return FEATURE_GATED_TOOL_FLAGS.filter(isToolEnabled)
}

/**
 * L2 改进：启动期校验所有声明的 flag 在 build.ts 中存在。
 * 在 cli/bootstrap/ 中调用一次。
 *
 * 当前阶段（P1）：仅做 placeholder 检查（flag 必须在 FEATURE_GATED_TOOL_FLAGS 列表中）。
 * P4 完成后：与 build.ts 生成的 flag 列表交叉验证。
 */
export function validateFeatureGateFlags(knownFlags?: ReadonlySet<string>): void {
  for (const flag of FEATURE_GATED_TOOL_FLAGS) {
    if (knownFlags && !knownFlags.has(flag)) {
      console.warn(`[feature-gate] Unknown flag in feature-gate.ts: ${flag} (not in build.ts defines)`)
    }
  }
}
```

- [ ] **Step 3: Commit 骨架**

```bash
git add src/tools/registry/feature-gate.ts src/tools/registry/feature-gated-flags.ts
git commit -m "feat: 添加 tools/registry/feature-gate 边界模块骨架"
```

---

## Task 2: 写单元测试

**Files:**
- Create: `src/tools/registry/__tests__/feature-gate.test.ts`

- [ ] **Step 1: 创建测试目录**

Run:
```bash
mkdir -p src/tools/registry/__tests__
```

- [ ] **Step 2: 写 mock 模块**

Create `tests/mocks/feature-gate.ts`（**先于 P3 创建**，P3 只补完）:

```ts
/**
 * 共享 mock：tools/registry/feature-gate
 * 业务测试 import 此 mock 即可，避免 mock bun:bundle。
 *
 * 用法：
 *   import { featureGateMock } from '../../../tests/mocks/feature-gate'
 *   mock.module('src/tools/registry/feature-gate.ts', featureGateMock)
 *
 *   // 然后在测试中
 *   featureGateMock.setEnabled('GOAL', true)
 */
export const featureGateMock = () => {
  const enabled = new Set<string>()
  return {
    isToolEnabled: (flag: string) => enabled.has(flag),
    loadFeatureGatedTool: async (flag: string) => null,  // 测试中按需覆盖
    listEnabledFeatureGatedTools: () => Array.from(enabled) as any,
    validateFeatureGateFlags: () => {},
    // 测试辅助
    setEnabled: (flag: string, on: boolean) => {
      if (on) enabled.add(flag)
      else enabled.delete(flag)
    },
    reset: () => enabled.clear(),
  }
}
```

- [ ] **Step 3: 写 feature-gate 单测**

Create `src/tools/registry/__tests__/feature-gate.test.ts`:

```ts
import { describe, test, expect, mock, beforeEach } from 'bun:test'

// mock bun:bundle 的 feature 函数
const featureMock = mock((flag: string) => enabled.has(flag))
const enabled = new Set<string>()
mock.module('bun:bundle', () => ({
  feature: featureMock,
}))

// 在 mock 之后 import
const { isToolEnabled, validateFeatureGateFlags, FEATURE_GATED_TOOL_FLAGS } = await import('../feature-gate-flags.js')
const { listEnabledFeatureGatedTools } = await import('../feature-gate.js')

describe('feature-gate-flags', () => {
  beforeEach(() => {
    enabled.clear()
    featureMock.mockClear()
  })

  test('FEATURE_GATED_TOOL_FLAGS 至少 14 个 flag', () => {
    expect(FEATURE_GATED_TOOL_FLAGS.length).toBeGreaterThanOrEqual(14)
  })

  test('flag 名全大写 + 下划线', () => {
    for (const flag of FEATURE_GATED_TOOL_FLAGS) {
      expect(flag).toMatch(/^[A-Z][A-Z0-9_]*$/)
    }
  })

  test('isToolEnabled 反映 feature() 返回值', () => {
    enabled.add('GOAL')
    expect(featureMock).toHaveBeenCalledTimes(0)
    const result = isToolEnabled('GOAL' as any)
    expect(result).toBe(true)
    expect(featureMock).toHaveBeenCalledTimes(1)
  })

  test('listEnabledFeatureGatedTools 过滤未启用的', () => {
    enabled.add('GOAL')
    enabled.add('KAIROS')
    const list = listEnabledFeatureGatedTools()
    expect(list).toContain('GOAL')
    expect(list).toContain('KAIROS')
    expect(list.length).toBe(2)
  })

  test('validateFeatureGateFlags - 无 knownFlags 时不警告', () => {
    const warnSpy = mock.spyOn(console, 'warn')
    validateFeatureGateFlags()
    expect(warnSpy).not.toHaveBeenCalled()
  })

  test('validateFeatureGateFlags - 有 knownFlags 时校验', () => {
    const warnSpy = mock.spyOn(console, 'warn')
    validateFeatureGateFlags(new Set(['GOAL', 'KAIROS']))  // 缺其他 12 个
    // 至少触发一条 warning
    expect(warnSpy).toHaveBeenCalled()
  })
})
```

- [ ] **Step 4: 跑测试**

Run:
```bash
bun test src/tools/registry/__tests__/feature-gate.test.ts
```

Expected: 6 tests pass。如果失败，根据错误调整（常见：`bun:bundle` mock 路径不对）。

- [ ] **Step 5: Commit**

```bash
git add src/tools/registry/__tests__/feature-gate.test.ts tests/mocks/feature-gate.ts
git commit -m "test: 添加 feature-gate 边界模块单测与共享 mock"
```

---

## Task 3: 跑 precheck 验证全局无回归

**Files:** 无修改

- [ ] **Step 1: 跑 precheck**

Run:
```bash
bun run precheck
```

Expected: 零错误。如果 typecheck 报错（常见：`_Tool` placeholder 类型不匹配），调整 feature-gate.ts 让它对 `core/types.js` 做 type-only import（C1 完成前用 `src/Tool.ts`）。

- [ ] **Step 2: 跑 dependency-cruiser**

Run:
```bash
bunx depcruise src --config
```

Expected: 新增的 `src/tools/registry/feature-gate.ts` 不触发 `feature-bundle-tool-boundary` 规则（因为它的 path 匹配 `(?!registry/feature-gate)` 的负向断言，被排除）。其他 warning 与 P0 baseline 一致。

- [ ] **Step 3: Commit**

```bash
git commit --allow-empty -m "chore: P1 完成 - feature-gate 边界模块与单测通过"
```

---

## Risk

| 风险 | 严重度 | 缓解 |
|------|--------|------|
| `_Tool` placeholder 类型在 C1 后忘改 | 中 | 加 TODO 注释，C1 Task 1 显式 checklist "把 `_Tool` 改为 Tool 真实类型" |
| `bun:bundle` mock 在测试中不生效 | 高 | 用 `mock.module('bun:bundle', ...)` 而非 path-based mock；参考既有 `tests/mocks/bun-bundle.ts`（如有） |
| FEATURE_GATED_TOOL_FLAGS 与 build.ts 实际 flag 不一致 | 中 | P4 实施时用 `validateFeatureGateFlags` 交叉验证 |
| 业务代码本期未接入，C2 接入时发现 API 不合适 | 低 | API 已尽量简单；C2 接入遇到问题再回 P1 调整 |

---

## Workflow Adaptation

- **PR ID:** P1
- **依赖:** P0（dependency-cruiser 配置完成，验证 feature-bundle-tool-boundary 规则）
- **被依赖:** P3（feature-gate mock 依赖 P1 的 module 路径）、C1（搬移时引用本模块）、C2（业务接入）
- **推荐 maxConcurrency:** 1（P1 内部串行）
- **建议 phases:**
  1. `Create` — 创建 feature-gate.ts 与 feature-gated-flags.ts
  2. `Mock` — 创建 tests/mocks/feature-gate.ts
  3. `Test` — 写单测
  4. `Verify` — precheck + depcruise
- **验证 schema:**
  ```js
  {
    type: 'object',
    properties: {
      moduleCreated: { type: 'boolean' },
      unitTestsPass: { type: 'boolean' },
      precheckPass: { type: 'boolean' },
      featureGateRuleNotTriggered: { type: 'boolean' }
    },
    required: ['moduleCreated', 'unitTestsPass', 'precheckPass']
  }
  ```
- **可并行点:** P1 可与 P2 并行（都依赖 P0 但互相独立）。
- **Plan B 触发条件:** 若 `bun:bundle` 在测试环境完全无法 mock，P1 暂时跳过单测，仅创建模块。后续 C2 接入时一并解决 mock 问题。
