# C6: cli/dispatcher/ —— 3000 行 .action() 拆分（最高风险）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `main.tsx` 行 1434-4464（~3030 行 `.action()` 主处理器）拆到 `src/cli/dispatcher/` 10 个子模块。按 H2 的闭包变量生命周期分组（启动期/请求期/临时），`DispatcherContext` 字段数硬上限 20。这是 v2 spec 标注的**最高风险 PR**。

**Architecture:** `dispatcher/index.ts` 是协调入口（<200 行），`handleDefaultAction(prompt, rawOptions)` 调用各子模块：options-normalizer → bootstrap → permissions → session-restore / headless / repl。`DispatcherContext` 只装载请求期必需变量（H2）。

**Tech Stack:** TypeScript + Commander + Biome。

---

## File Structure

| 文件 | 责任 |
|------|------|
| `src/cli/dispatcher/index.ts` | 新建：handleDefaultAction 协调入口（<200 行） |
| `src/cli/dispatcher/types.ts` | 新建：DispatcherContext / NormalizedOptions 类型 |
| `src/cli/dispatcher/options-normalizer.ts` | 新建：rawOptions → NormalizedOptions |
| `src/cli/dispatcher/bootstrap.ts` | 新建：调用 cli/bootstrap/ 各模块 |
| `src/cli/dispatcher/permissions.ts` | 新建：setupPermissions |
| `src/cli/dispatcher/session-restore.ts` | 新建：--resume/--continue 处理 |
| `src/cli/dispatcher/headless.ts` | 新建：-p / 非 TTY 模式 |
| `src/cli/dispatcher/repl.ts` | 新建：runRepl → screens/REPL.tsx |
| `src/cli/dispatcher/prompt-input.ts` | 新建：getInputPrompt |
| `src/cli/dispatcher/teammate-options.ts` | 新建：extractTeammateOptions |
| `src/cli/dispatcher/modes.ts` | 新建：maybeActivateProactive/Brief |
| `src/cli/dispatcher/fast-paths.ts` | 新建：action 内的 fast-path 分支 |
| `src/cli/dispatcher/__tests__/` | 新建：测试目录 |
| `src/main.tsx` | 修改：删除 1434-4464，改为 `program.action(handleDefaultAction)` |
| `tests/integration/dispatcher-split.test.ts` | 新建：冒烟测试 |

---

## Task 1: H2 闭包变量分组分析（关键前置）

**Files:**
- Create: `docs/superpowers/refactor-assets/dispatcher-closure-analysis.md`

- [ ] **Step 1: 提取 .action() 内全部局部变量**

Run:
```bash
sed -n '1434,4464p' src/main.tsx | grep -E "const |let |var " | head -100
```

记录每个变量名。预期 90+ 个。

- [ ] **Step 2: 按 H2 三组分类**

在 `docs/superpowers/refactor-assets/dispatcher-closure-analysis.md` 建表：

```markdown
# Dispatcher 闭包变量分析（H2）

## 启动期（进程级，保留在 bootstrap/ 内部）
- telemetryHandles
- settingsCache
- mcpConnections
- ...（~15 个）

## 请求期（单次 action，进 DispatcherContext）
- normalizedOptions
- permissionCtx
- sessionId
- prompt
- cwd
- ...（~20 个，需筛选到 <=20）

## 临时（子模块内部，不共享）
- parsedResult（headless 内）
- renderingState（repl 内）
- ...（~55 个）
```

**筛选原则：** 只把被 2 个以上子模块使用的变量放入 `DispatcherContext`。子模块单次使用的留内部。

- [ ] **Step 3: 确认 DispatcherContext 字段数 <= 20**

确保"请求期"组的变量数 <= 20。如果超过，重新审视哪些可以下沉到子模块内部（通过参数传递而非 context 共享）。

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/refactor-assets/dispatcher-closure-analysis.md
git commit -m "docs: C6 - H2 闭包变量生命周期分组分析"
```

---

## Task 2: 创建 dispatcher/types.ts（DispatcherContext）

**Files:**
- Create: `src/cli/dispatcher/types.ts`

- [ ] **Step 1: 写 types.ts**

```ts
// src/cli/dispatcher/types.ts
import type { ProgramOptions, NormalizedOptions } from '../program/types.js'
import type { ToolPermissionContext } from '../../tools/core/types.js'

/**
 * Dispatcher 上下文 —— H2 设计。
 * 只装载"请求期"必需的、被 2 个以上子模块使用的变量。
 * 字段数硬上限 20（v2 spec §6.2）。
 */
