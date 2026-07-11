# C10: QueryEngine.ts 拆分到 query/engine/

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]` syntax for tracking.

**Goal:** 把 `src/QueryEngine.ts`（1365 行）拆到 `src/query/engine/`，含 9 个子模块。H1 明确每个子模块的 yield 委托模式（A/B/C）。`submitMessage` 拆为 `submit-message.ts` 主生成器 + 8 个 helper。删除原 `QueryEngine.ts`。

**Architecture:** `engine/QueryEngine.ts` 是会话级状态机类，持有 EngineState；`engine/submit-message.ts` 是 `runSubmitMessage(state, msg)` 生成器（模式 A），委托 `query/loop/`（C9 完成）和 8 个 engine helper。

**Tech Stack:** TypeScript + Bun + AsyncGenerator。

---

## File Structure

| 文件 | 责任 |
|------|------|
| `src/query/engine/QueryEngine.ts` | 新建：会话级状态机类（瘦壳） |
| `src/query/engine/submit-message.ts` | 新建：runSubmitMessage 主生成器（模式 A） |
| `src/query/engine/messages-state.ts` | 新建：pushMessage（模式 C） |
| `src/query/engine/file-history.ts` | 新建：snapshotHistory（模式 B） |
| `src/query/engine/session-persist.ts` | 新建：persistSession（模式 B） |
| `src/query/engine/attribution.ts` | 新建：computeAttribution（模式 C） |
| `src/query/engine/compaction.ts` | 新建：maybeCompact（模式 A） |
| `src/query/engine/interrupt.ts` | 新建：isInterrupted（模式 C） |
| `src/query/engine/nested-memory.ts` | 新建：trackNestedMemory（模式 C） |
| `src/query/engine/skill-discovery.ts` | 新建：trackDiscoveredSkill（模式 C） |
| `src/query/engine/__tests__/` | 新建：测试目录 |
| `src/QueryEngine.ts` | **删除**（C10 结束） |
| `tests/integration/engine-split.test.ts` | 新建：冒烟测试 |

---

## Task 1: 抽取 EngineState 类型 + 创建 engine 骨架

**Files:**
- Create: `src/query/engine/types.ts`（如需独立）或复用 `query/types.ts`

- [ ] **Step 1: 读取 QueryEngine.ts 顶部类型定义**

Run:
```bash
sed -n '1,217p' src/QueryEngine.ts | head -80
```

记录 `QueryEngine` 类的属性（messages、tools、sessionId、cwd、permissionCtx 等），这些构成 EngineState。

- [ ] **Step 2: 在 query/types.ts 补充 EngineState**

Edit `src/query/types.ts`，追加：

```ts
/**
 * Engine 会话级状态（v2 spec §7.5）。
 * 由 QueryEngine 类持有，传给各 engine 子模块。
 */
export interface EngineState {
  sessionId: string
  cwd: string
  messages: Message[]
  tools: Tool[]
  model: string
  permissionCtx: unknown
  systemPrompt: string
  apiKey: string
  provider: string
  compactionThreshold: number
  interrupted: boolean
  fileHistorySnapshots: Map<string, unknown>
  nestedMemory: Set<string>
  discoveredSkills: Set<string>
  attribution: { promptCacheHits?: number; fingerprint?: string }
  apiConfig: { provider: string; apiKey: string; baseUrl?: string }

  /** 转换为 QueryLoopParams 供 loop 调用 */
  toLoopParams(): QueryLoopParams
}
```

- [ ] **Step 3: 创建 engine 目录**

Run:
```bash
mkdir -p src/query/engine/__tests__
```

- [ ] **Step 4: typecheck + Commit**

```bash
bunx tsc --noEmit src/query/types.ts 2>&1 | head -10
git add src/query/types.ts
git commit -m "feat: C10 - 添加 EngineState 类型到 query/types.ts"
```

---

## Task 2: 创建 messages-state.ts（模式 C）+ attribution.ts（模式 C）

**Files:**
- Create: `src/query/engine/messages-state.ts`、`attribution.ts`

- [ ] **Step 1: messages-state.ts**

```ts
// src/query/engine/messages-state.ts
import type { Message } from '../../types/message.js'
import type { EngineState } from '../types.js'

