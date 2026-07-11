# C1: tools/ 搬移 + shim 同 PR 删除（H3 循环依赖 + H4 窗口期）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 创建 `src/tools/` 分层目录，把散落 5 处的工具系统（`Tool.ts` / `tools.ts` / `constants/tools.ts` / `services/tools/` / `services/searchExtraTools/`）搬入，处理 P0.5 识别的循环依赖（H3），替换所有内部 import 路径，**同 PR 删除 re-export shim**（H4，无窗口期）。

**Architecture:** 按 v2 spec §5.2 分层：`core/`（类型 + buildTool + lookup）→ `shared/`（helper）→ `registry/`（注册 + 白名单 + feature-gate）→ `execution/`（运行时）/ `discovery/`（TF-IDF）→ `builtin/`（唯一接入点）。P1 已创建 `registry/feature-gate.ts`，C1 仅搬移其余模块。`src/Tool.ts` / `src/tools.ts` / `src/constants/tools.ts` 在本 PR 末尾删除。

**Tech Stack:** TypeScript + Bun + Biome + `git mv`（保留 blame）。

---

## File Structure

| 文件 | 责任 |
|------|------|
| `src/tools/core/types.ts` | 新建：从 `Tool.ts` 抽取的类型定义 |
| `src/tools/core/build-tool.ts` | 新建：从 `Tool.ts` 抽取的 `buildTool` 等 |
| `src/tools/core/lookup.ts` | 新建：`findToolByName` / `toolMatchesName` |
| `src/tools/core/validation.ts` | 新建：Tool 生命周期契约校验 |
| `src/tools/core/index.ts` | 新建：barrel re-export |
| `src/tools/registry/registry.ts` | 新建：`getCommands`-类似 `getTools` 查询函数 |
| `src/tools/registry/assembler.ts` | 新建：从 `tools.ts` 抽取的装配逻辑 |
| `src/tools/registry/whitelists.ts` | 新建：从 `constants/tools.ts` 抽取的 CORE_TOOLS |
| `src/tools/registry/agent-policy.ts` | 新建：agent 工具策略 |
| `src/tools/registry/filter.ts` | 新建：preset filter |
| `src/tools/presets/default.ts` / `index.ts` | 新建：preset 配置 |
| `src/tools/execution/run-tool-use.ts` | 新建：从 `toolExecution.ts` 抽取 |
| `src/tools/execution/orchestrator.ts` | 新建：从 `toolOrchestration.ts` |
| `src/tools/execution/hooks.ts` | 新建：从 `toolHooks.ts` |
| `src/tools/execution/streaming-executor.ts` | 新建：从 `StreamingToolExecutor.ts` |
| `src/tools/execution/permissions.ts` / `mcp-introspection.ts` / `errors.ts` | 新建 |
| `src/tools/discovery/tfidf-index.ts` / `prefetch.ts` / `deferred-loader.ts` | 新建 |
| `src/tools/builtin/index.ts` / `feature-gated.ts` | 新建：唯一接入点 |
| `src/tools/shared/index.ts` | 新建：共享 helper |
| `src/Tool.ts` | **删除**（C1 结束） |
| `src/tools.ts` | **删除**（C1 结束） |
| `src/constants/tools.ts` | **删除**（C1 结束） |
| `src/services/tools/*` | **删除**（C1 结束） |
| `src/services/searchExtraTools/*` | **删除**（C1 结束） |
| `tests/integration/tools-relocation.test.ts` | 新建：冒烟测试 |

---

## Task 1: 准备工作 —— 验证 P0.5 循环依赖基线

**Files:** 无修改

- [ ] **Step 1: 读取 P0.5 循环依赖报告**

Run:
```bash
cat docs/superpowers/refactor-assets/circular-deps-baseline.md 2>&1 | head -80
```

Expected: 文件存在，记录了至少 `tools.ts ↔ TeamCreateTool`、`TeamCreateTool → SendMessage → tools.ts` 等循环。

- [ ] **Step 2: 验证当前循环依赖数（baseline）**

Run:
```bash
bunx madge --circular --extensions ts,tsx src/Tool.ts src/tools.ts 2>&1 | tail -30
```

Expected: 输出 N 个循环（N >= 1），与 P0.5 报告一致。**如果命令失败，说明 madge 安装异常**，需先执行 `bun add -d madge`。

- [ ] **Step 3: 创建目标目录结构**

Run:
```bash
mkdir -p src/tools/{core,registry,presets,execution,discovery,builtin,shared}/__tests__
```