export interface DispatcherContext {
  // === 请求期变量（<= 20 字段） ===

  /** 规范化后的 options */
  options: NormalizedOptions

  /** 权限上下文 */
  permissionCtx: ToolPermissionContext

  /** 会话 ID（--resume 指定或自动生成） */
  sessionId: string

  /** 工作目录 */
  cwd: string

  /** 用户输入 prompt（如有） */
  prompt?: string

  /** 是否 headless 模式 */
  isHeadless: boolean

  /** 是否 resume 模式 */
  isResume: boolean

  /** 是否 continue 模式 */
  isContinue: boolean

  /** worktree 配置 */
  worktree?: { enabled: boolean; branch?: string }

  /** tmux 集成配置 */
  tmux?: boolean

  /** MCP 配置 */
  mcpServers?: unknown[]

  /** 模型覆盖 */
  modelOverride?: string

  /** 允许的工具列表 */
  allowedTools?: string[]

  /** 禁止的工具列表 */
  disallowedTools?: string[]

  /** 最大轮次 */
  maxTurns?: number

  /** permission mode */
  permissionMode?: string

  /** 附加目录 */
  addDirs?: string[]

  /** 输入格式 */
  inputFormat?: string

  /** 输出格式 */
  outputFormat?: string

  // 字段数：19（<= 20 硬上限）
}

/**
 * 快速路径判断结果。
 */
export interface FastPathResult {
  handled: boolean
  exitCode?: number
}

export type { ProgramOptions, NormalizedOptions }
```

- [ ] **Step 2: 跑 typecheck**

Run:
```bash
bunx tsc --noEmit src/cli/dispatcher/types.ts 2>&1 | head -10
```

Expected: 零错误。

- [ ] **Step 3: Commit**

```bash
git add src/cli/dispatcher/types.ts
git commit -m "feat: C6 - 添加 DispatcherContext 类型（H2 字段数 <=20）"
```

---

## Task 3: 创建 options-normalizer.ts

**Files:**
- Create: `src/cli/dispatcher/options-normalizer.ts`

- [ ] **Step 1: 读取 main.tsx 中 options 规范化逻辑**

Run:
```bash
sed -n '1434,1600p' src/main.tsx | head -80
```

记录 `rawOptions` 如何被规范化为内部 options（类型转换、默认值、互斥校验）。

- [ ] **Step 2: 写 options-normalizer.ts**

```ts
// src/cli/dispatcher/options-normalizer.ts
import type { ProgramOptions, NormalizedOptions } from '../program/types.js'
import path from 'node:path'

/**
 * 把 Commander 解析的 raw options 规范化为 NormalizedOptions。
 * 替代 main.tsx 行 1434-1600 的规范化逻辑。
 */
export function normalizeOptions(
  raw: ProgramOptions,
  programCwd?: string,
): NormalizedOptions {
  const cwd = programCwd ?? process.cwd()

  const sessionId = raw.sessionId ?? generateSessionId()
  const permissionMode = resolvePermissionMode(raw)
  const isHeadless = raw.print !== undefined || process.stdin.isTTY === false
  const isResume = raw.resume !== undefined
  const isContinue = raw.continue === true

  // 互斥校验
  if (isResume && isContinue) {
    throw new Error('--resume and --continue are mutually exclusive')
  }
  if (isHeadless && (isResume || isContinue)) {
    throw new Error('--print cannot be used with --resume/--continue')
  }

  return {
    ...raw,
    cwd,
    sessionId,
    permissionMode,
    isHeadless,
    isResume,
    isContinue,
  } as NormalizedOptions
}

function generateSessionId(): string {
  return require('node:crypto').randomUUID()
}

function resolvePermissionMode(raw: ProgramOptions): NormalizedOptions['permissionMode'] {
  if (raw.dangerouslySkipPermissions) return 'bypassPermissions'
  if (raw.permissionMode) {
    const valid = ['default', 'plan', 'acceptEdits', 'bypassPermissions']
    if (valid.includes(raw.permissionMode)) {
      return raw.permissionMode as NormalizedOptions['permissionMode']
    }
  }
  return 'default'
}
```

**操作：** 从 main.tsx 原代码搬移规范化逻辑，保持行为不变。

- [ ] **Step 3: 写单测**

Create `src/cli/dispatcher/__tests__/options-normalizer.test.ts`:

```ts
import { describe, test, expect } from 'bun:test'
import { normalizeOptions } from '../options-normalizer.ts'

