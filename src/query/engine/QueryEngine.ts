// biome-ignore-all assist/source/organizeImports: ANT-ONLY import markers must not be reordered
import { feature } from 'bun:bundle'
import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/messages.mjs'
import {
  cloneFileStateCache,
  type FileStateCache,
} from '../../utils/fileStateCache.js'
import { createAbortController } from '../../utils/abortController.js'
import { EMPTY_USAGE } from '@ant/model-provider'
import type { NonNullableUsage } from '@ant/model-provider'
import type {
  SDKMessage,
  SDKPermissionDenial,
  SDKStatus,
} from '../../entrypoints/agentSdkTypes.js'
import type { Message } from '../../types/message.js'
import { getSessionId } from '../../bootstrap/state.js'
import type { ToolUseContext } from '../../tools/core/index.js'

// 生产引擎内部状态类型与 submit-message 委托
import type { EngineMutableState, QueryEngineConfig } from './engine-state.js'
import { runSubmitMessageProduction } from './submit-message.js'

// Dead code elimination: conditional import for snip compaction
/* eslint-disable @typescript-eslint/no-require-imports */
const snipModule = feature('HISTORY_SNIP')
  ? (require('../../services/compact/snipCompact.js') as typeof import('../../services/compact/snipCompact.js'))
  : null
const snipProjection = feature('HISTORY_SNIP')
  ? (require('../../services/compact/snipProjection.js') as typeof import('../../services/compact/snipProjection.js'))
  : null
/* eslint-enable @typescript-eslint/no-require-imports */

export type { QueryEngineConfig } from './engine-state.js'

/**
 * QueryEngine owns the query lifecycle and session state for a conversation.
 * It extracts the core logic from ask() into a standalone class that can be
 * used by both the headless/SDK path and (in a future phase) the REPL.
 *
 * One QueryEngine per conversation. Each submitMessage() call starts a new
 * turn within the same conversation. State (messages, file cache, usage, etc.)
 * persists across turns.
 *
 * C10.5 迁移自 src/QueryEngine.ts（原 1369 行）。submitMessage 生成器逻辑
 * 委托给 ./submit-message.js::runSubmitMessageProduction（37 个 yield 行为
 * 零改变）。本类仅持有 EngineMutableState 并转发调用。
 */
export class QueryEngine {
  private config: QueryEngineConfig
  private mutableMessages: Message[]
  private abortController: AbortController
  private permissionDenials: SDKPermissionDenial[]
  private totalUsage: NonNullableUsage
  private hasHandledOrphanedPermission = false
  private readFileState: FileStateCache
  // Turn-scoped skill discovery tracking (feeds was_discovered on
  // tengu_skill_tool_invocation). Must persist across the two
  // processUserInputContext rebuilds inside submitMessage, but is cleared
  // at the start of each submitMessage to avoid unbounded growth across
  // many turns in SDK mode.
  private discoveredSkillNames = new Set<string>()
  private loadedNestedMemoryPaths = new Set<string>()

  constructor(config: QueryEngineConfig) {
    this.config = config
    this.mutableMessages = config.initialMessages ?? []
    this.abortController = config.abortController ?? createAbortController()
    this.permissionDenials = []
    this.readFileState = config.readFileCache
    this.totalUsage = EMPTY_USAGE
  }

  async *submitMessage(
    prompt: string | ContentBlockParam[],
    options?: { uuid?: string; isMeta?: boolean },
  ): AsyncGenerator<SDKMessage, void, unknown> {
    const state = this.getMutableState()
    yield* runSubmitMessageProduction(state, this.config, prompt, options)
    // 回写可能在 submitMessage 内部被 mutation 的字段
    this.mutableMessages = state.mutableMessages
    this.totalUsage = state.totalUsage
    this.hasHandledOrphanedPermission = state.hasHandledOrphanedPermission
  }

  interrupt(): void {
    this.abortController.abort()
  }

  /** Reset the abort controller so the next submitMessage() call can start
   *  with a fresh, non-aborted signal. Must be called after interrupt(). */
  resetAbortController(): void {
    this.abortController = createAbortController()
  }

  /** Expose the current abort signal for external consumers (e.g. ACP bridge). */
  getAbortSignal(): AbortSignal {
    return this.abortController.signal
  }

  getMessages(): readonly Message[] {
    return this.mutableMessages
  }

  getReadFileState(): FileStateCache {
    return this.readFileState
  }

  getSessionId(): string {
    return getSessionId()
  }

  setModel(model: string): void {
    this.config.userSpecifiedModel = model
  }

  /**
   * 构建可变状态对象（每次 submitMessage 调用时构建新引用，
   * 但内部数组/Set 通过引用共享，保持跨 turn 持久化语义）。
   */
  private getMutableState(): EngineMutableState {
    return {
      mutableMessages: this.mutableMessages,
      abortController: this.abortController,
      permissionDenials: this.permissionDenials,
      totalUsage: this.totalUsage,
      hasHandledOrphanedPermission: this.hasHandledOrphanedPermission,
      readFileState: this.readFileState,
      discoveredSkillNames: this.discoveredSkillNames,
      loadedNestedMemoryPaths: this.loadedNestedMemoryPaths,
      userSpecifiedModel: this.config.userSpecifiedModel,
    }
  }
}

/**
 * Sends a single prompt to the Claude API and returns the response.
 * Assumes that claude is being used non-interactively -- will not
 * ask the user for permissions or further input.
 *
 * Convenience wrapper around QueryEngine for one-shot usage.
 *
 * C10.5 迁移自 src/QueryEngine.ts ask 函数。
 */
