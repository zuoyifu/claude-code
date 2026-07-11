# C2: feature() 边界接入（工具注册级 ~15 处）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `tools/registry/`、`tools/builtin/` 内所有 `feature()` 调用替换为 `feature-gate.ts` 边界 API。完成后 `src/tools/` 下除 `registry/feature-gate.ts` 外无任何 `import { feature } from 'bun:bundle'`（F2 限定 scope）。同步处理 H5：`getTools()` 同步→异步的调用方修改（REPL.tsx、QueryEngine.ts）。

**Architecture:** P1 已建 `feature-gate.ts` 边界模块（`isToolEnabled` / `loadFeatureGatedTool` / `listEnabledFeatureGatedTools`）。C1 已把 `tools.ts` 搬到 `registry/assembler.ts`。C2 把 `assembler.ts` 中的 `feature('XXX') ? require(...) : null` 三元表达式全部替换为边界调用。

**Tech Stack:** TypeScript + Bun + Biome + dependency-cruiser。

---

## File Structure

| 文件 | 责任 |
|------|------|
| `src/tools/registry/assembler.ts` | 修改：删除所有 `feature()` + `require()`，委托 feature-gate |
| `src/tools/registry/feature-gate.ts` | 修改：补全 FEATURE_GATED_LOADERS 映射（C1 后的真实路径） |
| `src/tools/builtin/index.ts` | 修改：用 feature-gate 加载 feature-gated 工具 |
| `src/screens/REPL.tsx` | 修改（H5）：`getTools()` 调用加 `await`（如 1-3 处） |
| `src/QueryEngine.ts` | 修改（H5）：`getTools()` 调用加 `await`（C10 会重写，此处先兼容） |
| `tests/integration/feature-gate-wiring.test.ts` | 新建：边界接入冒烟测试 |

---

## Task 1: 补全 feature-gate.ts 的 LOADERS 映射

**Files:**
- Modify: `src/tools/registry/feature-gate.ts`

- [ ] **Step 1: 列出 C1 后 assembler.ts 中所有 feature() 调用**

Use Grep tool:
- Pattern: `feature\(['"]`
- Path: `/Users/konghayao/code/ai/claude-code/src/tools/registry/assembler.ts`
- Output mode: `content`, `-n: true`

记录所有 flag 名：`AGENT_TRIGGERS_REMOTE`、`MONITOR_TOOL`、`KAIROS`、`KAIROS_PUSH_NOTIFICATION`、`KAIROS_GITHUB_WEBHOOKS`、`PROACTIVE`、`COORDINATOR_MODE` 等。

- [ ] **Step 2: 修正 feature-gate.ts 的 FEATURE_GATED_LOADERS**

C1 后路径已稳定。更新 `src/tools/registry/feature-gate.ts`：