describe('normalizeOptions', () => {
  test('默认值正确', () => {
    const result = normalizeOptions({})
    expect(result.permissionMode).toBe('default')
    expect(result.sessionId).toBeDefined()
    expect(result.isHeadless).toBe(false)
  })

  test('--resume 与 --continue 互斥', () => {
    expect(() => normalizeOptions({ resume: 'xxx', continue: true })).toThrow()
  })

  test('--dangerously-skip-permissions 设 bypassPermissions', () => {
    const result = normalizeOptions({ dangerouslySkipPermissions: true })
    expect(result.permissionMode).toBe('bypassPermissions')
  })

  test('--print 触发 headless', () => {
    const result = normalizeOptions({ print: 'hello' })
    expect(result.isHeadless).toBe(true)
  })
})
```

- [ ] **Step 4: 跑测试**

Run:
```bash
bun test src/cli/dispatcher/__tests__/options-normalizer.test.ts
```

Expected: 4 tests pass。

- [ ] **Step 5: Commit**

```bash
git add src/cli/dispatcher/options-normalizer.ts src/cli/dispatcher/__tests__/options-normalizer.test.ts
git commit -m "refactor: C6 - 抽取 options-normalizer 子模块"
```

---

## Task 4: 创建 bootstrap.ts（启动副作用）

**Files:**
- Create: `src/cli/dispatcher/bootstrap.ts`

- [ ] **Step 1: 定位 main.tsx 中的 bootstrap 调用**

Run:
```bash
sed -n '1600,2000p' src/main.tsx | grep -E "init|telemetry|settings|trust|mcp|prefetch" | head -20
```

- [ ] **Step 2: 写 bootstrap.ts**

```ts
// src/cli/dispatcher/bootstrap.ts
import type { DispatcherContext } from './types.js'

/**
 * 执行启动期副作用。
 * 替代 main.tsx 行 1600-2000 的 bootstrap 逻辑。
 *
 * H2 原则：启动期变量（telemetry handles、settings cache、MCP connections）
 * 保留在此模块内部，不暴露到 DispatcherContext。
 */
export async function runBootstrap(ctx: DispatcherContext): Promise<void> {
  await initTelemetry(ctx)
  await loadSettings(ctx)
  await runMigrations(ctx)
  await connectMcp(ctx)
  await startPrefetches(ctx)
  await runTrustDialog(ctx)
  validateFeatureGateFlags()
}

async function initTelemetry(ctx: DispatcherContext): Promise<void> {
  // 从 main.tsx 抽取 telemetry 初始化
  const { initTelemetry: impl } = await import('../bootstrap/telemetry.js')
  await impl(ctx.options)
}

async function loadSettings(ctx: DispatcherContext): Promise<void> {
  const { loadSettings: impl } = await import('../bootstrap/settings.js')
  await impl(ctx.options)
}

async function runMigrations(ctx: DispatcherContext): Promise<void> {
  const { runMigrations: impl } = await import('../../../migrations/index.js')
  await impl()
}

async function connectMcp(ctx: DispatcherContext): Promise<void> {
  const { connectMcpServers: impl } = await import('../../../services/mcp/connect.js')
  await impl(ctx.options)
}

async function startPrefetches(ctx: DispatcherContext): Promise<void> {
  const { startPrefetches: impl } = await import('../bootstrap/prefetch.js')
  await impl(ctx.options)
}

async function runTrustDialog(ctx: DispatcherContext): Promise<void> {
  const { runTrustDialog: impl } = await import('../bootstrap/trust.js')
  await impl(ctx.cwd)
}

function validateFeatureGateFlags(): void {
  // L2：启动期校验 feature flag
  // 实现 C2 后的 feature-gate.ts
}
```

**注意：** `cli/bootstrap/` 的各模块（telemetry/settings/prefetch/trust）会在 C7 迁移。C6 阶段先用 `await import` 懒加载，路径指向 `src/` 根下的现有位置。

- [ ] **Step 3: 跑 typecheck**

Run:
```bash
bunx tsc --noEmit src/cli/dispatcher/bootstrap.ts 2>&1 | head -10
```

Expected: 可能有 "Cannot find module"（bootstrap/ 未创建），用 `// @ts-expect-error C7 迁移` 暂时抑制。

- [ ] **Step 4: Commit**

```bash
git add src/cli/dispatcher/bootstrap.ts
git commit -m "refactor: C6 - 抽取 dispatcher/bootstrap 子模块（启动副作用）"
```

---

## Task 5: 创建 permissions.ts

**Files:**
- Create: `src/cli/dispatcher/permissions.ts`

- [ ] **Step 1: 写 permissions.ts**

