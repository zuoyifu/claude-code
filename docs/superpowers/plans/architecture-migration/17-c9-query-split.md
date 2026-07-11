# C9: query.ts 2057 行拆分（含 L4 MVP 前置验证）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `src/query.ts`（2057 行）拆到 `src/query/api.ts` + `stream/` + `loop/` + `params.ts` + `types.ts`。先做 L4 MVP（拆 1-2 个 yield 块验证 `yield*` 委托可行），再全量拆分。每个子模块明确标注 H1 的三种委托模式（A: AsyncGenerator→yield*、B: Promise→await、C: 同步函数）。

**Architecture:** 按 v2 spec §7.2 三层单向依赖：`engine → loop → api`。`query.ts` 拆为 `query/api.ts`（单次 API 请求）+ `stream/`（流解码）+ `loop/`（turn 循环）。原文件在 PR 末尾删除。

**Tech Stack:** TypeScript + Bun + AsyncGenerator。

---

## File Structure

| 文件 | 责任 |
|------|------|
| `src/query/types.ts` | 新建：QueryLoopParams / TurnEvent / LoopState 类型 |
| `src/query/params.ts` | 新建：参数规范化 |
| `src/query/api.ts` | 新建：callApi 单次请求 |
| `src/query/stream/handlers.ts` | 新建：processStream（模式 B: Promise） |
| `src/query/stream/reducer.ts` | 新建：reduceMessage（模式 C） |
| `src/query/stream/tool-call-extractor.ts` | 新建：extractToolCalls（模式 C） |
| `src/query/loop/state.ts` | 新建：initLoopState / shouldContinue |
| `src/query/loop/index.ts` | 新建：queryLoop 主生成器（模式 A） |
| `src/query/loop/tool-dispatch.ts` | 新建：dispatchTools（模式 A: AsyncGenerator） |
| `src/query/loop/tool-result-merge.ts` | 新建：mergeToolResults（模式 A） |
| `src/query/loop/autonomy.ts` | 新建：decideAutonomy（模式 B: Promise） |
| `src/query/loop/output-validation.ts` | 新建：hitsOutputLimit（模式 C: boolean） |
| `src/query/loop/error-recovery.ts` | 新建：handleError（模式 A） |
| `src/query/__tests__/` | 新建：测试目录 |
| `src/query.ts` | **删除**（C9 结束） |
| `tests/integration/query-split.test.ts` | 新建：冒烟测试 |

---

## Task 1: L4 MVP 前置 —— 拆 1 个 yield 块验证 yield* 委托

**Files:**
- Create: `src/query/loop/tool-result-merge.ts`（临时位置）

**L4 要求：** 在全量拆分前，先拆 `queryLoop()` 中 1 个 yield 块到子模块，验证 `yield*` 委托模式可行。如果 MVP 失败，C9 转向 fallback（保留 query.ts 不动）。

- [ ] **Step 1: 定位 queryLoop 中的 tool-result-merge 块**

Run:
```bash
grep -n "tool_result\|toolResult\|mergeToolResult" src/query.ts | head -20
```

找到 `queryLoop()` 内处理 tool_result 合并的 yield 块（通常在收到 tool 执行结果后，把结果 merge 回 messages 并 yield 给上游）。

- [ ] **Step 2: 创建临时 MVP 模块**

```ts
// src/query/loop/tool-result-merge.ts（MVP 版本）
import type { Message } from '../../types/message.js'

/**
 * MVP：验证 yield* 委托模式。
 * 从 queryLoop() 中抽取的 tool result merge 逻辑。
 *
 * 委托模式 A（AsyncGenerator）：调用方用 yield* mergeToolResults(...)
 */
export async function* mergeToolResults(
  results: Array<{ toolUseId: string; result: unknown }>,
  messages: Message[],
): AsyncGenerator<{ type: string; [key: string]: unknown }> {
  for (const { toolUseId, result } of results) {
    const resultMessage: Message = {
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: toolUseId, content: result }],
    } as unknown as Message
    messages.push(resultMessage)
    yield { type: 'tool_result_merged', toolUseId, message: resultMessage }
  }
}
```

- [ ] **Step 3: 在 query.ts 中替换为 yield* 委托（实验性）**

在 query.ts 的 queryLoop() 内，把原 tool result merge 逻辑替换为：

```ts
// 原：内联 for 循环 yield
// 改：
yield* mergeToolResults(results, messages)
```