```ts
import { feature } from 'bun:bundle'
import type { Tool } from '../core/types.js'

/**
 * 工具注册级 feature gating 边界。
 * 仅本文件允许 import 'bun:bundle'。
 */
const FEATURE_GATED_LOADERS = {
  AGENT_TRIGGERS_REMOTE: () =>
    import('@claude-code-best/builtin-tools/tools/RemoteTriggerTool/RemoteTriggerTool.js'),
  MONITOR_TOOL: () =>
    import('@claude-code-best/builtin-tools/tools/MonitorTool/MonitorTool.js'),
  KAIROS: () =>
    import('@claude-code-best/builtin-tools/tools/SendUserFileTool/SendUserFileTool.js'),
  KAIROS_PUSH_NOTIFICATION: () =>
    import('@claude-code-best/builtin-tools/tools/PushNotificationTool/PushNotificationTool.js'),
  KAIROS_GITHUB_WEBHOOKS: () =>
    import('@claude-code-best/builtin-tools/tools/SubscribePRTool/SubscribePRTool.js'),
  PROACTIVE: () =>
    import('@claude-code-best/builtin-tools/tools/SleepTool/SleepTool.js'),
  COORDINATOR_MODE: () =>
    import('@claude-code-best/builtin-tools/tools/CoordinatorMode/CoordinatorMode.js'),
  GOAL: () =>
    import('@claude-code-best/builtin-tools/tools/GoalTool/GoalTool.js'),
  OVERFLOW_TEST_TOOL: () =>
    import('@claude-code-best/builtin-tools/tools/OverflowTestTool/OverflowTestTool.js'),
  CONTEXT_COLLAPSE: () =>
    import('@claude-code-best/builtin-tools/tools/CtxInspectTool/CtxInspectTool.js'),
  TERMINAL_PANEL: () =>
    import('@claude-code-best/builtin-tools/tools/TerminalCaptureTool/TerminalCaptureTool.js'),
  WEB_BROWSER_TOOL: () =>
    import('@claude-code-best/builtin-tools/tools/WebBrowserTool/WebBrowserTool.js'),
  HISTORY_SNIP: () =>
    import('@claude-code-best/builtin-tools/tools/SnipTool/SnipTool.js'),
  EXPERIMENTAL_SKILL_SEARCH: () =>
    import('@claude-code-best/builtin-tools/tools/DiscoverSkillsTool/DiscoverSkillsTool.js'),
  REVIEW_ARTIFACT: () =>
    import('@claude-code-best/builtin-tools/tools/ReviewArtifactTool/ReviewArtifactTool.js'),
  UDS_INBOX: () =>
    import('@claude-code-best/builtin-tools/tools/ListPeersTool/ListPeersTool.js'),
  WORKFLOW_SCRIPTS: () =>
    import('@claude-code-best/workflow-engine'),
} as const satisfies Record<string, () => Promise<{ default: Tool } | { WorkflowTool: Tool }>>

export type FeatureGatedToolFlag = keyof typeof FEATURE_GATED_LOADERS

export function isToolEnabled(flag: FeatureGatedToolFlag): boolean {
  return feature(flag)
}

export async function loadFeatureGatedTool(
  flag: FeatureGatedToolFlag,
): Promise<Tool | null> {
  if (!isToolEnabled(flag)) return null
  try {
    const mod = await FEATURE_GATED_LOADERS[flag]()
    const tool = (mod as { default?: Tool }).default ?? (mod as Record<string, Tool>).WorkflowTool
    if (!tool) {
      console.warn(`[feature-gate] ${flag}: import succeeded but no export`)
      return null
    }
    return tool
  } catch (err) {
    console.warn(`[feature-gate] ${flag}: import failed`, err)
    return null
  }
}

export function listEnabledFeatureGatedTools(): FeatureGatedToolFlag[] {
  return Object.keys(FEATURE_GATED_LOADERS) as FeatureGatedToolFlag[]
    .filter(isToolEnabled)
}

export function validateFeatureGateFlags(knownFlags?: ReadonlySet<string>): void {
  for (const flag of Object.keys(FEATURE_GATED_LOADERS)) {
    if (knownFlags && !knownFlags.has(flag)) {
      console.warn(`[feature-gate] Unknown flag: ${flag} (not in build.ts defines)`)
    }
  }
}
```

**注意：** 部分模块（如 workflow-engine）的导出名不是 `default`，需要用 `??` fallback。每个 loader 的真实 export 名需要在 Step 3 验证。

- [ ] **Step 3: 验证每个 loader 路径可达**

Run:
```bash
for f in RemoteTriggerTool/MonitorTool/SendUserFileTool/PushNotificationTool/SubscribePRTool/SleepTool; do
  ls packages/builtin-tools/src/tools/$f/*.ts 2>&1 | head -1
done
```

Expected: 每个工具目录有主文件。如有路径不符（例如工具已移位），修正 loader。

- [ ] **Step 4: 跑 typecheck**

Run:
```bash
bunx tsc --noEmit src/tools/registry/feature-gate.ts 2>&1 | head -20
```

Expected: 零错误。

- [ ] **Step 5: Commit**

```bash
git add src/tools/registry/feature-gate.ts
git commit -m "refactor: C2 - 补全 feature-gate LOADERS 映射（含所有工具注册级 flag）"
```

---

## Task 2: 重写 assembler.ts —— 删除所有 feature() 调用

**Files:**
- Modify: `src/tools/registry/assembler.ts`

- [ ] **Step 1: 列出 assembler.ts 中所有 feature() / require()**

Use Grep tool:
- Pattern: `feature\(|require\(`
- Path: `/Users/konghayao/code/ai/claude-code/src/tools/registry/assembler.ts`
- Output mode: `content`, `-n: true`