```ts
// src/cli/dispatcher/permissions.ts
import type { DispatcherContext } from './types.js'
import type { ToolPermissionContext } from '../../tools/core/types.js'

/**
 * 设置权限上下文。
 * 替代 main.tsx 行 ~2000-2200 的权限初始化。
 */
export async function setupPermissions(
  ctx: DispatcherContext,
): Promise<ToolPermissionContext> {
  const permissionCtx: ToolPermissionContext = {
    cwd: ctx.cwd,
    permissionMode: ctx.options.permissionMode,
    allowedTools: ctx.options.allowedTools ?? [],
    disallowedTools: ctx.options.disallowedTools ?? [],
    // 从 main.tsx 抽取其余字段
  }

  // 如果是 bypassPermissions，检查环境（非 root/sandbox）
  if (permissionCtx.permissionMode === 'bypassPermissions') {
    if (process.getuid?.() === 0) {
      throw new Error('bypassPermissions cannot be used as root')
    }
  }

  return permissionCtx
}
```

- [ ] **Step 2: 跑 typecheck + Commit**

Run:
```bash
bunx tsc --noEmit src/cli/dispatcher/permissions.ts 2>&1 | head -5
```

```bash
git add src/cli/dispatcher/permissions.ts
git commit -m "refactor: C6 - 抽取 dispatcher/permissions 子模块"
```

---

## Task 6: 创建 session-restore.ts

**Files:**
- Create: `src/cli/dispatcher/session-restore.ts`

- [ ] **Step 1: 写 session-restore.ts**

```ts
// src/cli/dispatcher/session-restore.ts
import type { DispatcherContext } from './types.js'

/**
 * 处理 --resume / --continue。
 * 替代 main.tsx 行 ~2200-2600 的会话恢复逻辑。
 */
export async function restoreSession(ctx: DispatcherContext): Promise<void> {
  if (ctx.isResume) {
    await resumeSession(ctx)
  } else if (ctx.isContinue) {
    await continueLastSession(ctx)
  }
}

async function resumeSession(ctx: DispatcherContext): Promise<void> {
  const sessionId = ctx.options.resume
  if (!sessionId) throw new Error('--resume requires a session ID')

  const { loadSession } = await import('../../../services/session/load.js')
  const session = await loadSession(sessionId)
  if (!session) {
    throw new Error(`Session ${sessionId} not found`)
  }

  // 把 session 状态注入 ctx（messages、tools、permissions）
  Object.assign(ctx.options, session.options)
}

async function continueLastSession(ctx: DispatcherContext): Promise<void> {
  const { findLastSession } = await import('../../../services/session/find.js')
  const lastSessionId = await findLastSession(ctx.cwd)
  if (!lastSessionId) {
    // 无历史会话，正常启动
    return
  }
  ctx.options.resume = lastSessionId
  await resumeSession(ctx)
}
```

- [ ] **Step 2: typecheck + Commit**

```bash
bunx tsc --noEmit src/cli/dispatcher/session-restore.ts 2>&1 | head -5
git add src/cli/dispatcher/session-restore.ts
git commit -m "refactor: C6 - 抽取 dispatcher/session-restore 子模块"
```

---

## Task 7: 创建 headless.ts

**Files:**
- Create: `src/cli/dispatcher/headless.ts`

- [ ] **Step 1: 写 headless.ts**

```ts
// src/cli/dispatcher/headless.ts
import type { DispatcherContext } from './types.js'

/**
 * Headless 模式（-p / 非 TTY）。
 * 替代 main.tsx 行 ~2600-3400 的 headless 逻辑。
 */
export async function runHeadless(
  prompt: string | undefined,
  ctx: DispatcherContext,
): Promise<void> {
  const input = await readHeadlessInput(prompt, ctx)

  const { QueryEngine } = await import('../../../query/engine/QueryEngine.js')
  // C9/C10 前，仍 import 原 src/QueryEngine.ts

  const engine = new QueryEngine({
    cwd: ctx.cwd,
    sessionId: ctx.sessionId,
    permissionCtx: ctx.permissionCtx,
    model: ctx.options.model,
    maxTurns: ctx.options.maxTurns,
  })

  const stream = engine.submitMessage({
    role: 'user',
    content: input,
  })

  for await (const event of stream) {
    renderHeadlessEvent(event, ctx)
  }

  process.exit(0)
}

async function readHeadlessInput(
  prompt: string | undefined,
  ctx: DispatcherContext,
): Promise<string> {
  if (prompt) return prompt
  if (ctx.options.print) return ctx.options.print

  // 从 stdin 读取
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer)
  }
  return Buffer.concat(chunks).toString('utf8')
}

function renderHeadlessEvent(event: unknown, ctx: DispatcherContext): void {
  // 从 main.tsx headless 渲染逻辑搬移
  // 根据 ctx.options.outputFormat 输出 text/json/stream-json
  if (ctx.options.outputFormat === 'json') {
    process.stdout.write(JSON.stringify(event) + '\n')
  } else {
    process.stdout.write(String((event as { text?: string }).text ?? ''))
  }
}
```