Expected: 目录创建成功。验证：
```bash
ls -d src/tools/*/
```
输出应包含 7 个子目录。

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: C1 准备 - 创建 tools/ 分层目录骨架"
```

---

## Task 2: 搬移 `core/` —— 从 Tool.ts 抽取类型与构建函数

**Files:**
- Create: `src/tools/core/types.ts`、`build-tool.ts`、`lookup.ts`、`validation.ts`、`index.ts`

- [ ] **Step 1: 用 git mv 搬移 Tool.ts 为 core/index.ts，然后抽取**

`src/Tool.ts` 内容混合了类型 + 运行时函数（buildTool、findToolByName）。策略：先整体移动为 `core/_raw.ts`，再分文件抽取。

Run:
```bash
git mv src/Tool.ts src/tools/core/_raw.ts
```

Expected: `src/Tool.ts` 不存在，`src/tools/core/_raw.ts` 存在。

- [ ] **Step 2: 写 core/types.ts**

Create `src/tools/core/types.ts`：从 `_raw.ts` 顶部抽取出所有 `export type` / `export interface` 声明（`ToolInputJSONSchema`、`Tool`、`Tools`、`ToolPermissionContext`、`InputJTD` 等）。**保留原始 import**（从 `@anthropic-ai/sdk` 等）。

```ts
// src/tools/core/types.ts
import type {
  ToolResultBlockParam,
  ToolUseBlockParam,
} from '@anthropic-ai/sdk/resources/index.mjs'
export type { ToolResultBlockParam }
import type {
  ElicitRequestURLParams,
  ElicitResult,
} from '@modelcontextprotocol/sdk/types.js'
import type { UUID } from 'crypto'
import type { z } from 'zod/v4'
import type { Command } from '../../commands.js'
import type { CanUseToolFn } from '../../hooks/useCanUseTool.js'
import type { ThinkingConfig } from '../../utils/thinking.js'
import type { Notification } from '../../context/notifications.js'
import type {
  MCPServerConnection,
  ServerResource,
} from '../../services/mcp/types.js'
import type {
  AgentDefinition,
  AgentDefinitionsResult,
} from '@claude-code-best/builtin-tools/tools/AgentTool/loadAgentsDir.js'
import type {
  AssistantMessage,
  AttachmentMessage,
  Message,
  ProgressMessage,
  SystemLocalCommandMessage,
  SystemMessage,
  UserMessage,
} from '../../types/message.js'

export type ToolInputJSONSchema = {
  [x: string]: unknown
  type: 'object'
  properties?: { [x: string]: unknown }
}

// 把 _raw.ts 中所有 export type / interface 复制到此
// （Tool / Tools / ToolPermissionContext / InputJTD 等，原样保留）
// 详见 _raw.ts 行 16-802
export type { /* ... 见 _raw.ts ... */ }
```

**操作指引：** 用 `grep '^export type\|^export interface' src/tools/core/_raw.ts` 列出所有类型导出，逐个搬到 `types.ts`。

- [ ] **Step 3: 写 core/build-tool.ts**

从 `_raw.ts` 抽取 `buildTool`、`buildToolWithDefaults` 等运行时函数：

```ts
// src/tools/core/build-tool.ts
import type { Tool } from './types.js'

export function buildTool<T extends Tool>(tool: T): T {
  return tool
}

export function buildToolWithDefaults<T extends Tool>(
  tool: Partial<T> & Pick<Tool, 'name' | 'description' | 'inputSchema'>,
): T {
  return {
    isEnabled: () => true,
    isReadOnly: () => false,
    userFacingName: () => tool.name,
    ...tool,
  } as T
}
```

**校验：** 在 `_raw.ts` 中 grep `export function build` 获取实际函数名列表。

- [ ] **Step 4: 写 core/lookup.ts**

```ts
// src/tools/core/lookup.ts
import type { Tool } from './types.js'

export function findToolByName(tools: Tool[], name: string): Tool | undefined {
  return tools.find(t => t.name === name)
}

export function toolMatchesName(tool: { name: string }, name: string): boolean {
  return tool.name === name
}
```

- [ ] **Step 5: 写 core/index.ts（barrel）**

```ts
// src/tools/core/index.ts
export * from './types.js'
export * from './build-tool.js'
export * from './lookup.js'
```

- [ ] **Step 6: 删除 _raw.ts**

Run:
```bash
git rm src/tools/core/_raw.ts
```

- [ ] **Step 7: 验证 core 模块单文件可编译**

Run:
```bash
bunx tsc --noEmit src/tools/core/index.ts 2>&1 | head -20
```

Expected: 零错误。如果报 `Cannot find module '../../commands.js'`，确认相对路径（`src/tools/core/` → `src/commands.ts` 是 2 层 `../../`）。

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor: C1 - 抽取 Tool.ts 到 tools/core/ 分层（types/build-tool/lookup）"
```