export async function* ask({
  commands,
  prompt,
  promptUuid,
  isMeta,
  cwd,
  tools,
  mcpClients,
  verbose = false,
  thinkingConfig,
  maxTurns,
  maxBudgetUsd,
  taskBudget,
  canUseTool,
  mutableMessages = [],
  getReadFileCache,
  setReadFileCache,
  customSystemPrompt,
  appendSystemPrompt,
  userSpecifiedModel,
  fallbackModel,
  jsonSchema,
  getAppState,
  setAppState,
  abortController,
  replayUserMessages = false,
  includePartialMessages = false,
  handleElicitation,
  agents = [],
  setSDKStatus,
  orphanedPermission,
}: {
  commands: QueryEngineConfig['commands']
  prompt: string | Array<ContentBlockParam>
  promptUuid?: string
  isMeta?: boolean
  cwd: string
  tools: QueryEngineConfig['tools']
  verbose?: boolean
  mcpClients: QueryEngineConfig['mcpClients']
  thinkingConfig?: QueryEngineConfig['thinkingConfig']
  maxTurns?: number
  maxBudgetUsd?: number
  taskBudget?: { total: number }
  canUseTool: QueryEngineConfig['canUseTool']
  mutableMessages?: Message[]
  customSystemPrompt?: string
  appendSystemPrompt?: string
  userSpecifiedModel?: string
  fallbackModel?: string
  jsonSchema?: Record<string, unknown>
  getAppState: QueryEngineConfig['getAppState']
  setAppState: QueryEngineConfig['setAppState']
  getReadFileCache: () => FileStateCache
  setReadFileCache: (cache: FileStateCache) => void
  abortController?: AbortController
  replayUserMessages?: boolean
  includePartialMessages?: boolean
  handleElicitation?: ToolUseContext['handleElicitation']
  agents?: QueryEngineConfig['agents']
  setSDKStatus?: (status: SDKStatus) => void
  orphanedPermission?: QueryEngineConfig['orphanedPermission']
}): AsyncGenerator<SDKMessage, void, unknown> {
  const engine = new QueryEngine({
    cwd,
    tools,
    commands,
    mcpClients,
    agents: agents ?? [],
    canUseTool,
    getAppState,
    setAppState,
    initialMessages: mutableMessages,
    readFileCache: cloneFileStateCache(getReadFileCache()),
    customSystemPrompt,
    appendSystemPrompt,
    userSpecifiedModel,
    fallbackModel,
    thinkingConfig,
    maxTurns,
    maxBudgetUsd,
    taskBudget,
    jsonSchema,
    verbose,
    handleElicitation,
    replayUserMessages,
    includePartialMessages,
    setSDKStatus,
    abortController,
    orphanedPermission,
    ...(feature('HISTORY_SNIP')
      ? {
          snipReplay: (yielded: Message, store: Message[]) => {
            if (!snipProjection!.isSnipBoundaryMessage(yielded))
              return undefined
            return snipModule!.snipCompactIfNeeded(store, { force: true })
          },
        }
      : {}),
  })

  try {
    yield* engine.submitMessage(prompt, {
      uuid: promptUuid,
      isMeta,
    })
  } finally {
    setReadFileCache(engine.getReadFileState())
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 骨架 QueryEngine（H1 委托模式验证，C10 创建）
//
// 与生产 QueryEngine 并存：
//   - 生产 QueryEngine（上方）：被 print.ts / createSessionMethod.ts 使用
//   - 骨架 SkeletonQueryEngine（下方）：被 delegation.test.ts 验证 H1 委托模式
//
// 由于两者同名会导致 export 冲突，骨架版本改名为 SkeletonQueryEngine。
// engine-split.test.ts 也已更新使用 SkeletonQueryEngine。
// ────────────────────────────────────────────────────────────────────────────

import type { EngineState, QueryLoopParams, TurnEvent } from '../types.js'
import { runSubmitMessage } from './submit-message.js'
import { setInterrupted } from './interrupt.js'
import { clearMessages } from './messages-state.js'

/**
 * 会话级状态机（骨架版，瘦壳）。
 *
 * v2 spec §7.5：QueryEngine 持有 EngineState，
 * submitMessage 委托 runSubmitMessage（yield*）。
 *
 * 注：此为 C10 拆分的新骨架实现。生产 QueryEngine（本文件上方）是实际入口。
 * 本骨架用于验证 H1 委托模式与三层单向依赖。
 */
export class SkeletonQueryEngine {
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

  private initState(
    config: ConstructorParameters<typeof SkeletonQueryEngine>[0],
  ): EngineState {
    const state: EngineState = {
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
          messages: state.messages,
          tools: state.tools,
          systemPrompt: state.systemPrompt,
          model: state.model,
          sessionId: state.sessionId,
          cwd: state.cwd,
          permissionCtx: state.permissionCtx,
          apiConfig: state.apiConfig,
        }
      },
    }
    return state
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
 * ask 顶层函数（骨架版本）。
 *
 * 注：生产 ask（本文件上方）是实际入口（print.ts 等使用）。
 * 此骨架版本仅供委托模式测试使用，不替代生产 ask。
 */
export async function* skeletonAsk(
  prompt: string,
  config: ConstructorParameters<typeof SkeletonQueryEngine>[0],
): AsyncGenerator<TurnEvent> {
  const engine = new SkeletonQueryEngine(config)
  yield* engine.submitMessage({
    role: 'user',
    content: prompt,
  } as unknown as Message)
}