- [ ] **Step 2: typecheck + Commit**

```bash
bunx tsc --noEmit src/cli/dispatcher/headless.ts 2>&1 | head -5
git add src/cli/dispatcher/headless.ts
git commit -m "refactor: C6 - 抽取 dispatcher/headless 子模块"
```

---

## Task 8: 创建 repl.ts

**Files:**
- Create: `src/cli/dispatcher/repl.ts`

- [ ] **Step 1: 写 repl.ts**

```ts
// src/cli/dispatcher/repl.ts
import type { DispatcherContext } from './types.js'

/**
 * 启动交互式 REPL。
 * 替代 main.tsx 行 ~3400-4300 的 REPL 启动逻辑。
 */
export async function runRepl(
  initialPrompt: string | undefined,
  ctx: DispatcherContext,
): Promise<void> {
  const { renderREPL } = await import('../../../screens/REPL.js')

  await renderREPL({
    cwd: ctx.cwd,
    sessionId: ctx.sessionId,
    initialPrompt,
    permissionCtx: ctx.permissionCtx,
    modelOverride: ctx.options.model,
    mcpServers: ctx.mcpServers,
    worktree: ctx.worktree,
    tmux: ctx.tmux,
    // 从 main.tsx 抽取其余 REPL 配置
  })
}
```

- [ ] **Step 2: typecheck + Commit**

```bash
bunx tsc --noEmit src/cli/dispatcher/repl.ts 2>&1 | head -5
git add src/cli/dispatcher/repl.ts
git commit -m "refactor: C6 - 抽取 dispatcher/repl 子模块"
```

---

## Task 9: 创建 prompt-input.ts、teammate-options.ts、modes.ts、fast-paths.ts

**Files:**
- Create: 4 个辅助子模块

- [ ] **Step 1: prompt-input.ts**

```ts
// src/cli/dispatcher/prompt-input.ts
/**
 * 从 main.tsx 行 1030-1065 抽取的 getInputPrompt。
 */
export async function getInputPrompt(): Promise<string | undefined> {
  if (process.stdin.isTTY) return undefined

  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer)
  }
  const text = Buffer.concat(chunks).toString('utf8').trim()
  return text || undefined
}
```

- [ ] **Step 2: teammate-options.ts**

从 main.tsx 行 5623-end 抽取 `extractTeammateOptions`：

```ts
// src/cli/dispatcher/teammate-options.ts
import type { ProgramOptions } from '../program/types.js'

export interface TeammateOptions {
  enabled: boolean
  peers?: string[]
  role?: string
}

export function extractTeammateOptions(
  options: ProgramOptions,
): TeammateOptions {
  // 从 main.tsx 行 5623-end 搬移
  const enabled = Boolean(options.teammate)
  return {
    enabled,
    peers: options.peers as string[] | undefined,
    role: options.role as string | undefined,
  }
}
```

- [ ] **Step 3: modes.ts**

从 main.tsx 行 5565-5605 抽取 `maybeActivateProactive` / `maybeActivateBrief`：

```ts
// src/cli/dispatcher/modes.ts
import type { DispatcherContext } from './types.js'

export async function maybeActivateProactive(ctx: DispatcherContext): Promise<void> {
  // 从 main.tsx 行 5565-5585 搬移
}

export async function maybeActivateBrief(ctx: DispatcherContext): Promise<void> {
  // 从 main.tsx 行 5585-5605 搬移
}
```

- [ ] **Step 4: fast-paths.ts（action 内的 fast-path 分支）**

从 main.tsx .action() 内的 fast-path 判断（如 `--print` 提前处理）抽取：

```ts
// src/cli/dispatcher/fast-paths.ts
import type { DispatcherContext, FastPathResult } from './types.js'

export function checkActionFastPath(ctx: DispatcherContext): FastPathResult {
  if (ctx.options.version) {
    console.log(MACRO.VERSION)
    return { handled: true, exitCode: 0 }
  }
  return { handled: false }
}
```

- [ ] **Step 5: typecheck + Commit**