---

## Task 3: 搬移 `registry/whitelists.ts` 和 `registry/registry.ts`

**Files:**
- Create: `src/tools/registry/whitelists.ts`、`registry.ts`、`assembler.ts`

- [ ] **Step 1: 搬移 constants/tools.ts**

`constants/tools.ts` 主要是 `CORE_TOOLS` 常量数组。用 git mv 保留历史：

Run:
```bash
git mv src/constants/tools.ts src/tools/registry/whitelists.ts
```

- [ ] **Step 2: 修正 whitelists.ts 内部 import 路径**

`constants/tools.ts` 原路径 `src/constants/`，现路径 `src/tools/registry/`。相对路径从 `'../utils/...'` 改为 `'../../../utils/...'`。

Edit `src/tools/registry/whitelists.ts`：把所有 `from '../` 改为 `from '../../../`。例如：
- `from '../utils/shell/shellToolUtils.js'` → `from '../../../utils/shell/shellToolUtils.js'`
- `from '@claude-code-best/builtin-tools/...'` 保持不变（workspace 包路径）

验证：
```bash
bunx tsc --noEmit src/tools/registry/whitelists.ts 2>&1 | head -10
```

Expected: 零错误。

- [ ] **Step 3: 搬移 tools.ts 为 registry/assembler.ts**

`tools.ts` 含装配逻辑（`getTools`、`getAllBaseTools`、`assembleToolPool`、preset filter）。

Run:
```bash
git mv src/tools.ts src/tools/registry/assembler.ts
```

- [ ] **Step 4: 重写 assembler.ts 的 import**

`assembler.ts` 原 import 自 `./Tool.js`，需改为 `../core/index.js`：

Edit `src/tools/registry/assembler.ts`：
- `import { toolMatchesName, type Tool, type Tools } from './Tool.js'` → `from '../core/index.js'`
- `from './commands.js'` → `from '../../commands.js'`
- `from './hooks/...'` → `from '../../hooks/...'`
- `from './constants/tools.js'` → `from './whitelists.js'`

- [ ] **Step 5: 创建 registry/registry.ts（查询入口）**

```ts
// src/tools/registry/registry.ts
import type { Tool } from '../core/index.js'
import { getTools, getAllBaseTools, assembleToolPool } from './assembler.js'

export { getTools, getAllBaseTools, assembleToolPool }
export type { Tool }

export function findRegisteredTool(
  tools: Tool[],
  name: string,
): Tool | undefined {
  return tools.find(t => t.name === name)
}
```

- [ ] **Step 6: 创建 registry/index.ts（barrel）**

```ts
// src/tools/registry/index.ts
export * from './types.js'  // 如果存在
export * from './whitelists.js'
export * from './assembler.js'
export * from './registry.js'
export * from './feature-gate.js'  // P1 已创建
```

- [ ] **Step 7: 跑 typecheck**

Run:
```bash
bunx tsc --noEmit src/tools/registry/index.ts 2>&1 | head -20
```

Expected: 零错误。常见问题：`feature-gate.ts` 的 `_Tool` placeholder 需替换为 `Tool` 真实类型（P1 Task 1 留的待办，C1 Task 3 Step 7 已处理）。

修复 `src/tools/registry/feature-gate.ts`：
- `type _Tool = unknown` → `import type { Tool } from '../core/types.js'`，把 `_Tool` 全替换为 `Tool`

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor: C1 - 搬移 constants/tools.ts → registry/whitelists.ts, tools.ts → registry/assembler.ts"
```

---

## Task 4: 搬移 `execution/`（toolExecution / hooks / orchestration / streaming）

**Files:**
- Create: `src/tools/execution/run-tool-use.ts`、`hooks.ts`、`orchestrator.ts`、`streaming-executor.ts`、`permissions.ts`、`mcp-introspection.ts`、`errors.ts`、`index.ts`

- [ ] **Step 1: git mv 4 个源文件**

Run:
```bash
git mv src/services/tools/toolExecution.ts src/tools/execution/run-tool-use.ts
git mv src/services/tools/toolHooks.ts src/tools/execution/hooks.ts
git mv src/services/tools/toolOrchestration.ts src/tools/execution/orchestrator.ts
git mv src/services/tools/StreamingToolExecutor.ts src/tools/execution/streaming-executor.ts
```

- [ ] **Step 2: 修正 4 个文件的 import 路径**

原路径 `src/services/tools/`，现路径 `src/tools/execution/`。需要修改：
- `from '../../Tool.js'` → `from '../core/index.js'`
- `from '../../tools.js'` → `from '../registry/assembler.js'`（或 `../registry.js`）
- `from '../../constants/tools.js'` → `from '../registry/whitelists.js'`
- `from '../...'` → `from '../../../...'`（向 `src/` 根的相对路径需多 2 层）

对每个文件执行编辑。例如 `run-tool-use.ts`：

```ts
// 原：from '../../Tool.js'
// 改：from '../core/index.js'