/**
 * 消息状态管理（模式 C：同步函数）。
 * 替代 QueryEngine.ts 中 submitMessage 的消息 push 逻辑。
 */
export function pushMessage(
  state: EngineState,
  message: Message,
): void {
  state.messages.push(message)
}

export function getMessages(state: EngineState): Message[] {
  return state.messages
}

export function getLastAssistantMessage(state: EngineState): Message | undefined {
  for (let i = state.messages.length - 1; i >= 0; i--) {
    if (state.messages[i].role === 'assistant') return state.messages[i]
  }
  return undefined
}

export function clearMessages(state: EngineState): void {
  state.messages = []
}
```

- [ ] **Step 2: attribution.ts**

从 QueryEngine.ts 抽取 attribution 计算：

```ts
// src/query/engine/attribution.ts
import type { EngineState } from '../types.js'

/**
 * 计算 attribution（模式 C：同步）。
 * 替代 QueryEngine.ts 中的 attribution 逻辑。
 */
export function computeAttribution(state: EngineState): {
  promptCacheHits?: number
  fingerprint?: string
} {
  return {
    promptCacheHits: state.attribution.promptCacheHits,
    fingerprint: state.attribution.fingerprint,
  }
}

export function updateAttribution(
  state: EngineState,
  event: { type: string; [key: string]: unknown },
): void {
  if ((event as { usage?: { promptCacheHits?: number } }).usage?.promptCacheHits) {
    state.attribution.promptCacheHits = event.usage!.promptCacheHits
  }
}
```

- [ ] **Step 3: typecheck + Commit**

```bash
bunx tsc --noEmit src/query/engine/messages-state.ts src/query/engine/attribution.ts 2>&1 | head -10
git add src/query/engine/messages-state.ts src/query/engine/attribution.ts
git commit -m "feat: C10 - 添加 engine/messages-state（C）+ attribution（C）"
```

---

## Task 3: 创建 file-history.ts（模式 B）+ session-persist.ts（模式 B）

**Files:**
- Create: `src/query/engine/file-history.ts`、`session-persist.ts`

- [ ] **Step 1: file-history.ts**

从 QueryEngine.ts 抽取文件历史快照逻辑：

```ts
// src/query/engine/file-history.ts
import type { EngineState } from '../types.js'

export interface FileSnapshot {
  path: string
  content: string
  timestamp: number
}

/**
 * 快照文件历史（模式 B：Promise）。
 * 替代 QueryEngine.ts submitMessage 中的 snapshotHistory 调用。
 */
export async function snapshotHistory(state: EngineState): Promise<FileSnapshot[]> {
  const snapshots: FileSnapshot[] = []
  const filesToSnapshot = extractFilePaths(state.messages)

  for (const filePath of filesToSnapshot) {
    try {
      const { readFile } = await import('node:fs/promises')
      const content = await readFile(filePath, 'utf8')
      const snapshot: FileSnapshot = { path: filePath, content, timestamp: Date.now() }
      snapshots.push(snapshot)
      state.fileHistorySnapshots.set(filePath, snapshot)
    } catch {
      // 文件可能已删除，跳过
    }
  }
  return snapshots
}

function extractFilePaths(messages: EngineState['messages']): string[] {
  const paths = new Set<string>()
  for (const msg of messages) {
    const content = (msg as { content?: unknown[] }).content
    if (!Array.isArray(content)) continue
    for (const block of content) {
      const b = block as { type?: string; path?: string; file_path?: string }
      if (b.type === 'tool_result' && (b.path || b.file_path)) {
        paths.add(b.path ?? b.file_path!)
      }
    }
  }
  return Array.from(paths)
}

export function getHistorySnapshot(
  state: EngineState,
  filePath: string,
): FileSnapshot | undefined {
  return state.fileHistorySnapshots.get(filePath) as FileSnapshot | undefined
}
```

- [ ] **Step 2: session-persist.ts**

```ts
// src/query/engine/session-persist.ts
import type { EngineState } from '../types.js'

/**
 * 持久化会话（模式 B：Promise）。
 * 替代 QueryEngine.ts 中的 persistSession。
 */
export async function persistSession(state: EngineState): Promise<void> {
  const { saveSession } = await import('../../services/session/save.js')
  await saveSession({
    sessionId: state.sessionId,
    cwd: state.cwd,
    messages: state.messages,
    model: state.model,
    timestamp: Date.now(),
  })
}