加 import：
```ts
import { mergeToolResults } from './query/loop/tool-result-merge.js'
```

- [ ] **Step 4: 跑现有 query 测试验证委托可行**

Run:
```bash
bun test tests/integration/message-pipeline.test.ts 2>&1 | tail -10
```

Expected: 测试通过（如果存在 message-pipeline 集成测试）。如果无此测试，跑全量：

```bash
bun test 2>&1 | grep -E "query|message" | head -10
```

- [ ] **Step 5: MVP 决策点**

**如果测试通过：** L4 验证成功，继续 Task 2 全量拆分。
**如果测试失败：** 记录失败原因，尝试修正委托模式。若 2 小时内无法修复，触发 Plan B（保留 query.ts 不动，跳过 C9，先做 C10 engine 拆分）。

- [ ] **Step 6: Commit MVP**

```bash
git add src/query/loop/tool-result-merge.ts src/query.ts
git commit -m "test: C9 L4 MVP - 验证 yield* 委托模式可行（tool-result-merge 块）"
```

---

## Task 2: 创建 query/types.ts 和 query/params.ts

**Files:**
- Create: `src/query/types.ts`、`params.ts`

- [ ] **Step 1: 写 types.ts**

```ts
// src/query/types.ts
import type { Message } from '../types/message.js'
import type { Tool } from '../tools/core/types.js'

/**
 * queryLoop 的输入参数。
 */
export interface QueryLoopParams {
  messages: Message[]
  tools: Tool[]
  systemPrompt: string
  model: string
  maxTokens?: number
  sessionId: string
  cwd: string
  permissionCtx: unknown
  apiConfig: {
    provider: string
    apiKey: string
    baseUrl?: string
  }
}

/**
 * turn 循环产生的事件（yield 给上游）。
 */
export type TurnEvent =
  | { type: 'assistant_message'; message: Message }
  | { type: 'tool_use'; toolName: string; input: unknown; toolUseId: string }
  | { type: 'tool_result'; toolUseId: string; result: unknown }
  | { type: 'tool_result_merged'; toolUseId: string; message: Message }
  | { type: 'stream_event'; event: unknown }
  | { type: 'error'; error: Error; recoverable: boolean }
  | { type: 'turn_complete'; turn: number }
  | { type: 'loop_end'; reason: string }

/**
 * loop 内部状态。
 */
export interface LoopState {
  params: QueryLoopParams
  turn: number
  messages: Message[]
  fatalError: boolean
  stopReason?: string
  lastAssistantMessage?: Message
  toolUseCount: number
  tokenUsage: { input: number; output: number }
}

/**
 * stream 处理结果。
 */
export interface StreamResult {
  message: Message
  toolCalls: Array<{ id: string; name: string; input: unknown }>
  stopReason: string
  usage: { input: number; output: number }
}

/**
 * autonomy 决策。
 */
export interface AutonomyDecision {
  shouldStop: boolean
  reason?: string
}
```

- [ ] **Step 2: 写 params.ts**

```ts
// src/query/params.ts
import type { QueryLoopParams } from './types.js'
import type { Message } from '../types/message.js'

/**
 * 规范化 queryLoop 参数。
 * 替代 query.ts 行 276-392 的 query() 函数参数处理。
 */
export function normalizeParams(
  raw: Partial<QueryLoopParams>,
): QueryLoopParams {
  if (!raw.messages) throw new Error('messages is required')
  if (!raw.model) throw new Error('model is required')
  if (!raw.sessionId) throw new Error('sessionId is required')

  return {
    messages: raw.messages,
    tools: raw.tools ?? [],
    systemPrompt: raw.systemPrompt ?? '',
    model: raw.model,
    maxTokens: raw.maxTokens ?? 8192,
    sessionId: raw.sessionId,
    cwd: raw.cwd ?? process.cwd(),
    permissionCtx: raw.permissionCtx,
    apiConfig: raw.apiConfig ?? {
      provider: 'firstParty',
      apiKey: process.env.ANTHROPIC_API_KEY ?? '',
    },
  }
}
```

- [ ] **Step 3: typecheck + Commit**

```bash
mkdir -p src/query/__tests__
bunx tsc --noEmit src/query/types.ts src/query/params.ts 2>&1 | head -10
git add src/query/{types,params}.ts
git commit -m "feat: C9 - 添加 query/types.ts + params.ts（QueryLoopParams + TurnEvent）"
```

---

## Task 3: 创建 query/api.ts（API 层）