// 原：from '../auth.js'
// 改：from '../../../auth.js'

// 原：from '../../services/mcp/...'
// 改：from '../../../services/mcp/...'
```

**辅助命令（用于列出现有 import 避免遗漏）：**
```bash
grep -n "^import\|^} from" src/tools/execution/run-tool-use.ts | head -50
```

（按 CLAUDE.md 规则应使用 Grep 工具，此处为步骤指引。实际执行时用 Grep 工具。）

- [ ] **Step 3: 抽取 permissions.ts**

`toolExecution.ts`（1831 行）内含权限检查逻辑。grep 出 `checkPermissionsAndCallTool`、`PermissionDecision` 等符号，移到独立文件：

```ts
// src/tools/execution/permissions.ts
import type { Tool, ToolPermissionContext } from '../core/types.js'

export interface PermissionDecision {
  behavior: 'allow' | 'deny' | 'ask'
  message?: string
}

/**
 * 权限检查 —— 从 run-tool-use.ts 抽取。
 *
 * 执行此 Step 时，打开 run-tool-use.ts，找到 checkPermissionsAndCallTool
 * 函数体（含内部 helper），整个函数移到本文件。下方为骨架占位，
 * 实际实现必须从原文件搬移，不能用占位 throw。
 */
export async function checkPermissions(
  tool: Tool,
  input: unknown,
  ctx: ToolPermissionContext,
): Promise<PermissionDecision> {
  // 原函数体内的逻辑原样搬移到此（含 canUseTool 调用、denyRules 匹配、
  // allowedTools/disallowedTools 过滤等）。
  // 参考 run-tool-use.ts 的 checkPermissionsAndCallTool 实现。
  const allowedTools = (ctx as { allowedTools?: string[] }).allowedTools ?? []
  const disallowedTools = (ctx as { disallowedTools?: string[] }).disallowedTools ?? []

  if (disallowedTools.includes(tool.name)) {
    return { behavior: 'deny', message: `Tool ${tool.name} is disallowed` }
  }
  if (allowedTools.length > 0 && !allowedTools.includes(tool.name)) {
    return { behavior: 'deny', message: `Tool ${tool.name} not in allowedTools` }
  }
  // 其余原函数逻辑（canUseTool 回调、UI 询问等）从 run-tool-use.ts 原样搬移
  return { behavior: 'allow' }
}
```

**操作要求：** 上方 `checkPermissions` 骨架只展示权限检查的入口结构。实际执行时必须打开 `run-tool-use.ts`，找到 `checkPermissionsAndCallTool` 函数体，**整个函数**（包括 canUseTool 回调调用、UI 询问逻辑、denyRules 匹配等内部 helper）移到本文件，然后 `run-tool-use.ts` 改为 `import { checkPermissions } from './permissions.js'`。不允许保留占位 return。

- [ ] **Step 4: 创建 mcp-introspection.ts 和 errors.ts**

```ts
// src/tools/execution/errors.ts
export class ToolExecutionError extends Error {
  constructor(
    message: string,
    public toolName: string,
    public cause?: unknown,
  ) {
    super(message)
    this.name = 'ToolExecutionError'
  }
}

export class ToolPermissionDeniedError extends ToolExecutionError {}
export class ToolNotFoundError extends ToolExecutionError {}
```

```ts
// src/tools/execution/mcp-introspection.ts
// MCP 工具内省相关 helper —— 从 run-tool-use.ts 抽取（如有）
// 如果 run-tool-use.ts 无此逻辑，创建空 barrel：
export {}
```

- [ ] **Step 5: 创建 execution/index.ts（barrel）**

```ts
// src/tools/execution/index.ts
export * from './run-tool-use.js'
export * from './hooks.js'
export * from './orchestrator.js'
export * from './streaming-executor.js'
export * from './permissions.js'
export * from './errors.js'
```

- [ ] **Step 6: 跑 typecheck**

Run:
```bash
bunx tsc --noEmit src/tools/execution/index.ts 2>&1 | head -30
```

Expected: 零错误。如果有路径错误，根据错误修正相对路径层数。

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: C1 - 搬移 services/tools/* → tools/execution/（run-tool-use/hooks/orchestrator/streaming）"
```