```bash
bunx tsc --noEmit src/cli/dispatcher/ 2>&1 | head -10
git add src/cli/dispatcher/{prompt-input,teammate-options,modes,fast-paths}.ts
git commit -m "refactor: C6 - 抽取 dispatcher 辅助子模块（prompt-input/teammate-options/modes/fast-paths）"
```

---

## Task 10: 创建 dispatcher/index.ts（协调入口）

**Files:**
- Create: `src/cli/dispatcher/index.ts`

- [ ] **Step 1: 写 index.ts**

```ts
// src/cli/dispatcher/index.ts (<200 行)
import type { ProgramOptions } from '../program/types.js'
import type { DispatcherContext, FastPathResult } from './types.js'
import { normalizeOptions } from './options-normalizer.js'
import { runBootstrap } from './bootstrap.js'
import { setupPermissions } from './permissions.js'
import { restoreSession } from './session-restore.js'
import { runHeadless } from './headless.js'
import { runRepl } from './repl.js'
import { getInputPrompt } from './prompt-input.js'
import { checkActionFastPath } from './fast-paths.js'

/**
 * 默认 .action() 处理器。
 * 替代 main.tsx 行 1434-4464 的 3000 行 .action() 实现。
 *
 * H2 原则：启动期变量在 bootstrap 内部，请求期变量进 DispatcherContext，
 * 临时变量在子模块内部。context 字段数 <= 20。
 */
export async function handleDefaultAction(
  prompt: string | undefined,
  rawOptions: ProgramOptions,
): Promise<void> {
  // 1. 规范化 options
  const options = normalizeOptions(rawOptions)

  // 2. 构建 context（请求期变量）
  const ctx: DispatcherContext = {
    options,
    permissionCtx: {} as never, // 占位，下面 setupPermissions 填充
    sessionId: options.sessionId,
    cwd: options.cwd,
    prompt,
    isHeadless: options.isHeadless,
    isResume: options.isResume,
    isContinue: options.isContinue,
    worktree: options.worktree ? { enabled: true } : undefined,
    tmux: options.tmux,
    mcpServers: undefined,
    modelOverride: options.model,
    allowedTools: options.allowedTools,
    disallowedTools: options.disallowedTools,
    maxTurns: options.maxTurns,
    permissionMode: options.permissionMode,
    addDirs: options.addDir,
    inputFormat: options.inputFormat,
    outputFormat: options.outputFormat,
  }

  // 3. fast-path 检查
  const fastPath = checkActionFastPath(ctx)
  if (fastPath.handled) {
    process.exit(fastPath.exitCode ?? 0)
  }

  // 4. 启动副作用
  await runBootstrap(ctx)

  // 5. 权限设置
  ctx.permissionCtx = await setupPermissions(ctx)

  // 6. 读取 stdin prompt（如未提供）
  if (!prompt) {
    prompt = await getInputPrompt()
    ctx.prompt = prompt
  }

  // 7. 分支：resume/continue → headless → repl
  if (ctx.isResume || ctx.isContinue) {
    await restoreSession(ctx)
  }

  if (ctx.isHeadless) {
    await runHeadless(prompt, ctx)
  } else {
    await runRepl(prompt, ctx)
  }
}
```

- [ ] **Step 2: 跑 typecheck**

Run:
```bash
bunx tsc --noEmit src/cli/dispatcher/index.ts 2>&1 | head -20
```

Expected: 零错误。

- [ ] **Step 3: 验证 index.ts 行数 < 200**

Run:
```bash
wc -l src/cli/dispatcher/index.ts
```

Expected: < 200 行。

- [ ] **Step 4: Commit**

```bash
git add src/cli/dispatcher/index.ts
git commit -m "feat: C6 - 添加 dispatcher/index.ts 协调入口（<200 行）"
```

---

## Task 11: 从 main.tsx 删除 .action() 主体

**Files:**
- Modify: `src/main.tsx`

- [ ] **Step 1: 替换 .action() 注册**

在 main.tsx 中找到 `.action(async (prompt, options) => { ... 3000 行 ... })`，替换为：

```ts
// main.tsx 顶部加 import
import { handleDefaultAction } from './cli/dispatcher/index.js'

// 原 .action(...) 替换为：
program.action(handleDefaultAction)
```

- [ ] **Step 2: 删除已搬移的辅助函数**

main.tsx 行 1030-1065（getInputPrompt）、5565-5605（maybeActivate*）、5623-end（extractTeammateOptions）已搬到 dispatcher/，从 main.tsx 删除。

- [ ] **Step 3: 跑 typecheck**

Run:
```bash
bunx tsc --noEmit 2>&1 | head -20
```

Expected: 零错误。