**Files:**
- Create: `src/query/api.ts`

- [ ] **Step 1: 定位 query.ts 中的 API 调用逻辑**

Run:
```bash
grep -n "stream\|createMessage\|messages\.create" src/query.ts | head -20
```

找到调用 Anthropic SDK streaming 的部分。

- [ ] **Step 2: 写 api.ts**

```ts
// src/query/api.ts
import type { QueryLoopParams } from './types.js'

/**
 * 单次 API 请求 —— 返回流。
 * v2 spec §7.2: API 层不知道 turn 循环、不知道 session。
 */
export async function callApi(
  params: QueryLoopParams,
  messages: params['messages'],
): Promise<AsyncIterable<unknown>> {
  const client = await getClient(params.apiConfig)
  const stream = await client.messages.stream({
    model: params.model,
    max_tokens: params.maxTokens ?? 8192,
    system: params.systemPrompt,
    messages: messages as never,
    tools: params.tools.map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema,
    })),
  })
  return stream as AsyncIterable<unknown>
}

async function getClient(config: QueryLoopParams['apiConfig']): Promise<{
  messages: {
    stream: (req: unknown) => Promise<AsyncIterable<unknown>>
  }
}> {
  // 根据 provider 选择 client
  switch (config.provider) {
    case 'firstParty':
      const { Anthropic } = await import('@anthropic-ai/sdk')
      return new Anthropic({ apiKey: config.apiKey }) as never
    case 'openai':
      const { createOpenaiClient } = await import('../services/api/openai/client.js')
      return createOpenaiClient(config) as never
    case 'gemini':
      const { createGeminiClient } = await import('../services/api/gemini/client.js')
      return createGeminiClient(config) as never
    case 'grok':
      const { createGrokClient } = await import('../services/api/grok/client.js')
      return createGrokClient(config) as never
    default:
      throw new Error(`Unknown provider: ${config.provider}`)
  }
}
```

- [ ] **Step 3: typecheck + Commit**

```bash
bunx tsc --noEmit src/query/api.ts 2>&1 | head -10
git add src/query/api.ts
git commit -m "feat: C9 - 添加 query/api.ts（API 层，单次请求）"
```

---

## Task 4: 创建 stream/ 子模块（handlers + reducer + tool-call-extractor）

**Files:**
- Create: `src/query/stream/handlers.ts`、`reducer.ts`、`tool-call-extractor.ts`

- [ ] **Step 1: 写 handlers.ts（模式 B: Promise）**

```ts
// src/query/stream/handlers.ts
import type { StreamResult, LoopState } from '../types.js'
import { reduceMessage } from './reducer.js'
import { extractToolCalls } from './tool-call-extractor.js'

/**
 * 处理 API 流，返回聚合结果。
 * 委托模式 B（Promise<StreamResult>）：调用方 await。
 */
export async function processStream(
  stream: AsyncIterable<unknown>,
  state: LoopState,
): Promise<StreamResult> {
  let message = {} as never
  let stopReason = 'end_turn'
  let usage = { input: 0, output: 0 }

  for await (const event of stream) {
    const reduced = reduceMessage(message, event)
    message = reduced.message

    if ((event as { type: string }).type === 'message_stop') {
      stopReason = (event as { message?: { stop_reason?: string } }).message?.stop_reason ?? 'end_turn'
    }
    if ((event as { type: string }).type === 'message_delta') {
      const delta = (event as { usage?: { input?: number; output?: number } }).usage
      if (delta) usage = { input: usage.input + (delta.input ?? 0), output: usage.output + (delta.output ?? 0) }
    }
  }

  const toolCalls = extractToolCalls(message)
  state.tokenUsage.input += usage.input
  state.tokenUsage.output += usage.output

  return { message, toolCalls, stopReason, usage }
}
```

- [ ] **Step 2: 写 reducer.ts（模式 C: 同步）**

```ts
// src/query/stream/reducer.ts
import type { Message } from '../../types/message.js'

/**
 * 把流事件 reduce 到消息对象。
 * 委托模式 C（同步函数）：调用方直接调用。
 */
export function reduceMessage(
  acc: Message,
  event: unknown,
): { message: Message } {
  const evt = event as { type: string; [key: string]: unknown }
  // 从 query.ts 流处理逻辑搬移
  // 处理 content_block_start / content_block_delta / content_block_stop
  // 累积 text / tool_use blocks
  switch (evt.type) {
    case 'content_block_start':
      // 初始化新 block
      break
    case 'content_block_delta':
      // 追加 delta 到当前 block
      break
    case 'content_block_stop':
      // 结束当前 block
      break
  }
  return { message: acc }
}
```