export async function loadSessionState(sessionId: string): Promise<Partial<EngineState>> {
  const { loadSession } = await import('../../services/session/load.js')
  const session = await loadSession(sessionId)
  if (!session) throw new Error(`Session ${sessionId} not found`)
  return {
    messages: session.messages,
    model: session.model,
    cwd: session.cwd,
  }
}
```

- [ ] **Step 3: typecheck + Commit**

```bash
bunx tsc --noEmit src/query/engine/file-history.ts src/query/engine/session-persist.ts 2>&1 | head -10
git add src/query/engine/file-history.ts src/query/engine/session-persist.ts
git commit -m "feat: C10 - 添加 engine/file-history（B）+ session-persist（B）"
```

---

## Task 4: 创建 compaction.ts（模式 A）+ interrupt.ts（模式 C）

**Files:**
- Create: `src/query/engine/compaction.ts`、`interrupt.ts`

- [ ] **Step 1: compaction.ts**

从 QueryEngine.ts 抽取 compaction 逻辑（37 个 yield 中的 compact 相关块）：

```ts
// src/query/engine/compaction.ts
import type { EngineState } from '../types.js'
import type { TurnEvent } from '../types.js'

export interface CompactEvent {
  type: 'compaction_started' | 'compaction_progress' | 'compaction_complete'
  [key: string]: unknown
}

/**
 * 上下文压缩（模式 A：AsyncGenerator）。
 * 调用方 yield* maybeCompact(state)。
 * 替代 QueryEngine.ts 中的 compaction yield 块。
 */
export async function* maybeCompact(state: EngineState): AsyncGenerator<TurnEvent> {
  if (!shouldCompact(state)) return

  yield { type: 'stream_event', event: { type: 'compaction_started' } }

  try {
    const compacted = await doCompaction(state)
    state.messages = compacted
    yield { type: 'stream_event', event: { type: 'compaction_complete', messageCount: compacted.length } }
  } catch (err) {
    yield { type: 'error', error: err as Error, recoverable: true }
  }
}

export function shouldCompact(state: EngineState): boolean {
  const totalChars = state.messages.reduce((sum, m) => {
    const content = (m as { content?: unknown[] }).content
    if (!Array.isArray(content)) return sum
    return sum + JSON.stringify(content).length
  }, 0)
  return totalChars > state.compactionThreshold
}

async function doCompaction(state: EngineState): Promise<EngineState['messages']> {
  const { compactMessages } = await import('./messages-state.js')
  // 调用 API 做摘要压缩
  const { callApi } = await import('../api.js')
  const summaryPrompt = buildSummaryPrompt(state.messages)

  const stream = await callApi(state.toLoopParams(), [
    { role: 'user', content: summaryPrompt } as never,
  ])

  let summary = ''
  for await (const event of stream) {
    const evt = event as { type: string; text?: string }
    if (evt.type === 'content_block_delta' && evt.text) {
      summary += evt.text
    }
  }

  return [
    {
      role: 'system',
      content: `Previous conversation summarized:\n${summary}`,
    } as never,
  ]
}

function buildSummaryPrompt(messages: EngineState['messages']): string {
  return `Summarize the following conversation concisely:\n${JSON.stringify(messages.slice(-20))}`
}
```

- [ ] **Step 2: interrupt.ts**

```ts
// src/query/engine/interrupt.ts
import type { EngineState } from '../types.js'

/**
 * 检查是否被中断（模式 C：同步 boolean）。
 */
export function isInterrupted(state: EngineState): boolean {
  return state.interrupted
}

export function setInterrupted(state: EngineState, value: boolean): void {
  state.interrupted = value
}
```

- [ ] **Step 3: typecheck + Commit**

```bash
bunx tsc --noEmit src/query/engine/compaction.ts src/query/engine/interrupt.ts 2>&1 | head -10
git add src/query/engine/compaction.ts src/query/engine/interrupt.ts
git commit -m "feat: C10 - 添加 engine/compaction（A）+ interrupt（C）"
```

---

## Task 5: 创建 nested-memory.ts + skill-discovery.ts（模式 C）

**Files:**
- Create: `src/query/engine/nested-memory.ts`、`skill-discovery.ts`

- [ ] **Step 1: nested-memory.ts**

```ts
// src/query/engine/nested-memory.ts
import type { EngineState } from '../types.js'