Expected: 约 10-15 处。记录每处行号与对应的工具变量名。

- [ ] **Step 2: 重写 assembler.ts**

把所有 `feature('XXX') ? require(...) : null` 块删除，改为在装配阶段统一委托 `feature-gate`：

```ts
// src/tools/registry/assembler.ts（重构后）
import { toolMatchesName, type Tool, type Tools } from '../core/index.js'
import { AgentTool } from '@claude-code-best/builtin-tools/tools/AgentTool/AgentTool.js'
import { BashTool } from '@claude-code-best/builtin-tools/tools/BashTool/BashTool.js'
import { FileEditTool } from '@claude-code-best/builtin-tools/tools/FileEditTool/FileEditTool.js'
import { FileReadTool } from '@claude-code-best/builtin-tools/tools/FileReadTool/FileReadTool.js'
import { FileWriteTool } from '@claude-code-best/builtin-tools/tools/FileWriteTool/FileWriteTool.js'
import { GlobTool } from '@claude-code-best/builtin-tools/tools/GlobTool/GlobTool.js'
// ... 所有常驻工具静态导入
import { listEnabledFeatureGatedTools, loadFeatureGatedTool } from './feature-gate.js'

const ALWAYS_ON_TOOLS: Tool[] = [
  AgentTool,
  BashTool,
  FileEditTool,
  FileReadTool,
  FileWriteTool,
  GlobTool,
  // ... 全部常驻（原 tools.ts 行 3-90 的静态导入列表）
]

let memoizedBase: Tool[] | null = null

export async function getAllBaseTools(): Promise<Tool[]> {
  if (memoizedBase) return memoizedBase
  const tools = [...ALWAYS_ON_TOOLS]

  // 加载 feature-gated 工具（委托边界）
  for (const flag of listEnabledFeatureGatedTools()) {
    const tool = await loadFeatureGatedTool(flag)
    if (tool) tools.push(tool)
  }

  memoizedBase = tools
  return tools
}

export async function getTools(ctx: ToolPermissionContext): Promise<Tool[]> {
  const base = await getAllBaseTools()
  const mcp = await loadMcpTools(ctx)
  return filterToolsByDenyRules([...base, ...mcp], ctx.denyRules)
}

export async function assembleToolPool(
  ctx: ToolPermissionContext,
  preset: string,
): Promise<Tool[]> {
  const all = await getTools(ctx)
  return getToolsForPreset(all, preset)
}

// 保留向后兼容的同步函数（如某些地方仍用）—— 标注 @deprecated
export function toolMatchesNameExport(tool: { name: string }, name: string): boolean {
  return toolMatchesName(tool, name)
}
```

**关键变化：**
- `getTools` 从同步变 **async**（H5）
- 所有 `feature() + require()` 三元表达式删除
- TeamCreate/SendMessage 等循环依赖工具用 `loadTeamCreateTool` 异步加载（C1 已建）

- [ ] **Step 3: 跑 typecheck（预期 H5 错误）**

Run:
```bash
bunx tsc --noEmit 2>&1 | grep -E 'REPL\.tsx|QueryEngine\.ts' | head -10
```

Expected: 报 `await is required for getTools()` 之类的错误，指向 `REPL.tsx` 和 `QueryEngine.ts`。Task 3 处理。

- [ ] **Step 4: Commit**

```bash
git add src/tools/registry/assembler.ts
git commit -m "refactor: C2 - 删除 assembler.ts 所有 feature() 调用，委托 feature-gate 边界"
```

---

## Task 3: 修复 H5 —— getTools async 化的调用方

**Files:**
- Modify: `src/screens/REPL.tsx`、`src/QueryEngine.ts`

- [ ] **Step 1: 定位 REPL.tsx 中的 getTools 调用**

Use Grep tool:
- Pattern: `getTools\(|assembleToolPool\(|getAllBaseTools\(`
- Path: `/Users/konghayao/code/ai/claude-code/src/screens/REPL.tsx`
- Output mode: `content`, `-n: true`, `-C: 2`

Expected: 1-3 处调用。

- [ ] **Step 2: 修改 REPL.tsx 中的调用**

REPL.tsx 中 `getTools()` 通常在 useEffect 或 useCallback 内。修改为 `await`：

例如原代码：
```tsx
const tools = getTools(ctx)
```
改为：
```tsx
const tools = await getTools(ctx)
```