---

## Task 5: 搬移 `discovery/`（searchExtraTools）

**Files:**
- Create: `src/tools/discovery/tfidf-index.ts`、`prefetch.ts`、`deferred-loader.ts`、`index.ts`

- [ ] **Step 1: git mv**

Run:
```bash
git mv src/services/searchExtraTools/toolIndex.ts src/tools/discovery/tfidf-index.ts
git mv src/services/searchExtraTools/prefetch.ts src/tools/discovery/prefetch.ts
```

- [ ] **Step 2: 创建 deferred-loader.ts**

`deferred-loader.ts` 负责延迟工具加载逻辑（`isDeferredTool`、懒加载）。从 `registry/whitelists.ts` 抽取白名单，组合 TF-IDF 索引实现懒加载：

```ts
// src/tools/discovery/deferred-loader.ts
import { CORE_TOOLS } from '../registry/whitelists.js'

const CORE_SET = new Set(CORE_TOOLS)

export function isDeferredTool(name: string): boolean {
  return !CORE_SET.has(name)
}

/**
 * 加载延迟工具。通过 TF-IDF 索引找到候选工具后动态 import。
 * 参考 services/searchExtraTools/toolIndex.ts 的搜索逻辑。
 */
export async function loadDeferredTool(name: string): Promise<unknown | null> {
  if (!isDeferredTool(name)) return null
  const { searchToolIndex } = await import('./tfidf-index.js')
  const candidates = searchToolIndex(name, 1)
  if (candidates.length === 0) return null
  return candidates[0].tool
}
```

**实现要点：** `searchToolIndex` 是 `tfidf-index.ts` 导出的 TF-IDF 搜索函数（C1 Task 5 Step 1 已 git mv 过来）。执行此 Step 时确认 `tfidf-index.ts` 导出的搜索函数名——可能是 `searchToolIndex` 或 `search`，根据实际导出名调整。

- [ ] **Step 3: 修正 tfidf-index.ts 和 prefetch.ts 的 import 路径**

原 `src/services/searchExtraTools/`，现 `src/tools/discovery/`：
- `from '../../utils/localSearch.js'` → `from '../../../utils/localSearch.js'`
- `from '../...'` → `from '../../../...'`

- [ ] **Step 4: 创建 discovery/index.ts**

```ts
// src/tools/discovery/index.ts
export * from './tfidf-index.js'
export * from './prefetch.js'
export * from './deferred-loader.js'
```

- [ ] **Step 5: 跑 typecheck**

Run:
```bash
bunx tsc --noEmit src/tools/discovery/index.ts 2>&1 | head -20
```