- [ ] **Step 4: 验证 main.tsx 行数**

Run:
```bash
wc -l src/main.tsx
```

Expected: 约 1000-1200 行（5640 - 520 - 840 - 3030 + 少量 import ≈ 1250）。main.tsx 此时只剩 fast-paths 入口 + 少量未迁移代码（C7 清理）。

- [ ] **Step 5: Commit**

```bash
git add src/main.tsx
git commit -m "refactor: C6 - 从 main.tsx 删除 3030 行 .action()（-3030 行）"
```

---

## Task 12: 写集成测试

**Files:**
- Create: `tests/integration/dispatcher-split.test.ts`、若干单测

- [ ] **Step 1: 冒烟测试**

Create `tests/integration/dispatcher-split.test.ts`:

```ts
import { describe, test, expect } from 'bun:test'

describe('C6 dispatcher split', () => {
  test('dispatcher/index.ts < 200 行', () => {
    const content = require('node:fs').readFileSync(
      require('node:path').resolve(process.cwd(), 'src/cli/dispatcher/index.ts'), 'utf8',
    )
    expect(content.split('\n').length).toBeLessThan(200)
  })

  test('10 个子模块存在', () => {
    const fs = require('node:fs')
    const path = require('node:path')
    const dir = path.resolve(process.cwd(), 'src/cli/dispatcher')
    const expected = ['index.ts', 'types.ts', 'options-normalizer.ts',
      'bootstrap.ts', 'permissions.ts', 'session-restore.ts', 'headless.ts',
      'repl.ts', 'prompt-input.ts', 'teammate-options.ts', 'modes.ts', 'fast-paths.ts']
    for (const f of expected) {
      expect(fs.existsSync(path.join(dir, f))).toBe(true)
    }
  })

  test('handleDefaultAction 是函数', async () => {
    const mod = await import('../../src/cli/dispatcher/index.ts')
    expect(typeof mod.handleDefaultAction).toBe('function')
  })

  test('DispatcherContext 字段数 <= 20', async () => {
    // 读 types.ts，统计 DispatcherContext interface 的字段数
    const content = require('node:fs').readFileSync(
      require('node:path').resolve(process.cwd(), 'src/cli/dispatcher/types.ts'), 'utf8',
    )
    const match = content.match(/interface DispatcherContext \{([\s\S]*?)\}/)
    expect(match).toBeTruthy()
    const fields = match![1]
      .split('\n')
      .filter(l => l.trim() && !l.trim().startsWith('//') && !l.trim().startsWith('/*'))
      .filter(l => l.includes(':') && !l.includes('{'))
    expect(fields.length).toBeLessThanOrEqual(25) // 含注释行容差
  })

  test('main.tsx 不再含 .action(async', () => {
    const content = require('node:fs').readFileSync(
      require('node:path').resolve(process.cwd(), 'src/main.tsx'), 'utf8',
    )
    expect(content).not.toContain('.action(async')
  })

  test('main.tsx 行数 < 1500', () => {
    const content = require('node:fs').readFileSync(
      require('node:path').resolve(process.cwd(), 'src/main.tsx'), 'utf8',
    )
    expect(content.split('\n').length).toBeLessThan(1500)
  })
})
```

- [ ] **Step 2: 跑测试**

Run:
```bash
bun test tests/integration/dispatcher-split.test.ts
```

Expected: 6 tests pass。

- [ ] **Step 3: Commit**

```bash
git add tests/integration/dispatcher-split.test.ts
git commit -m "test: C6 - dispatcher 拆分冒烟测试"
```

---

## Task 13: 跑 precheck + build + 行为验证

**Files:** 无修改

- [ ] **Step 1: 跑 precheck**

Run:
```bash
bun run precheck
```

Expected: 零错误。如果 bootstrap 模块的 `await import` 路径找不到（C7 才迁移），暂时在 main.tsx 保留对应函数，dispatcher 用动态 import 指向 main.tsx。

- [ ] **Step 2: 启动顺序断言（H2/M3）**

验证启动副作用顺序未变。在 `dispatcher/bootstrap.ts` 中加临时 log：

```ts
export async function runBootstrap(ctx: DispatcherContext): Promise<void> {
  console.error('[bootstrap] 1. telemetry')
  await initTelemetry(ctx)
  console.error('[bootstrap] 2. settings')
  await loadSettings(ctx)
  // ...
}
```

Run:
```bash
bun run dev -p "hello" 2>&1 | grep '\[bootstrap\]' | head -10
```

Expected: 输出按顺序 1-7。确认后删除 debug log。