如果调用点在非 async 函数中，需把外层函数改为 async 或用 `.then()`：
```tsx
getTools(ctx).then(tools => {
  // 原逻辑
})
```

- [ ] **Step 3: 修改 QueryEngine.ts 中的调用**

Use Grep tool 同样模式在 `src/QueryEngine.ts` 查找。

`QueryEngine.ts` 通常在 `submitMessage` 内调用 `getTools`——该函数已是 `async function*`，直接加 `await`：

```ts
// 原：
const tools = getTools(this.permissionCtx)
// 改：
const tools = await getTools(this.permissionCtx)
```

- [ ] **Step 4: 跑 typecheck**

Run:
```bash
bunx tsc --noEmit 2>&1 | head -20
```

Expected: 零错误。如果有 "Promise<Tool[]> 不能赋给 Tool[]" 类错误，漏改某处，继续修正。

- [ ] **Step 5: Commit**

```bash
git add src/screens/REPL.tsx src/QueryEngine.ts
git commit -m "fix: C2 - H5 修复 getTools async 化的调用方（REPL.tsx + QueryEngine.ts）"
```

---

## Task 4: 验证 tools/ 下 feature() 只在边界模块

**Files:** 无修改

- [ ] **Step 1: Grep 验证**

Use Grep tool:
- Pattern: `from 'bun:bundle'`
- Path: `/Users/konghayao/code/ai/claude-code/src/tools`
- Output mode: `files_with_matches`

Expected: 只返回 `src/tools/registry/feature-gate.ts` 一个文件。

- [ ] **Step 2: Grep feature() 调用**

Use Grep tool:
- Pattern: `feature\(['"]`
- Path: `/Users/konghayao/code/ai/claude-code/src/tools`
- Output mode: `files_with_matches`

Expected: 只返回 `src/tools/registry/feature-gate.ts`。

- [ ] **Step 3: 跑 dependency-cruiser 验证**

Run:
```bash
bunx depcruise src/tools --config 2>&1 | grep 'feature-bundle-tool-boundary' | head -5
```

Expected: 零 warning（规则匹配 `(?!registry/feature-gate)` 负向断言，边界模块被排除）。

- [ ] **Step 4: Commit（标记验证完成）**

```bash
git commit --allow-empty -m "chore: C2 验证 - tools/ 下 feature() 调用已边界化"
```

---

## Task 5: 写冒烟集成测试

**Files:**
- Create: `tests/integration/feature-gate-wiring.test.ts`

- [ ] **Step 1: 写测试**

Create `tests/integration/feature-gate-wiring.test.ts`:

```ts
import { describe, test, expect } from 'bun:test'
import { execSync } from 'node:child_process'

describe('C2 feature-gate wiring', () => {
  test('tools/ 下 bun:bundle 只在 feature-gate.ts', () => {
    const output = execSync(
      "grep -rl \"from 'bun:bundle'\" src/tools/ 2>/dev/null || true",
      { cwd: process.cwd() },
    ).toString().trim()
    const files = output.split('\n').filter(Boolean)
    expect(files).toEqual(['src/tools/registry/feature-gate.ts'])
  })

  test('tools/ 下 feature() 调用只在 feature-gate.ts', () => {
    const output = execSync(
      "grep -rl \"feature(['\\\"]\" src/tools/ 2>/dev/null || true",
      { cwd: process.cwd() },
    ).toString().trim()
    const files = output.split('\n').filter(Boolean)
    expect(files.every(f => f.endsWith('feature-gate.ts'))).toBe(true)
  })

  test('assembler.ts 不含 require()', async () => {
    const mod = await import('../../src/tools/registry/assembler.ts')
    expect(mod.getTools).toBeDefined()
    expect(typeof mod.getTools).toBe('function')
  })

  test('getTools 返回 Promise（async 化）', async () => {
    const { getTools } = await import('../../src/tools/registry/assembler.ts')
    // 调用返回值应为 Promise
    const fakeCtx = { denyRules: [] } as unknown
    const result = getTools(fakeCtx as never)
    expect(result).toBeInstanceOf(Promise)
    await result.catch(() => {}) // 吞掉错误，只验证返回 Promise
  })

  test('feature-gate 暴露 4 个 API', async () => {
    const mod = await import('../../src/tools/registry/feature-gate.ts')
    expect(typeof mod.isToolEnabled).toBe('function')
    expect(typeof mod.loadFeatureGatedTool).toBe('function')
    expect(typeof mod.listEnabledFeatureGatedTools).toBe('function')
    expect(typeof mod.validateFeatureGateFlags).toBe('function')
  })
})
```