**操作：** 从 query.ts 原流处理代码搬移 reduce 逻辑。

- [ ] **Step 3: 写 tool-call-extractor.ts（模式 C）**

```ts
// src/query/stream/tool-call-extractor.ts
import type { Message } from '../../types/message.js'

/**
 * 从消息中提取 tool_use 调用。
 * 委托模式 C（同步函数）。
 */
export function extractToolCalls(
  message: Message,
): Array<{ id: string; name: string; input: unknown }> {
  const content = (message as { content?: unknown[] }).content
  if (!Array.isArray(content)) return []

  return content
    .filter((block): block is { type: 'tool_use'; id: string; name: string; input: unknown } =>
      (block as { type: string }).type === 'tool_use',
    )
    .map(block => ({
      id: block.id,
      name: block.name,
      input: block.input,
    }))
}
```

- [ ] **Step 4: 写单测**

Create `src/query/stream/__tests__/tool-call-extractor.test.ts`:

```ts
import { describe, test, expect } from 'bun:test'
import { extractToolCalls } from '../tool-call-extractor.ts'

describe('extractToolCalls', () => {
  test('空消息返回空数组', () => {
    expect(extractToolCalls({} as never)).toEqual([])
  })

  test('提取 tool_use blocks', () => {
    const msg = {
      content: [
        { type: 'text', text: 'hello' },
        { type: 'tool_use', id: '1', name: 'Bash', input: { cmd: 'ls' } },
        { type: 'tool_use', id: '2', name: 'Read', input: { path: '/a' } },
      ],
    } as never
    const calls = extractToolCalls(msg)
    expect(calls).toHaveLength(2)
    expect(calls[0].name).toBe('Bash')
  })
})
```

- [ ] **Step 5: typecheck + 测试 + Commit**

```bash
mkdir -p src/query/stream/__tests__
bunx tsc --noEmit src/query/stream/ 2>&1 | head -10
bun test src/query/stream/__tests__/tool-call-extractor.test.ts
git add src/query/stream/
git commit -m "feat: C9 - 添加 query/stream/（handlers + reducer + tool-call-extractor）"
```

---

## Task 5: 创建 loop/state.ts + loop/tool-dispatch.ts

**Files:**
- Create: `src/query/loop/state.ts`、`tool-dispatch.ts`

- [ ] **Step 1: 写 state.ts**

```ts
// src/query/loop/state.ts
import type { LoopState, QueryLoopParams } from '../types.js'

export function initLoopState(params: QueryLoopParams): LoopState {
  return {
    params,
    turn: 0,
    messages: [...params.messages],
    fatalError: false,
    toolUseCount: 0,
    tokenUsage: { input: 0, output: 0 },
  }
}

export function shouldContinue(state: LoopState): boolean {
  if (state.fatalError) return false
  if (state.stopReason === 'end_turn') return false
  if (state.turn >= (state.params.maxTokens ?? 100)) return false
  return true
}
```

- [ ] **Step 2: 写 tool-dispatch.ts（模式 A: AsyncGenerator）**

```ts
// src/query/loop/tool-dispatch.ts
import type { LoopState, TurnEvent } from '../types.js'
import type { Tool } from '../../tools/core/types.js'

/**
 * 派发工具调用，yield 执行事件。
 * 委托模式 A（AsyncGenerator）：调用方 yield* dispatchTools(...)。
 */
export async function* dispatchTools(
  toolCalls: Array<{ id: string; name: string; input: unknown }>,
  state: LoopState,
): AsyncGenerator<TurnEvent> {
  const toolsByName = new Map<string, Tool>(
    state.params.tools.map(t => [t.name, t]),
  )

  for (const call of toolCalls) {
    const tool = toolsByName.get(call.name)
    if (!tool) {
      yield { type: 'error', error: new Error(`Tool not found: ${call.name}`), recoverable: true }
      continue
    }

    yield { type: 'tool_use', toolName: call.name, input: call.input, toolUseId: call.id }

    try {
      const { runToolUse } = await import('../../tools/execution/run-tool-use.js')
      const result = await runToolUse(tool, call.input, {
        cwd: state.params.cwd,
        permissionCtx: state.params.permissionCtx,
        messages: state.messages,
      })
      yield { type: 'tool_result', toolUseId: call.id, result }
      state.toolUseCount++
    } catch (err) {
      yield { type: 'error', error: err as Error, recoverable: true }
    }
  }
}
```