Expected: 零错误。

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: C1 - 搬移 services/searchExtraTools/* → tools/discovery/"
```

---

## Task 6: 搬移 `builtin/` 接入点 + 处理循环依赖（H3）

**Files:**
- Create: `src/tools/builtin/index.ts`、`feature-gated.ts`

- [ ] **Step 1: 处理 P0.5 识别的循环依赖**

根据 P0.5 报告，关键循环：`tools.ts ↔ TeamCreateTool / TeamDeleteTool / SendMessageTool`。

**原机制：** `tools.ts` 行 71-80 用 `require()` 延迟加载打破循环。

**C1 新机制：** 把这些 require 替换为函数级动态 import：

```ts
// src/tools/builtin/index.ts
import type { Tool } from '../core/types.js'

// 静态导入常驻工具
import { AgentTool } from '@claude-code-best/builtin-tools/tools/AgentTool/AgentTool.js'
import { BashTool } from '@claude-code-best/builtin-tools/tools/BashTool/BashTool.js'
// ...（全部常驻工具静态导入）

// 循环依赖工具改为函数级动态 import
export async function loadTeamCreateTool(): Promise<Tool> {
  const mod = await import('@claude-code-best/builtin-tools/tools/TeamCreateTool/TeamCreateTool.js')
  return mod.TeamCreateTool
}
export async function loadTeamDeleteTool(): Promise<Tool> {
  const mod = await import('@claude-code-best/builtin-tools/tools/TeamDeleteTool/TeamDeleteTool.js')
  return mod.TeamDeleteTool
}
export async function loadSendMessageTool(): Promise<Tool> {
  const mod = await import('@claude-code-best/builtin-tools/tools/SendMessageTool/SendMessageTool.js')
  return mod.SendMessageTool
}

// feature-gated 工具委托给 registry/feature-gate.ts
import { listEnabledFeatureGatedTools, loadFeatureGatedTool } from '../registry/feature-gate.js'

export async function loadBuiltinTools(): Promise<Tool[]> {
  const base: Tool[] = [
    AgentTool, BashTool, /* ... 全部常驻 */
  ]
  // 加载循环依赖工具
  base.push(await loadTeamCreateTool())
  base.push(await loadTeamDeleteTool())
  base.push(await loadSendMessageTool())

  // 加载启用的 feature-gated 工具
  for (const flag of listEnabledFeatureGatedTools()) {
    const tool = await loadFeatureGatedTool(flag)
    if (tool) base.push(tool)
  }
  return base
}
```

- [ ] **Step 2: 创建 builtin/feature-gated.ts（占位）**

```ts
// src/tools/builtin/feature-gated.ts
// 此文件只做 feature-gated 工具的别名 import，便于 IDE 跳转。
// 实际 feature gating 逻辑在 registry/feature-gate.ts。
export {}
```

- [ ] **Step 3: 跑 madge 验证循环依赖已解除**

Run:
```bash
bunx madge --circular --extensions ts src/tools/builtin/index.ts 2>&1 | tail -10
```

Expected: 无循环依赖输出，或循环数 < baseline（H3 验证）。

- [ ] **Step 4: 跑 typecheck**

Run:
```bash
bunx tsc --noEmit src/tools/builtin/index.ts 2>&1 | head -20
```

Expected: 零错误。

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: C1 - 创建 tools/builtin/ 接入点，用动态 import 解除 TeamCreate 循环依赖（H3）"
```

---

## Task 7: 全局替换所有外部 import 路径

**Files:** 修改所有引用 `./Tool.js`、`./tools.js`、`./constants/tools.js`、`./services/tools/*`、`./services/searchExtraTools/*` 的文件

- [ ] **Step 1: 用 Grep 列出所有引用旧路径的文件**

Use Grep tool:
- Pattern: `from '.*(/Tool\.js|/tools\.js|/constants/tools\.js|/services/tools/|/services/searchExtraTools/)'`
- Output mode: `files_with_matches`
- Path: `/Users/konghayao/code/ai/claude-code/src`

记录匹配文件列表。

- [ ] **Step 2: 批量替换 import 路径**

对每个匹配文件执行 Edit：

| 旧路径 | 新路径 |
|--------|--------|
| `from './Tool.js'` | `from './tools/core/index.js'` |
| `from '../Tool.js'` | `from '../tools/core/index.js'` |
| `from '../../Tool.js'` | `from '../../tools/core/index.js'` |
| `from './tools.js'` | `from './tools/registry/assembler.js'` |
| `from '../tools.js'` | `from '../tools/registry/assembler.js'` |
| `from './constants/tools.js'` | `from './tools/registry/whitelists.js'` |
| `from '../constants/tools.js'` | `from '../tools/registry/whitelists.js'` |
| `from './services/tools/toolExecution.js'` | `from './tools/execution/run-tool-use.js'` |
| `from './services/tools/toolHooks.js'` | `from './tools/execution/hooks.js'` |
| `from './services/tools/toolOrchestration.js'` | `from './tools/execution/orchestrator.js'` |
| `from './services/tools/StreamingToolExecutor.js'` | `from './tools/execution/streaming-executor.js'` |
| `from './services/searchExtraTools/toolIndex.js'` | `from './tools/discovery/tfidf-index.js'` |
| `from './services/searchExtraTools/prefetch.js'` | `from './tools/discovery/prefetch.js'` |

每个文件的相对层级根据其所在目录调整（`./`、`../`、`../../`）。

- [ ] **Step 3: 跑全项目 typecheck**

Run:
```bash
bunx tsc --noEmit 2>&1 | head -40
```