/**
 * 跟踪嵌套 memory 引用（模式 C：同步）。
 * 替代 QueryEngine.ts 中的 nested memory tracking。
 */
export function trackNestedMemory(
  state: EngineState,
  path: string,
): void {
  state.nestedMemory.add(path)
}

export function getNestedMemory(state: EngineState): Set<string> {
  return new Set(state.nestedMemory)
}

export function clearNestedMemory(state: EngineState): void {
  state.nestedMemory.clear()
}
```

- [ ] **Step 2: skill-discovery.ts**

```ts
// src/query/engine/skill-discovery.ts
import type { EngineState } from '../types.js'

/**
 * 跟踪发现的 skills（模式 C：同步）。
 */
export function trackDiscoveredSkill(
  state: EngineState,
  name: string,
): void {
  state.discoveredSkills.add(name)
}

export function getDiscoveredSkills(state: EngineState): Set<string> {
  return new Set(state.discoveredSkills)
}
```

- [ ] **Step 3: typecheck + Commit**

```bash
bunx tsc --noEmit src/query/engine/nested-memory.ts src/query/engine/skill-discovery.ts 2>&1 | head -5
git add src/query/engine/nested-memory.ts src/query/engine/skill-discovery.ts
git commit -m "feat: C10 - 添加 engine/nested-memory（C）+ skill-discovery（C）"
```

---

## Task 6: 创建 submit-message.ts（主生成器，模式 A）

**Files:**
- Create: `src/query/engine/submit-message.ts`

- [ ] **Step 1: 写 submit-message.ts**

```ts
// src/query/engine/submit-message.ts (<400 行)
import type { EngineState, TurnEvent } from '../types.js'
import type { Message } from '../../types/message.js'
import { queryLoop } from '../loop/index.js'  // 依赖方向：engine → loop
import { pushMessage, getLastAssistantMessage } from './messages-state.js'
import { snapshotHistory } from './file-history.js'
import { persistSession } from './session-persist.js'
import { computeAttribution, updateAttribution } from './attribution.js'
import { maybeCompact, shouldCompact } from './compaction.js'
import { isInterrupted } from './interrupt.js'

/**
 * submitMessage 主生成器（模式 A：AsyncGenerator<TurnEvent>）。
 * 被 QueryEngine.submitMessage 用 yield* 委托。
 *
 * v2 spec §7.5 H1：每个子模块委托模式已标注。
 * M3：这是物理拆分降低行数，submit-message 仍是协调节点。
 */
export async function* runSubmitMessage(
  state: EngineState,
  userMessage: Message,
): AsyncGenerator<TurnEvent> {
  // 1. push 消息（模式 C）
  pushMessage(state, userMessage)

  // 2. 快照文件历史（模式 B: await）
  await snapshotHistory(state)

  // 3. 委托 queryLoop（模式 A: yield*）
  yield* queryLoop(state.toLoopParams())

  // 4. 计算 attribution（模式 C）
  const attribution = computeAttribution(state)

  // 5. 持久化会话（模式 B: await）
  await persistSession(state)

  // 6. 压缩上下文（模式 A: yield*）
  if (shouldCompact(state)) {
    yield* maybeCompact(state)
  }

  // 7. 中断检查（模式 C）
  if (isInterrupted(state)) {
    return
  }
}
```

- [ ] **Step 2: typecheck**

Run:
```bash
bunx tsc --noEmit src/query/engine/submit-message.ts 2>&1 | head -10
```

Expected: 零错误。

- [ ] **Step 3: 验证行数 < 400**

Run:
```bash
wc -l src/query/engine/submit-message.ts
```

Expected: < 400 行。

- [ ] **Step 4: Commit**

```bash
git add src/query/engine/submit-message.ts
git commit -m "feat: C10 - 添加 engine/submit-message.ts 主生成器（模式 A，<400 行）"
```

---

## Task 7: 创建 QueryEngine.ts（瘦壳类）

**Files:**
- Create: `src/query/engine/QueryEngine.ts`

- [ ] **Step 1: 写瘦壳 QueryEngine**

```ts
// src/query/engine/QueryEngine.ts
import type { EngineState, TurnEvent, QueryLoopParams } from '../types.js'
import type { Message } from '../../types/message.js'
import { runSubmitMessage } from './submit-message.js'
import { setInterrupted } from './interrupt.js'
import { clearMessages } from './messages-state.js'