- [ ] **Step 3: typecheck + Commit**

```bash
bunx tsc --noEmit src/query/loop/state.ts src/query/loop/tool-dispatch.ts 2>&1 | head -10
git add src/query/loop/state.ts src/query/loop/tool-dispatch.ts
git commit -m "feat: C9 - 添加 loop/state + loop/tool-dispatch（模式 A yield*）"
```

---

## Task 6: 创建 loop/autonomy.ts + output-validation.ts + error-recovery.ts

**Files:**
- Create: 3 个文件

- [ ] **Step 1: autonomy.ts（模式 B: Promise）**

```ts
// src/query/loop/autonomy.ts
import type { LoopState, AutonomyDecision } from '../types.js'

/**
 * 自主性决策：是否继续循环。
 * 委托模式 B（Promise<AutonomyDecision>）：调用方 await。
 */
export async function decideAutonomy(state: LoopState): Promise<AutonomyDecision> {
  // 从 query.ts autonomy 逻辑搬移
  if (state.stopReason === 'stop_sequence') {
    return { shouldStop: true, reason: 'stop_sequence' }
  }
  if (state.toolUseCount > 50) {
    return { shouldStop: true, reason: 'tool_use_limit' }
  }
  return { shouldStop: false }
}
```

- [ ] **Step 2: output-validation.ts（模式 C: boolean）**

```ts
// src/query/loop/output-validation.ts
import type { LoopState } from '../types.js'

/**
 * 检查是否达到输出限制。
 * 委托模式 C（同步函数返回 boolean）。
 */
export function hitsOutputLimit(state: LoopState): boolean {
  const maxOutput = 100000 // 从 config 读
  return state.tokenUsage.output >= maxOutput
}
```

- [ ] **Step 3: error-recovery.ts（模式 A: AsyncGenerator）**

```ts
// src/query/loop/error-recovery.ts
import type { LoopState, TurnEvent } from '../types.js'

/**
 * 错误恢复：yield 错误事件，更新 state。
 * 委托模式 A（AsyncGenerator）：调用方 yield* handleError(...)。
 */
export async function* handleError(
  err: Error,
  state: LoopState,
): AsyncGenerator<TurnEvent> {
  const recoverable = isRecoverable(err)
  yield { type: 'error', error: err, recoverable }

  if (!recoverable) {
    state.fatalError = true
    state.stopReason = 'fatal_error'
  }
}

function isRecoverable(err: Error): boolean {
  const msg = err.message.toLowerCase()
  if (msg.includes('rate limit')) return true
  if (msg.includes('timeout')) return true
  if (msg.includes('overloaded')) return true
  return false
}
```

- [ ] **Step 4: typecheck + Commit**

```bash
bunx tsc --noEmit src/query/loop/ 2>&1 | head -10
git add src/query/loop/{autonomy,output-validation,error-recovery}.ts
git commit -m "feat: C9 - 添加 loop/autonomy（B）+ output-validation（C）+ error-recovery（A）"
```

---

## Task 7: 创建 loop/index.ts（queryLoop 主生成器）

**Files:**
- Create: `src/query/loop/index.ts`

- [ ] **Step 1: 写 loop/index.ts**