Expected: 零错误。如果有 "Cannot find module" 错误，逐个修正相对路径。

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: C1 - 全局替换 Tool/tools/services-tools import 路径到 tools/ 分层"
```

---

## Task 8: 删除 shim 文件（H4：无窗口期）

**Files:**
- Delete: `src/Tool.ts`（已被 git mv 走）、`src/tools.ts`（同）、`src/constants/tools.ts`（同）、`src/services/tools/`（空目录）、`src/services/searchExtraTools/`（空目录）

H4 要求：shim 窗口期为零。C1 中**不创建** re-export shim——所有引用方直接迁移到新路径。

- [ ] **Step 1: 确认旧文件已被 git mv**

Run:
```bash
ls src/Tool.ts src/tools.ts src/constants/tools.ts 2>&1
ls -d src/services/tools src/services/searchExtraTools 2>&1
```

Expected: 全部 "No such file or directory"（git mv 已搬走）。

- [ ] **Step 2: 删除空目录**

Run:
```bash
rmdir src/services/tools/__tests__ src/services/tools 2>/dev/null || true
rmdir src/services/searchExtraTools/__tests__ src/services/searchExtraTools 2>/dev/null || true
```

- [ ] **Step 3: 验证无残留旧路径 import**

Use Grep tool:
- Pattern: `from '(\.\./)+Tool\.js|from '(\.\./)+tools\.js|from '(\.\./)+constants/tools\.js|from '(\.\./)+services/tools/|from '(\.\./)+services/searchExtraTools/`
- Path: `/Users/konghayao/code/ai/claude-code/src`
- Output mode: `files_with_matches`

Expected: 零匹配。如有残留，回到 Task 7 修正。

- [ ] **Step 4: 跑 check:unused 验证**

Run:
```bash
bun run check:unused 2>&1 | tail -20
```