/**
 * 会话级状态机（瘦壳）。
 * 替代原 src/QueryEngine.ts 1365 行。
 *
 * v2 spec §7.5：QueryEngine 持有 EngineState，
 * submitMessage 委托 runSubmitMessage（yield*）。
 */
export class QueryEngine implements Partial<EngineState> {
  private state: EngineState

  constructor(config: {
    cwd: string
    sessionId: string
    model: string
    permissionCtx: unknown
    tools?: EngineState['tools']
    systemPrompt?: string
    apiKey?: string
    provider?: string
  }) {
    this.state = this.initState(config)
  }

  private initState(config: ConstructorParameters<typeof QueryEngine>[0]): EngineState {
    return {
      sessionId: config.sessionId,
      cwd: config.cwd,
      messages: [],
      tools: config.tools ?? [],
      model: config.model,
      permissionCtx: config.permissionCtx,
      systemPrompt: config.systemPrompt ?? '',
      apiKey: config.apiKey ?? process.env.ANTHROPIC_API_KEY ?? '',
      provider: config.provider ?? 'firstParty',
      compactionThreshold: 100_000,
      interrupted: false,
      fileHistorySnapshots: new Map(),
      nestedMemory: new Set(),
      discoveredSkills: new Set(),
      attribution: {},
      apiConfig: {
        provider: config.provider ?? 'firstParty',
        apiKey: config.apiKey ?? process.env.ANTHROPIC_API_KEY ?? '',
      },
      toLoopParams(): QueryLoopParams {
        return {
          messages: this.messages,
          tools: this.tools,
          systemPrompt: this.systemPrompt,
          model: this.model,
          sessionId: this.sessionId,
          cwd: this.cwd,
          permissionCtx: this.permissionCtx,
          apiConfig: this.apiConfig,
        }
      },
    }
  }

  /**
   * 提交消息，返回 AsyncGenerator。
   * yield* 委托 runSubmitMessage。
   */
  submitMessage(message: Message): AsyncGenerator<TurnEvent> {
    return runSubmitMessage(this.state, message)
  }

  interrupt(): void {
    setInterrupted(this.state, true)
  }

  clearHistory(): void {
    clearMessages(this.state)
  }

  getMessages(): Message[] {
    return this.state.messages
  }

  getState(): Readonly<EngineState> {
    return this.state
  }
}

/**
 * ask 顶层函数（替代 QueryEngine.ts 行 1256-1365）。
 */
export async function* ask(
  prompt: string,
  config: ConstructorParameters<typeof QueryEngine>[0],
): AsyncGenerator<TurnEvent> {
  const engine = new QueryEngine(config)
  yield* engine.submitMessage({ role: 'user', content: prompt } as unknown as Message)
}
```

- [ ] **Step 2: typecheck**

Run:
```bash
bunx tsc --noEmit src/query/engine/QueryEngine.ts 2>&1 | head -20
```

Expected: 零错误。

- [ ] **Step 3: Commit**

```bash
git add src/query/engine/QueryEngine.ts
git commit -m "feat: C10 - 添加 engine/QueryEngine.ts 瘦壳类 + ask 函数"
```

---

## Task 8: 删除原 QueryEngine.ts + 更新引用

**Files:**
- Delete: `src/QueryEngine.ts`

- [ ] **Step 1: Grep 所有引用旧 QueryEngine.ts**

Use Grep tool:
- Pattern: `from '(\.\./)+QueryEngine(\.js)?'`
- Path: `/Users/konghayao/code/ai/claude-code/src`
- Output mode: `files_with_matches`

- [ ] **Step 2: 替换 import 路径**

对每个匹配文件，把 `from '../QueryEngine.js'` 改为 `from '../query/engine/QueryEngine.js'`（层数根据文件位置调整）。

常见调用方：
- `src/screens/REPL.tsx`（H5：C2 已处理 async getTools）
- `src/cli/dispatcher/headless.ts`（C6 已用 `await import`）
- `src/cli/dispatcher/repl.ts`（C6）

- [ ] **Step 3: 删除原文件**

Run:
```bash
git rm src/QueryEngine.ts
```

- [ ] **Step 4: 跑全项目 typecheck**

Run:
```bash
bunx tsc --noEmit 2>&1 | head -20
```

Expected: 零错误。

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: C10 - 删除 src/QueryEngine.ts（1365 行拆分到 query/engine/）"
```