```ts
// src/query/loop/index.ts (<300 行)
import type { QueryLoopParams, TurnEvent, LoopState } from '../types.js'
import { callApi } from '../api.js'
import { processStream } from '../stream/handlers.js'
import { extractToolCalls } from '../stream/tool-call-extractor.js'
import { dispatchTools } from './tool-dispatch.js'
import { mergeToolResults } from './tool-result-merge.js'
import { decideAutonomy } from './autonomy.js'
import { hitsOutputLimit } from './output-validation.js'
import { handleError } from './error-recovery.js'
import { initLoopState, shouldContinue } from './state.js'

/**
 * queryLoop 主循环生成器。
 * 委托模式 A（AsyncGenerator<TurnEvent>）：被 engine/submit-message.ts 用 yield*。
 *
 * v2 spec §7.4 H1：每个子模块的委托模式已明确标注。
 */
export async function* queryLoop(params: QueryLoopParams): AsyncGenerator<TurnEvent> {
  const state = initLoopState(params)

  while (shouldContinue(state)) {
    state.turn++
    try {
      // 1. 调 API（api 层）
      const stream = await callApi(state.params, state.messages)

      // 2. 处理流（模式 B: await）
      const streamResult = await processStream(stream, state)

      // 3. 更新 messages（模式 C）
      state.messages.push(streamResult.message)
      state.lastAssistantMessage = streamResult.message
      state.stopReason = streamResult.stopReason

      yield { type: 'assistant_message', message: streamResult.message }

      // 4. 派发工具（模式 A: yield*）
      if (streamResult.toolCalls.length > 0) {
        yield* dispatchTools(streamResult.toolCalls, state)
        yield* mergeToolResults(
          state.messages
            .filter((m): m is { tool_use_id?: string; result?: unknown } => 'tool_result' in (m as object))
            .map(m => ({ toolUseId: m.tool_useId ?? '', result: m.result })),
          state.messages,
        )
      }

      // 5. autonomy 决策（模式 B: await）
      const decision = await decideAutonomy(state)
      if (decision.shouldStop) {
        yield { type: 'turn_complete', turn: state.turn }
        break
      }

      // 6. 输出限制检查（模式 C）
      if (hitsOutputLimit(state)) {
        yield { type: 'loop_end', reason: 'output_limit' }
        break
      }

      yield { type: 'turn_complete', turn: state.turn }
    } catch (err) {
      // 7. 错误恢复（模式 A: yield*）
      yield* handleError(err as Error, state)
      if (state.fatalError) {
        yield { type: 'loop_end', reason: 'fatal_error' }
        break
      }
    }
  }
}
```

- [ ] **Step 2: typecheck**

Run:
```bash
bunx tsc --noEmit src/query/loop/index.ts 2>&1 | head -20
```

Expected: 零错误。

- [ ] **Step 3: 验证行数 < 300**

Run:
```bash
wc -l src/query/loop/index.ts
```

Expected: < 300 行。

- [ ] **Step 4: Commit**

```bash
git add src/query/loop/index.ts
git commit -m "feat: C9 - 添加 loop/index.ts queryLoop 主生成器（模式 A，<300 行）"
```

---

## Task 8: 更新 query.ts 为 re-export shim（过渡）

**Files:**
- Modify: `src/query.ts`

- [ ] **Step 1: 把 query.ts 改为 re-export**

```ts
// src/query.ts（过渡 shim —— 在本 Task 结束时删除）
/**
 * @deprecated 使用 src/query/ 目录下的模块。
 * 本文件保留用于平滑过渡，C9 结束时删除。
 */
export { queryLoop } from './query/loop/index.js'
export { callApi } from './query/api.js'
export type { QueryLoopParams, TurnEvent, LoopState } from './query/types.js'
```

- [ ] **Step 2: 跑全项目 typecheck 验证引用方无破坏**

Run:
```bash
bunx tsc --noEmit 2>&1 | head -20
```

Expected: 零错误。如果有 "Property 'xxx' not found on query"，说明原 query.ts 导出的某函数未迁移，补到对应子模块。

- [ ] **Step 3: 跑集成测试验证委托正确**

Run:
```bash
bun test tests/integration/message-pipeline.test.ts 2>&1 | tail -10
```

Expected: 通过。

---

## Task 9: 删除 query.ts

**Files:**
- Delete: `src/query.ts`

- [ ] **Step 1: 确认无外部引用 query.ts**

Use Grep tool:
- Pattern: `from '(\.\./)+query(\.js)?'`
- Path: `/Users/konghayao/code/ai/claude-code/src`
- Output mode: `files_with_matches`

注意：`from './query/...'`（带斜杠）是引用新目录，**不算**旧引用。只关注 `from './query.js'` 或 `from './query'`（无斜杠）。

如有残留，改为引用 `./query/loop/index.js` 或 `./query/api.js`。

- [ ] **Step 2: 删除 query.ts**

Run:
```bash
git rm src/query.ts
```

- [ ] **Step 3: 跑全项目 typecheck**

Run:
```bash
bunx tsc --noEmit 2>&1 | head -20
```

Expected: 零错误。

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: C9 - 删除 src/query.ts（2057 行拆分到 query/ 目录，H1 委托模式验证通过）"
```

---

## Task 10: 写冒烟集成测试

**Files:**
- Create: `tests/integration/query-split.test.ts`

- [ ] **Step 1: 写测试**

Create `tests/integration/query-split.test.ts`:

```ts
import { describe, test, expect } from 'bun:test'
import { existsSync } from 'node:fs'
import path from 'node:path'