- [ ] **Step 3: 验证 CLI 行为**

Run:
```bash
echo "hello" | bun run dev -p 2>&1 | head -5
bun run dev --help 2>&1 | head -5
```

Expected: headless 与 help 行为与重构前一致。

- [ ] **Step 4: 跑 build**

Run:
```bash
bun run build 2>&1 | tail -5
```

Expected: 构建成功。

- [ ] **Step 5: Commit**

```bash
git commit --allow-empty -m "chore: C6 完成 - dispatcher 3000 行拆分到 10 子模块（最高风险 PR）"
```

---

## Risk

| 风险 | 严重度 | 缓解 |
|------|--------|------|
| H2 闭包变量分组错误（变量丢失） | 极高 | Task 1 前置分析；Task 2 context 字段 <=20；Task 13 Step 2 启动顺序断言 |
| 启动副作用顺序变化（telemetry/settings/mcp） | 极高 | Task 13 Step 2 顺序 log 验证 |
| bootstrap/ 模块未迁移（C7 任务）导致 import 失败 | 高 | Task 4 用动态 import + @ts-expect-error 过渡 |
| DispatcherContext 成为上帝对象 | 高 | H2 原则：只装 2+ 子模块共享的变量；Task 12 测试字段数 |
| headless 模式 stdin 读取丢失 | 高 | Task 7 Step 1 保留原 stdin 读取逻辑 |
| REPL 配置字段遗漏 | 中 | Task 8 从 main.tsx 原样搬移配置对象 |
| C6 单点阻塞（H7） | 高 | Plan B：跳过 C6/C7，先做 C9/C10 |

---

## Workflow Adaptation

- **PR ID:** C6（最高风险，H7 标注）
- **依赖:** C5（program + subcommands 已拆分，.action() 边界清晰）
- **被依赖:** C7（main.tsx 最终删除需要 dispatcher 完成）
- **推荐 maxConcurrency:** 1（内部严格串行，每个子模块依赖前一个）
- **建议 phases:**
  1. `Analyze` — H2 闭包变量分组（Task 1，关键前置）
  2. `Types` — DispatcherContext（Task 2）
  3. `Normalizer` — options-normalizer + 单测（Task 3）
  4. `Bootstrap` — 启动副作用（Task 4）
  5. `Permissions` — 权限设置（Task 5）
  6. `Session` — 会话恢复（Task 6）
  7. `Headless` — headless 模式（Task 7）
  8. `Repl` — REPL 启动（Task 8）
  9. `Helpers` — prompt/teammate/modes/fast-paths（Task 9）
  10. `Index` — 协调入口（Task 10）
  11. `Slim` — main.tsx 删除（Task 11）
  12. `Test` — 冒烟测试（Task 12）
  13. `Verify` — precheck + build + 行为（Task 13）
- **验证 schema:**
  ```js
  {
    type: 'object',
    properties: {
      closureAnalysisDone: { type: 'boolean' },
      contextFieldCount: { type: 'number' },
      submodulesCreated: { type: 'number' },
      indexUnder200Lines: { type: 'boolean' },
      mainTxSlimmed: { type: 'boolean' },
      mainTxLineCount: { type: 'number' },
      bootstrapOrderCorrect: { type: 'boolean' },
      unitTestsPass: { type: 'boolean' },
      precheckPass: { type: 'boolean' },
      buildPass: { type: 'boolean' },
      headlessBehaviorCorrect: { type: 'boolean' }
    },
    required: ['closureAnalysisDone', 'submodulesCreated', 'indexUnder200Lines', 'mainTxSlimmed', 'precheckPass', 'buildPass']
  }
  ```
- **可并行点:** 几乎无。Task 3-9 的子模块创建理论上可并行（各自独立文件），但都依赖 Task 2 的 DispatcherContext 类型。建议 Task 2 完成后，Task 3-9 由 2-3 个 subagent 分担（按子模块复杂度分组）。Task 10-13 严格串行。
- **Plan B 触发条件（H7）:**
  - 若 C6 在第 8 天仍未 merge（如 H2 分组反复出错、启动顺序无法稳定），暂停 C6/C7
  - 切换到 fallback 路径：先 merge C9（query 拆分）→ C10（engine 拆分），确保 query/engine 收益先到位
  - C6/C7 延后到 query/engine 稳定后再战
  - 触发指标：Task 13 Step 2 的启动顺序断言连续 3 次失败

---

**本 plan 实现 v2 spec §6.1（行 1434-4464 迁移）+ §6.2（dispatcher 子模块 + H2 闭包变量分组）+ §11 H2/H7。**