---

## Task 9: 写单测 —— 验证 H1 委托模式

**Files:**
- Create: `src/query/engine/__tests__/delegation.test.ts`

- [ ] **Step 1: 写委托模式测试**

```ts
import { describe, test, expect } from 'bun:test'

describe('C10 H1 delegation modes', () => {
  test('submit-message 返回 AsyncGenerator（模式 A）', async () => {
    const mod = await import('../submit-message.ts')
    expect(typeof mod.runSubmitMessage).toBe('function')
    const fakeState = {
      messages: [], tools: [], toLoopParams: () => ({ messages: [], tools: [], systemPrompt: '', model: 'x', sessionId: 's', cwd: '/', permissionCtx: {}, apiConfig: { provider: 'firstParty', apiKey: '' } }),
    } as never
    const gen = mod.runSubmitMessage(fakeState, { role: 'user', content: 'hi' } as never)
    expect(typeof gen.next).toBe('function')
    expect(typeof gen[Symbol.asyncIterator]).toBe('function')
  })

  test('messages-state pushMessage 是同步（模式 C）', async () => {
    const mod = await import('../messages-state.ts')
    expect(typeof mod.pushMessage).toBe('function')
    const state = { messages: [] } as never
    mod.pushMessage(state, { role: 'user', content: 'x' } as never)
    // 同步执行，无 Promise
    expect(state.messages).toHaveLength(1)
  })

  test('file-history snapshotHistory 返回 Promise（模式 B）', async () => {
    const mod = await import('../file-history.ts')
    const state = { messages: [], fileHistorySnapshots: new Map() } as never
    const result = mod.snapshotHistory(state)
    expect(result).toBeInstanceOf(Promise)
  })

  test('compaction maybeCompact 返回 AsyncGenerator（模式 A）', async () => {
    const mod = await import('../compaction.ts')
    const state = {
      messages: [], compactionThreshold: 1_000_000, toLoopParams: () => ({}) as never,
    } as never
    const gen = mod.maybeCompact(state)
    expect(typeof gen.next).toBe('function')
  })

  test('interrupt isInterrupted 返回 boolean（模式 C）', async () => {
    const mod = await import('../interrupt.ts')
    const state = { interrupted: false } as never
    const result = mod.isInterrupted(state)
    expect(typeof result).toBe('boolean')
  })

  test('attribution computeAttribution 返回对象（模式 C）', async () => {
    const mod = await import('../attribution.ts')
    const state = { attribution: { promptCacheHits: 100 } } as never
    const result = mod.computeAttribution(state)
    expect(typeof result).toBe('object')
    expect(result.promptCacheHits).toBe(100)
  })

  test('QueryEngine.submitMessage 返回 AsyncGenerator', async () => {
    const mod = await import('../QueryEngine.ts')
    const engine = new mod.QueryEngine({
      cwd: '/tmp', sessionId: 'test', model: 'claude-sonnet', permissionCtx: {},
    })
    const gen = engine.submitMessage({ role: 'user', content: 'hi' } as never)
    expect(typeof gen.next).toBe('function')
  })
})
```

- [ ] **Step 2: 跑测试**

Run:
```bash
bun test src/query/engine/__tests__/delegation.test.ts
```

Expected: 7 tests pass。

- [ ] **Step 3: Commit**

```bash
git add src/query/engine/__tests__/delegation.test.ts
git commit -m "test: C10 - H1 委托模式单测（7 个子模块的 A/B/C 模式验证）"
```

---

## Task 10: 写冒烟集成测试

**Files:**
- Create: `tests/integration/engine-split.test.ts`

- [ ] **Step 1: 写测试**

Create `tests/integration/engine-split.test.ts`:

```ts
import { describe, test, expect } from 'bun:test'
import { existsSync } from 'node:fs'
import path from 'node:path'

const SRC = path.resolve(process.cwd(), 'src/query/engine')

describe('C10 engine split', () => {
  test('QueryEngine.ts 已删除', () => {
    expect(existsSync(path.resolve(process.cwd(), 'src/QueryEngine.ts'))).toBe(false)
  })

  test('engine/ 含 9 个子模块', () => {
    const expected = ['QueryEngine.ts', 'submit-message.ts', 'messages-state.ts',
      'file-history.ts', 'session-persist.ts', 'attribution.ts', 'compaction.ts',
      'interrupt.ts', 'nested-memory.ts', 'skill-discovery.ts']
    for (const f of expected) {
      expect(existsSync(path.join(SRC, f))).toBe(true, `Missing: ${f}`)
    }
  })

  test('submit-message.ts < 400 行', () => {
    const content = require('node:fs').readFileSync(
      path.join(SRC, 'submit-message.ts'), 'utf8',
    )
    expect(content.split('\n').length).toBeLessThan(400)
  })

  test('QueryEngine.ts 瘦壳 < 300 行', () => {
    const content = require('node:fs').readFileSync(
      path.join(SRC, 'QueryEngine.ts'), 'utf8',
    )
    expect(content.split('\n').length).toBeLessThan(300)
  })

  test('engine → loop 单向依赖（query/loop 不 import engine）', () => {
    const { execSync } = require('node:child_process')
    const output = execSync(
      "grep -rl \"from '.*engine/\" src/query/loop/ 2>/dev/null || true",
      { cwd: process.cwd() },
    ).toString().trim()
    expect(output).toBe('')
  })

  test('engine → loop 单向依赖（query/api 不 import engine/loop）', () => {
    const { execSync } = require('node:child_process')
    const output = execSync(
      "grep -rl \"from '.*\\(engine\\|loop\\)/\" src/query/api.ts 2>/dev/null || true",
      { cwd: process.cwd() },
    ).toString().trim()
    expect(output).toBe('')
  })

  test('QueryEngine 类可实例化', async () => {
    const mod = await import('../../src/query/engine/QueryEngine.ts')
    const engine = new mod.QueryEngine({
      cwd: '/tmp',
      sessionId: 'test',
      model: 'claude-sonnet',
      permissionCtx: {},
    })
    expect(engine).toBeDefined()
    expect(engine.getMessages()).toEqual([])
  })

  test('无文件引用旧 QueryEngine.js', () => {
    const { execSync } = require('node:child_process')
    const output = execSync(
      "grep -rn \"from '.*QueryEngine\\.js'\" src/ 2>/dev/null | grep -v 'query/engine/' || true",
      { cwd: process.cwd() },
    ).toString().trim()
    expect(output).toBe('')
  })
})
```

- [ ] **Step 2: 跑测试**

Run:
```bash
bun test tests/integration/engine-split.test.ts
```

Expected: 8 tests pass。

- [ ] **Step 3: Commit**

```bash
git add tests/integration/engine-split.test.ts
git commit -m "test: C10 - engine 拆分冒烟测试（单向依赖 + H1 委托）"
```

---

## Task 11: 跑 precheck + build + message-pipeline 验证

**Files:** 无修改

- [ ] **Step 1: 跑 precheck**

Run:
```bash
bun run precheck
```

Expected: 零错误。

- [ ] **Step 2: 跑 message-pipeline 集成测试**

Run:
```bash
bun test tests/integration/message-pipeline.test.ts 2>&1 | tail -10
```

Expected: 通过。query/engine 流行为不变。

- [ ] **Step 3: 跑 build**

Run:
```bash
bun run build 2>&1 | tail -5
```

Expected: 构建成功。

- [ ] **Step 4: 跑 dependency-cruiser 验证单向依赖**

Run:
```bash
bunx depcruise src/query --config 2>&1 | grep -E 'query-loop-no-engine|query-api-no-loop|query-engine-no-cli' | head -5
```

Expected: 零 warning（三层单向依赖全部满足）。

- [ ] **Step 5: Commit**

```bash
git commit --allow-empty -m "chore: C10 完成 - QueryEngine 1365 行拆分 + H1 委托模式 + 单向依赖验证"
```

---

## Risk