const SRC = path.resolve(process.cwd(), 'src/query')

describe('C9 query split', () => {
  test('query.ts 已删除', () => {
    expect(existsSync(path.resolve(process.cwd(), 'src/query.ts'))).toBe(false)
  })

  test('query/ 目录含关键文件', () => {
    const expected = ['api.ts', 'types.ts', 'params.ts',
      'loop/index.ts', 'loop/tool-dispatch.ts', 'loop/tool-result-merge.ts',
      'loop/autonomy.ts', 'loop/output-validation.ts', 'loop/error-recovery.ts',
      'stream/handlers.ts', 'stream/reducer.ts', 'stream/tool-call-extractor.ts']
    for (const f of expected) {
      expect(existsSync(path.join(SRC, f))).toBe(true, `Missing: ${f}`)
    }
  })

  test('queryLoop 是 AsyncGenerator 函数', async () => {
    const mod = await import('../../src/query/loop/index.ts')
    expect(typeof mod.queryLoop).toBe('function')
    // 验证返回 AsyncGenerator
    const fakeParams = { messages: [], tools: [], systemPrompt: '', model: 'x', sessionId: 's', cwd: '/', permissionCtx: {}, apiConfig: { provider: 'firstParty', apiKey: '' } }
    const gen = mod.queryLoop(fakeParams)
    expect(typeof gen.next).toBe('function')
    expect(typeof gen[Symbol.asyncIterator]).toBe('function')
  })

  test('dispatchTools 返回 AsyncGenerator', async () => {
    const mod = await import('../../src/query/loop/tool-dispatch.ts')
    const state = { params: { tools: [] }, messages: [], turn: 0, fatalError: false, toolUseCount: 0, tokenUsage: { input: 0, output: 0 } }
    const gen = mod.dispatchTools([], state as never)
    expect(typeof gen.next).toBe('function')
  })

  test('decideAutonomy 返回 Promise', async () => {
    const mod = await import('../../src/query/loop/autonomy.ts')
    const state = { stopReason: 'end_turn', toolUseCount: 0 } as never
    const result = mod.decideAutonomy(state)
    expect(result).toBeInstanceOf(Promise)
    const decision = await result
    expect(decision.shouldStop).toBe(true)
  })

  test('hitsOutputLimit 返回 boolean', async () => {
    const mod = await import('../../src/query/loop/output-validation.ts')
    const state = { tokenUsage: { output: 50 } } as never
    const result = mod.hitsOutputLimit(state)
    expect(typeof result).toBe('boolean')
  })

  test('extractToolCalls 返回数组', async () => {
    const mod = await import('../../src/query/stream/tool-call-extractor.ts')
    const result = mod.extractToolCalls({} as never)
    expect(Array.isArray(result)).toBe(true)
  })

  test('loop/index.ts < 300 行', () => {
    const content = require('node:fs').readFileSync(
      path.join(SRC, 'loop/index.ts'), 'utf8',
    )
    expect(content.split('\n').length).toBeLessThan(300)
  })

  test('无文件引用旧 query.js', () => {
    const { execSync } = require('node:child_process')
    const output = execSync(
      "grep -rn \"from '.*query\\.js'\" src/ 2>/dev/null | grep -v 'query/' || true",
      { cwd: process.cwd() },
    ).toString().trim()
    expect(output).toBe('')
  })
})
```

- [ ] **Step 2: 跑测试**

Run:
```bash
bun test tests/integration/query-split.test.ts
```

Expected: 9 tests pass。

- [ ] **Step 3: Commit**

```bash
git add tests/integration/query-split.test.ts
git commit -m "test: C9 - query 拆分冒烟测试（H1 委托模式验证）"
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

- [ ] **Step 2: 跑 message-pipeline 集成测试（L4 强制）**

Run:
```bash
bun test tests/integration/message-pipeline.test.ts 2>&1 | tail -10
```

Expected: 通过。这是 L4 的最终验证——query 流行为不变。

- [ ] **Step 3: 跑 build**

Run:
```bash
bun run build 2>&1 | tail -5
```

Expected: 构建成功。

- [ ] **Step 4: 跑 dependency-cruiser 验证 query/ 单向依赖**

Run:
```bash
bunx depcruise src/query --config 2>&1 | grep -E 'query-loop|query-api' | head -5
```

Expected: 零 warning（api 不 import loop、loop 不 import engine）。