Expected: 不应出现 `Tool.ts` / `tools.ts` / `constants/tools.ts` 相关的 unused export 警告。

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: C1 - 删除旧工具系统文件（H4 无窗口期：shim 同 PR 删除）"
```

---

## Task 9: 写冒烟集成测试

**Files:**
- Create: `tests/integration/tools-relocation.test.ts`

- [ ] **Step 1: 写测试**

Create `tests/integration/tools-relocation.test.ts`:

```ts
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
    expect(existsSync(path.join(SRC, 'tools/registry/feature-gate.ts'))).toBe(true)
    expect(existsSync(path.join(SRC, 'tools/registry/whitelists.ts'))).toBe(true)
    expect(existsSync(path.join(SRC, 'tools/registry/assembler.ts'))).toBe(true)
  })

  test('tools/execution/ 含 4 个核心执行模块', () => {
    expect(existsSync(path.join(SRC, 'tools/execution/run-tool-use.ts'))).toBe(true)
    expect(existsSync(path.join(SRC, 'tools/execution/hooks.ts'))).toBe(true)
    expect(existsSync(path.join(SRC, 'tools/execution/orchestrator.ts'))).toBe(true)
    expect(existsSync(path.join(SRC, 'tools/execution/streaming-executor.ts'))).toBe(true)
  })

  test('tools/discovery/ 含 tfidf-index 与 prefetch', () => {
    expect(existsSync(path.join(SRC, 'tools/discovery/tfidf-index.ts'))).toBe(true)
    expect(existsSync(path.join(SRC, 'tools/discovery/prefetch.ts'))).toBe(true)
    expect(existsSync(path.join(SRC, 'tools/discovery/deferred-loader.ts'))).toBe(true)
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
    expect(Array.isArray(mod.CORE_TOOLS)).toBe(true)
    expect(mod.CORE_TOOLS.length).toBeGreaterThan(20)
  })

  test('feature-gate 暴露 Tool 类型（非 placeholder）', async () => {
    // P1 留的 _Tool placeholder 已在 Task 3 Step 7 替换
    const mod = await import('../../src/tools/registry/feature-gate.js')
    expect(typeof mod.isToolEnabled).toBe('function')
    expect(typeof mod.loadFeatureGatedTool).toBe('function')
  })
})
```

- [ ] **Step 2: 跑测试**

Run:
```bash
bun test tests/integration/tools-relocation.test.ts
```

Expected: 9 tests pass。

- [ ] **Step 3: Commit**

```bash
git add tests/integration/tools-relocation.test.ts
git commit -m "test: C1 - 工具系统搬移冒烟测试"
```

---

## Task 10: 跑 precheck + dependency-cruiser 验证

**Files:** 无修改

- [ ] **Step 1: 跑 precheck**

Run:
```bash
bun run precheck
```

Expected: 零错误。常见问题：
- Biome 报 unused import：运行 `bun run check:fix`
- tsc 报路径错误：回到 Task 7 修正
- 测试失败：检查 mock 路径是否需要更新（`tests/mocks/feature-gate.ts` 不应受影响，因为它 mock 整个模块）

- [ ] **Step 2: 跑 dependency-cruiser**

Run:
```bash
bunx depcruise src --config 2>&1 | tail -20
```

Expected:
- `tools-core-no-registry` 规则 warning → 0（core 不依赖 registry）
- `tools-shared-isolation` 规则 warning → 0
- `tools-registry-no-execution` 规则 warning → 0
- `feature-bundle-tool-boundary` 规则：tools/ 下 feature() 只在 `registry/feature-gate.ts`（C2 后变为 0 warning）

- [ ] **Step 3: 跑 build 验证构建产物**

Run:
```bash
bun run build 2>&1 | tail -10
```

Expected: 构建成功。如果 Bun.build 报循环依赖错误，回到 Task 6 处理。

- [ ] **Step 4: Commit**

```bash
git commit --allow-empty -m "chore: C1 完成 - 工具系统搬移 + shim 删除 + 循环依赖解除"
```

---

## Risk

| 风险 | 严重度 | 缓解 |
|------|--------|------|
| 循环依赖 require() 迁移后失效（H3） | 高 | Task 6 用函数级动态 import 替代 require()；madge 验证；P0.5 已做前置调研 |
| 1831 行 toolExecution.ts 拆分丢失逻辑 | 高 | Task 4 用 git mv 整体搬移，permissions 抽取保持纯函数风格 |
| 全局 import 路径替换遗漏 | 中 | Task 7 Step 3 的 tsc 全量检查 + Task 8 Step 3 的 Grep 二次验证 |
| React 组件中 `getTools()` 同步调用（H5） | 高 | C1 不改 REPL.tsx（留到 C2）；但 tsc 会报错——需在 Task 7 标注已知问题，C2 处理 |
| Biome 破坏 React Compiler `_c()` 样板 | 中 | C1 不动 `src/components/`（约束 6） |
| 构建产物功能变化 | 极高 | Task 10 Step 3 跑 `bun run build` 验证；`bun dist/cli.js --version` 验证行为不变 |

---

## Workflow Adaptation

- **PR ID:** C1
- **依赖:** P0.5（循环依赖基线）、P1（feature-gate 骨架）、P3（feature-gate mock）
- **被依赖:** C2（feature-gate wiring）、C9（query 拆分引用 tools/）
- **推荐 maxConcurrency:** 1（C1 内部严格串行，Task 顺序即依赖顺序）
- **建议 phases:**
  1. `Scan` — 验证 P0.5 基线 + 创建目录（Task 1）
  2. `Core` — 搬移 Tool.ts 到 core/（Task 2）
  3. `Registry` — 搬移 constants/tools.ts + tools.ts（Task 3）
  4. `Execution` — 搬移 services/tools/*（Task 4）
  5. `Discovery` — 搬移 searchExtraTools/*（Task 5）
  6. `Builtin` — 处理循环依赖 + 接入点（Task 6）
  7. `Rewire` — 全局替换 import（Task 7）
  8. `Delete` — 删除 shim（Task 8，H4 无窗口期）
  9. `Test` — 冒烟测试（Task 9）
  10. `Verify` — precheck + depcruise + build（Task 10）
- **验证 schema:**
  ```js
  {
    type: 'object',
    properties: {
      coreLayerCreated: { type: 'boolean' },
      registryLayerCreated: { type: 'boolean' },
      executionLayerCreated: { type: 'boolean' },
      discoveryLayerCreated: { type: 'boolean' },
      builtinLayerCreated: { type: 'boolean' },
      oldFilesDeleted: { type: 'boolean' },
      circularDepsResolved: { type: 'boolean' },
      importPathsRewired: { type: 'boolean' },
      unitTestsPass: { type: 'boolean' },
      precheckPass: { type: 'boolean' },
      buildPass: { type: 'boolean' },
      depcruiseToolsRulesZero: { type: 'boolean' }
    },
    required: ['coreLayerCreated', 'registryLayerCreated', 'executionLayerCreated', 'oldFilesDeleted', 'precheckPass', 'buildPass']
  }
  ```
- **可并行点:** 无。C1 是机械搬移，必须严格串行以保证每步可回滚。
- **Plan B 触发条件:** 若 Task 6 循环依赖无法用动态 import 解除（madge 仍报循环），回到 P0.5 重新分析；若 24 小时内无法解决，跳过 C1，触发 H7 fallback 路径（先做 C9/C10）。

---

**本 plan 实现 v2 spec §5（工具系统统一）+ §11 H3（循环依赖处理）+ §11 H4（shim 同 PR 删除）。**