| 风险 | 严重度 | 缓解 |
|------|--------|------|
| H1 submitMessage 37 个 yield 拆分遗漏 | 极高 | Task 6 保持 submit-message 为协调节点；Task 9 委托模式测试；Task 11 Step 2 集成验证 |
| EngineState.toLoopParams 闭包 this 绑定错误 | 高 | Task 7 Step 1 用普通函数（非箭头），this 绑定 state |
| compaction 逻辑搬移后 API 调用丢失 | 高 | Task 4 Step 1 doCompaction 保留 callApi 调用 |
| C10 依赖 C9（query/loop）未完成 | 高 | 依赖链强制：C10 必须在 C9 后 |
| file-history 在测试环境读真实文件失败 | 中 | Task 3 Step 1 try/catch 吞掉 ENOENT |
| REPL.tsx 引用 QueryEngine 路径未更新 | 中 | Task 8 Step 2 Grep + 替换 |
| QueryEngine 瘦壳状态初始化遗漏字段 | 中 | Task 7 Step 1 initState 覆盖 EngineState 全字段 |

---

## Workflow Adaptation

- **PR ID:** C10
- **依赖:** C9（query/loop/ 已完成，submit-message 委托 queryLoop）
- **被依赖:** F1（shim 验证）、F4（depcruise 收紧 query 规则）
- **推荐 maxConcurrency:** 1（内部串行）
- **建议 phases:**
  1. `State` — EngineState 类型（Task 1）
  2. `Helpers-C` — messages-state + attribution（Task 2，模式 C）
  3. `Helpers-B` — file-history + session-persist（Task 3，模式 B）
  4. `Helpers-A-C` — compaction + interrupt（Task 4，模式 A + C）
  5. `Tracking` — nested-memory + skill-discovery（Task 5，模式 C）
  6. `SubmitMessage` — 主生成器（Task 6，模式 A）
  7. `QueryEngine` — 瘦壳类（Task 7）
  8. `Delete` — 删除原文件 + 更新引用（Task 8）
  9. `Test-Unit` — 委托模式单测（Task 9）
  10. `Test-Integration` — 冒烟测试（Task 10）
  11. `Verify` — precheck + build + message-pipeline（Task 11）
- **验证 schema:**
  ```js
  {
    type: 'object',
    properties: {
      stateTypeCreated: { type: 'boolean' },
      submodulesCreated: { type: 'number' },
      submitMessageUnder400: { type: 'boolean' },
      queryEngineShellUnder300: { type: 'boolean' },
      oldFileDeleted: { type: 'boolean' },
      noDanglingQueryEngineRef: { type: 'boolean' },
      loopNoImportEngine: { type: 'boolean' },
      apiNoImportEngineLoop: { type: 'boolean' },
      delegationTestsPass: { type: 'boolean' },
      messagePipelinePass: { type: 'boolean' },
      unitTestsPass: { type: 'boolean' },
      precheckPass: { type: 'boolean' },
      buildPass: { type: 'boolean' },
      depcruiseQueryRulesZero: { type: 'boolean' }
    },
    required: ['submodulesCreated', 'oldFileDeleted', 'loopNoImportEngine', 'apiNoImportEngineLoop', 'messagePipelinePass', 'precheckPass']
  }
  ```
- **可并行点:**
  - Task 2（messages-state + attribution）与 Task 3（file-history + session-persist）与 Task 5（nested-memory + skill-discovery）可由 3 个 subagent 并行（都只依赖 Task 1 的 EngineState 类型）
  - Task 4（compaction）较复杂，单独一个 subagent
  - Task 6（submit-message）必须在 Task 2-5 完成后
  - C10 整体可与 C6/C7 并行（H7 fallback 路径的另一端点）
- **Plan B 触发条件:**
  - 若 submit-message 的 yield* 委托 queryLoop 在集成测试中丢事件（Task 11 Step 2 失败），回退到 Task 6 前的状态，把 queryLoop 调用改为内联（牺牲模块化，保正确性），后续单独 PR 修复委托。
  - 若 EngineState.toLoopParams 的 this 绑定反复出错，改为显式参数传递（toLoopParams(state: EngineState)），放弃方法语法。
  - 若 compaction 的 API 调用在拆分后行为异常，Task 4 的 doCompaction 暂时返回原 messages 不压缩（降级模式），标记为已知降级并在后续 PR 修复。

---

**本 plan 实现 v2 spec §7.5（submitMessage 拆分 + H1 委托模式）+ §7.6（三层单向依赖）+ §9.2 C10 + §11 H1。**