- [ ] **Step 2: 跑测试**

Run:
```bash
bun test tests/integration/feature-gate-wiring.test.ts
```

Expected: 5 tests pass。

- [ ] **Step 3: Commit**

```bash
git add tests/integration/feature-gate-wiring.test.ts
git commit -m "test: C2 - feature-gate 边界接入冒烟测试"
```

---

## Task 6: 跑 precheck + build 验证

**Files:** 无修改

- [ ] **Step 1: 跑 precheck**

Run:
```bash
bun run precheck
```

Expected: 零错误。如果 REPL.tsx 相关测试失败，检查 `getTools().then(...)` 的回调闭包是否丢失了 `this` 绑定。

- [ ] **Step 2: 跑 build 验证**

Run:
```bash
bun run build 2>&1 | tail -5
```

Expected: 构建成功。

- [ ] **Step 3: 验证 CLI 行为不变**

Run:
```bash
bun run dev --version 2>&1 | head -2
```

Expected: 输出版本号，无报错。

- [ ] **Step 4: Commit**

```bash
git commit --allow-empty -m "chore: C2 完成 - feature() 工具注册级边界化 + getTools async 化"
```

---

## Risk

| 风险 | 严重度 | 缓解 |
|------|--------|------|
| H5 REPL.tsx 调用点漏改导致运行时崩溃 | 高 | Task 3 全量 Grep + tsc 强制检查 |
| feature-gate LOADERS 路径与实际工具不匹配 | 中 | Task 1 Step 3 逐个验证路径 |
| workflow-engine 导出名不是 default | 中 | Task 1 Step 2 用 `??` fallback 处理多种导出名 |
| dependency-cruiser 规则误报 | 低 | Task 4 Step 3 验证 warning=0 |
| getTools async 化导致 memoization 竞态 | 中 | Task 2 用模块级 `memoizedBase: Tool[] | null`，首次 await 后赋值 |

---

## Workflow Adaptation

- **PR ID:** C2
- **依赖:** C1（assembler.ts 已搬移到 registry/，feature-gate 已创建）
- **被依赖:** C3+C8（命令分组需工具系统稳定）、C9（query 拆分引用 async getTools）
- **推荐 maxConcurrency:** 1（C2 内部串行）
- **建议 phases:**
  1. `Loaders` — 补全 feature-gate LOADERS 映射（Task 1）
  2. `Rewire` — 重写 assembler.ts（Task 2）
  3. `Async-Fix` — H5 修复 getTools async 调用方（Task 3）
  4. `Verify-Boundary` — 验证边界唯一性（Task 4）
  5. `Test` — 冒烟测试（Task 5）
  6. `Verify` — precheck + build（Task 6）
- **验证 schema:**
  ```js
  {
    type: 'object',
    properties: {
      loadersCompleted: { type: 'boolean' },
      assemblerRewired: { type: 'boolean' },
      asyncCallsFixed: { type: 'boolean' },
      featureBoundaryUnique: { type: 'boolean' },
      unitTestsPass: { type: 'boolean' },
      precheckPass: { type: 'boolean' },
      buildPass: { type: 'boolean' }
    },
    required: ['loadersCompleted', 'assemblerRewired', 'asyncCallsFixed', 'featureBoundaryUnique', 'precheckPass']
  }
  ```
- **可并行点:** 无（C2 与 C1 严格串行；C2 完成后 C3+C8 与 C9 可并行启动）。
- **Plan B 触发条件:** 若 H5 修改导致 REPL.tsx 大面积回归（>10 处需重构），暂停 C2，先回滚 Task 2 的 async 化，改为保留同步 `getTools` + 在内部用同步 require 加载 feature-gated 工具（牺牲 L2 校验，换取 H5 兼容）。

---

**本 plan 实现 v2 spec §3.3（F2 feature() 边界约束）+ §5.3（feature-gate.ts）+ §5.4（async getTools）+ §11 H5。**