- [ ] **Step 5: Commit**

```bash
git commit --allow-empty -m "chore: C9 完成 - query.ts 2057 行拆分 + L4 MVP 验证 + H1 委托模式"
```

---

## Risk

| 风险 | 严重度 | 缓解 |
|------|--------|------|
| H1 yield 委托错误（静默丢事件/死循环） | 极高 | Task 1 L4 MVP 强制前置；Task 11 Step 2 message-pipeline 验证 |
| L4 MVP 失败 | 高 | Task 1 Step 5 决策点：失败则触发 Plan B |
| 43 个 yield 块拆分遗漏 | 高 | Task 8 Step 2 tsc 全量检查；Grep 残留 |
| tool-dispatch 的 runToolUse import 路径（C1 后）错误 | 中 | Task 5 Step 2 用 `../../tools/execution/` 路径 |
| stream 处理逻辑搬移后 reducer 行为变化 | 高 | Task 4 Step 2 从 query.ts 原样搬移；Task 11 Step 2 集成测试 |
| autonomy 决策逻辑搬移后循环不终止 | 高 | Task 6 Step 1 保留原 stop 条件；Task 11 集成测试 |
| C9 与 C6/C7 并行时的 merge 冲突 | 中 | C9 独立于 cli/ 目录，冲突面小 |

---

## Workflow Adaptation

- **PR ID:** C9（H7 fallback 路径主线）
- **依赖:** C2（async getTools，query 引用 tools/execution）
- **被依赖:** C10（QueryEngine 拆分引用 query/loop）
- **推荐 maxConcurrency:** 1（内部串行，L4 MVP 是硬门槛）
- **建议 phases:**
  1. `MVP` — L4 前置验证（Task 1，关键门槛）
  2. `Types` — types.ts + params.ts（Task 2）
  3. `Api` — api.ts API 层（Task 3）
  4. `Stream` — stream/ 3 个子模块（Task 4）
  5. `Loop-Helpers` — state + tool-dispatch（Task 5）
  6. `Loop-More` — autonomy + output-validation + error-recovery（Task 6）
  7. `Loop-Index` — queryLoop 主生成器（Task 7）
  8. `Shim` — query.ts 过渡（Task 8）
  9. `Delete` — 删除 query.ts（Task 9）
  10. `Test` — 冒烟测试（Task 10）
  11. `Verify` — precheck + build + message-pipeline（Task 11）
- **验证 schema:**
  ```js
  {
    type: 'object',
    properties: {
      l4MvpPassed: { type: 'boolean' },
      typesCreated: { type: 'boolean' },
      apiCreated: { type: 'boolean' },
      streamCreated: { type: 'boolean' },
      loopCreated: { type: 'boolean' },
      queryTsDeleted: { type: 'boolean' },
      loopIndexUnder300: { type: 'boolean' },
      yieldDelegationCorrect: { type: 'boolean' },
      messagePipelinePass: { type: 'boolean' },
      unitTestsPass: { type: 'boolean' },
      precheckPass: { type: 'boolean' },
      buildPass: { type: 'boolean' },
      depcruiseQueryRulesZero: { type: 'boolean' }
    },
    required: ['l4MvpPassed', 'loopCreated', 'queryTsDeleted', 'messagePipelinePass', 'precheckPass']
  }
  ```
- **可并行点:**
  - Task 4（stream/）与 Task 5-6（loop/ helpers）可由 2 个 subagent 并行（stream 和 loop 互相独立，都依赖 Task 2 的 types）
  - Task 7（loop/index.ts）必须在 Task 4-6 完成后
  - C9 整体可与 C6/C7 并行（H7 fallback 路径）
- **Plan B 触发条件（H7 + L4）:**
  - **L4 失败：** Task 1 Step 5 决策点。保留 query.ts 不动，C9 标记为"需重新设计委托模式"，跳到 C10 先做 engine 拆分（engine 不涉及 yield* 委托）。
  - **C6 阻塞触发：** 如果 C6 在第 8 天未完成，把所有资源切到 C9→C10，先拿到 query/engine 拆分收益。
  - **message-pipeline 测试失败：** Task 11 Step 2。回退到 Task 8 的 shim 状态，逐个子模块二分定位委托错误。

---

**本 plan 实现 v2 spec §7.1-7.4 + §7.6-7.7 + §11 H1（yield 委托模式）+ §11 L4（MVP 前置）+ §11 H7（fallback 路径）。**
