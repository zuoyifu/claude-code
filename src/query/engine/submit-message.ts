// biome-ignore-all assist/source/organizeImports: ANT-ONLY import markers must not be reordered
import { feature } from 'bun:bundle'
import { randomUUID } from 'crypto'
import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/messages.mjs'
import {
  getSessionId,
  isSessionPersistenceDisabled,
} from '../../bootstrap/state.js'
import type {
  PermissionMode,
  SDKCompactBoundaryMessage,
  SDKMessage,
  SDKPermissionDenial,
  SDKStatus,
  SDKUserMessageReplay,
} from '../../entrypoints/agentSdkTypes.js'
import { EMPTY_USAGE } from '@ant/model-provider'
import type { NonNullableUsage } from '@ant/model-provider'
import stripAnsi from 'strip-ansi'
import { getSlashCommandToolSkills } from '../../commands/_registry/registry.js'
import {
  LOCAL_COMMAND_STDERR_TAG,
  LOCAL_COMMAND_STDOUT_TAG,
} from '../../constants/xml.js'
import {
  getModelUsage,
  getTotalAPIDuration,
  getTotalCost,
} from '../../cost-tracker.js'
import { getCwd } from '../../utils/cwd.js'
import { isEnvTruthy } from '../../utils/envUtils.js'
import { getFastModeState } from '../../utils/fastMode.js'
import { headlessProfilerCheckpoint } from '../../utils/headlessProfiler.js'
import { getInMemoryErrors } from '../../utils/log.js'
import { countToolCalls, SYNTHETIC_MESSAGES } from '../../utils/messages.js'
import {
  getMainLoopModel,
  parseUserSpecifiedModel,
} from '../../utils/model/model.js'
import { loadAllPluginsCacheOnly } from '../../utils/plugins/pluginLoader.js'
import {
  type ProcessUserInputContext,
  processUserInput,
} from '../../utils/processUserInput/processUserInput.js'
import { fetchSystemPromptParts } from '../../utils/queryContext.js'
import { setCwd } from '../../utils/Shell.js'
import {
  flushSessionStorage,
  recordTranscript,
} from '../../utils/sessionStorage.js'
import {
  shouldEnableThinkingByDefault,
  type ThinkingConfig,
} from '../../utils/thinking.js'
import { sdkCompatToolName } from '../../utils/messages/systemInit.js'
import { buildSystemInitMessage } from '../../utils/messages/systemInit.js'
import {
  localCommandOutputToSDKAssistantMessage,
  toSDKCompactMetadata,
} from '../../utils/messages/mappers.js'
import {
  handleOrphanedPermission,
  isResultSuccessful,
  normalizeMessage,
} from '../../utils/queryHelpers.js'
import type {
  Message,
  SystemCompactBoundaryMessage,
} from '../../types/message.js'
import type { APIError } from '@anthropic-ai/sdk'
import { query } from '../loop/production.js'
import { accumulateUsage, updateUsage } from '../../services/api/claude.js'
import { categorizeRetryableAPIError } from '../../services/api/errors.js'
import { SYNTHETIC_OUTPUT_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/SyntheticOutputTool/SyntheticOutputTool.js'
import { resolveThemeSetting } from '../../utils/systemTheme.js'
import { getGlobalConfig } from '../../utils/config.js'
import { toolMatchesName } from '../../tools/core/index.js'
import type { AppState } from '../../state/AppState.js'
import type { FileHistoryState } from '../../utils/fileHistory.js'
import type { AttributionState } from '../../utils/commitAttribution.js'
import { asSystemPrompt } from '../../utils/systemPromptType.js'
import {
  getScratchpadDir,
  isScratchpadEnabled,
} from '../../utils/permissions/filesystem.js'
import { loadMemoryPrompt } from '../../memdir/memdir.js'
import { hasAutoMemPathOverride } from '../../memdir/paths.js'
import { registerStructuredOutputEnforcement } from '../../utils/hooks/hookHelpers.js'

// 引擎内部状态类型与辅助子模块
import type {
  EngineMutableState,
  QueryEngineConfig,
  ResolvedEngineConfig,
} from './engine-state.js'
import {
  appendMessages,
  findLastIndexByUuid,
  releasePreBoundaryMessages,
  replaceMessagesInPlace,
  snapshotMessages,
} from './messages-state.js'
import {
  flushBeforeResult,
  persistLocalCommandTranscript,
  persistLoopMessage,
  persistUserInputTranscript,
} from './session-persist.js'
import { snapshotUserInputHistory } from './file-history.js'

// Lazy: MessageSelector.tsx pulls React/ink; only needed for message filtering at query time
/* eslint-disable @typescript-eslint/no-require-imports */
const messageSelector = ():
  | typeof import('../../components/MessageSelector.js')
  | null => {
  try {
    return require('../../components/MessageSelector.js')
  } catch {
    return null
  }
}

// Dead code elimination: conditional import for coordinator mode
const getCoordinatorUserContext: (
  mcpClients: ReadonlyArray<{ name: string }>,
  scratchpadDir?: string,
) => { [k: string]: string } = feature('COORDINATOR_MODE')
  ? require('../../coordinator/coordinatorMode.js').getCoordinatorUserContext
  : () => ({})

/**
 * 生产 submitMessage 主生成器（C10.5 迁移自 src/QueryEngine.ts）。
 *
 * yield* 委托点（原 37 个 yield 行为零改变）：
 *   #1  orphanedPermission → handleOrphanedPermission
 *   #2  buildSystemInitMessage
 *   #3-#7  local command / compact_boundary / result（shouldQuery=false 分支）
 *   #8  messagesToAck replay（循环内首次 assistant/user/boundary）
 *   #9-#19  循环内 normalizeMessage yield*（assistant/progress/user）
 *   #20  stream_event（includePartialMessages）
 *   #21-#24  attachment（max_turns_reached / queued_command）
 *   #25-#27  system（compact_boundary / api_retry）
 *   #28  tool_use_summary
 *   #29  budget 超限 result
 *   #30  structured output retry 超限 result
 *   #31  error_during_execution result
 *   #32  success result
 *
 * 注：与骨架 runSubmitMessage 是两个不同实现：
 *   - 骨架 runSubmitMessage（query/types.ts EngineState）：H1 委托模式验证
 *   - 本 runSubmitMessageProduction：生产 QueryEngine.submitMessage 的实际实现
 */
export async function* runSubmitMessageProduction(
  state: EngineMutableState,
  config: QueryEngineConfig,
  prompt: string | ContentBlockParam[],
  options?: { uuid?: string; isMeta?: boolean },
): AsyncGenerator<SDKMessage, void, unknown> {
  const resolvedConfig = resolveConfig(config)

  setCwd(resolvedConfig.cwd)
  state.discoveredSkillNames.clear()
  state.permissionDenials = []
  const persistSession = !isSessionPersistenceDisabled()
  const startTime = Date.now()

  const wrappedCanUseTool = createWrappedCanUseTool(
    resolvedConfig.canUseTool,
    state,
  )

  const initialAppState = resolvedConfig.getAppState()
  const initialMainLoopModel = resolvedConfig.userSpecifiedModel
    ? parseUserSpecifiedModel(resolvedConfig.userSpecifiedModel)
    : getMainLoopModel()

  const initialThinkingConfig: ThinkingConfig = resolvedConfig.thinkingConfig
    ? resolvedConfig.thinkingConfig
    : shouldEnableThinkingByDefault() !== false
      ? { type: 'adaptive' }
      : { type: 'disabled' }

  headlessProfilerCheckpoint('before_getSystemPrompt')
  const customPrompt =
    typeof resolvedConfig.customSystemPrompt === 'string'
      ? resolvedConfig.customSystemPrompt
      : undefined
  const {
    defaultSystemPrompt,
    userContext: baseUserContext,
    systemContext,
  } = await fetchSystemPromptParts({
    tools: resolvedConfig.tools,
    mainLoopModel: initialMainLoopModel,
    additionalWorkingDirectories: Array.from(
      initialAppState.toolPermissionContext.additionalWorkingDirectories.keys(),
    ),
    mcpClients: resolvedConfig.mcpClients,
    customSystemPrompt: customPrompt,
  })
  headlessProfilerCheckpoint('after_getSystemPrompt')
  const userContext = {
    ...baseUserContext,
    ...getCoordinatorUserContext(
      resolvedConfig.mcpClients,
      isScratchpadEnabled() ? getScratchpadDir() : undefined,
    ),
  }

  const memoryMechanicsPrompt =
    customPrompt !== undefined && hasAutoMemPathOverride()
      ? await loadMemoryPrompt()
      : null

  const systemPrompt = asSystemPrompt([
    ...(customPrompt !== undefined ? [customPrompt] : defaultSystemPrompt),
    ...(memoryMechanicsPrompt ? [memoryMechanicsPrompt] : []),
    ...(resolvedConfig.appendSystemPrompt
      ? [resolvedConfig.appendSystemPrompt]
      : []),
  ])

  const hasStructuredOutputTool = resolvedConfig.tools.some(t =>
    toolMatchesName(t, SYNTHETIC_OUTPUT_TOOL_NAME),
  )
  if (resolvedConfig.jsonSchema && hasStructuredOutputTool) {
    registerStructuredOutputEnforcement(
      resolvedConfig.setAppState,
      getSessionId(),
    )
  }

  let processUserInputContext: ProcessUserInputContext =
    buildProcessUserInputContext1({
      mutableMessages: state.mutableMessages,
      loadedNestedMemoryPaths: state.loadedNestedMemoryPaths,
      discoveredSkillNames: state.discoveredSkillNames,
      abortController: state.abortController,
      readFileState: state.readFileState,
      handleElicitation: resolvedConfig.handleElicitation,
      agents: resolvedConfig.agents,
      commands: resolvedConfig.commands,
      tools: resolvedConfig.tools,
      mcpClients: resolvedConfig.mcpClients,
      verbose: resolvedConfig.verbose,
      mainLoopModel: initialMainLoopModel,
      thinkingConfig: initialThinkingConfig,
      customSystemPrompt: resolvedConfig.customSystemPrompt,
      appendSystemPrompt: resolvedConfig.appendSystemPrompt,
      maxBudgetUsd: resolvedConfig.maxBudgetUsd,
      getAppState: resolvedConfig.getAppState,
      setAppState: resolvedConfig.setAppState,
      setSDKStatus: resolvedConfig.setSDKStatus,
      setMessagesTarget: state,
    })

  // Orphaned permission（仅一次）
  if (
    resolvedConfig.orphanedPermission &&
    !state.hasHandledOrphanedPermission
  ) {
    state.hasHandledOrphanedPermission = true
    for await (const message of handleOrphanedPermission(
      resolvedConfig.orphanedPermission,
      resolvedConfig.tools,
      state.mutableMessages,
      processUserInputContext,
    )) {
      yield message
    }
  }

  const {
    messages: messagesFromUserInput,
    shouldQuery,
    allowedTools,
    model: modelFromUserInput,
    resultText,
  } = await processUserInput({
    input: prompt,
    mode: 'prompt',
    setToolJSX: () => {},
    context: {
      ...processUserInputContext,
      messages: state.mutableMessages,
    },
    messages: state.mutableMessages,
    uuid: options?.uuid,
    isMeta: options?.isMeta,
    querySource: 'sdk',
  })

  appendMessages(state.mutableMessages, messagesFromUserInput)
  const messages = snapshotMessages(state.mutableMessages)

  await persistUserInputTranscript(
    messages,
    messagesFromUserInput,
    persistSession,
  )

  const _selector = messageSelector()
  const replayableMessages = messagesFromUserInput.filter(
    msg =>
      (msg.type === 'user' &&
        !msg.isMeta &&
        !msg.toolUseResult &&
        (_selector?.selectableUserMessagesFilter(msg) ?? true)) ||
      (msg.type === 'system' && msg.subtype === 'compact_boundary'),
  )
  const messagesToAck = resolvedConfig.replayUserMessages
    ? replayableMessages
    : []

  resolvedConfig.setAppState(prev => ({
    ...prev,
    toolPermissionContext: {
      ...prev.toolPermissionContext,
      alwaysAllowRules: {
        ...prev.toolPermissionContext.alwaysAllowRules,
        command: allowedTools,
      },
    },
  }))

  const mainLoopModel = modelFromUserInput ?? initialMainLoopModel

  processUserInputContext = buildProcessUserInputContext2({
    messages,
    loadedNestedMemoryPaths: state.loadedNestedMemoryPaths,
    discoveredSkillNames: state.discoveredSkillNames,
    abortController: state.abortController,
    readFileState: state.readFileState,
    handleElicitation: resolvedConfig.handleElicitation,
    agents: resolvedConfig.agents,
    commands: resolvedConfig.commands,
    tools: resolvedConfig.tools,
    mcpClients: resolvedConfig.mcpClients,
    verbose: resolvedConfig.verbose,
    mainLoopModel,
    thinkingConfig: initialThinkingConfig,
    customSystemPrompt: resolvedConfig.customSystemPrompt,
    appendSystemPrompt: resolvedConfig.appendSystemPrompt,
    maxBudgetUsd: resolvedConfig.maxBudgetUsd,
    getAppState: resolvedConfig.getAppState,
    setAppState: resolvedConfig.setAppState,
    setSDKStatus: resolvedConfig.setSDKStatus,
    firstCtx: processUserInputContext,
  })

  headlessProfilerCheckpoint('before_skills_plugins')
  const [skills, { enabled: enabledPlugins }] = await Promise.all([
    getSlashCommandToolSkills(getCwd()),
    loadAllPluginsCacheOnly(),
  ])
  headlessProfilerCheckpoint('after_skills_plugins')

  yield buildSystemInitMessage({
    tools: resolvedConfig.tools,
    mcpClients: resolvedConfig.mcpClients,
    model: mainLoopModel,
    permissionMode: initialAppState.toolPermissionContext
      .mode as PermissionMode,
    commands: resolvedConfig.commands,
    agents: resolvedConfig.agents,
    skills,
    plugins: enabledPlugins,
    fastMode: initialAppState.fastMode,
  })

  headlessProfilerCheckpoint('system_message_yielded')

  if (!shouldQuery) {
    yield* handleNoQueryLocalCommandReplay({
      messagesFromUserInput,
      messages,
      persistSession,
      startTime,
      resultText,
      mainLoopModel,
      initialFastMode: initialAppState.fastMode,
      totalUsage: state.totalUsage,
      permissionDenials: state.permissionDenials,
    })
    return
  }

  snapshotUserInputHistory(
    messagesFromUserInput,
    resolvedConfig.setAppState,
    persistSession,
  )

  let currentMessageUsage: NonNullableUsage = EMPTY_USAGE
  let turnCount = 1
  let hasAcknowledgedInitialMessages = false
  let structuredOutputFromTool: unknown
  let lastStopReason: string | null = null
  const errorLogWatermark = getInMemoryErrors().at(-1)
  const initialStructuredOutputCalls = resolvedConfig.jsonSchema
    ? countToolCalls(state.mutableMessages, SYNTHETIC_OUTPUT_TOOL_NAME)
    : 0

  for await (const message of query({
    messages,
    systemPrompt,
    userContext,
    systemContext,
    canUseTool: wrappedCanUseTool,
    toolUseContext: processUserInputContext,
    fallbackModel: resolvedConfig.fallbackModel,
    querySource: 'sdk',
    maxTurns: resolvedConfig.maxTurns,
    taskBudget: resolvedConfig.taskBudget,
  })) {
    // transcript 持久化 + ack
    if (
      message.type === 'assistant' ||
      message.type === 'user' ||
      (message.type === 'system' && message.subtype === 'compact_boundary')
    ) {
      if (
        persistSession &&
        message.type === 'system' &&
        message.subtype === 'compact_boundary'
      ) {
        const compactMsg = message as SystemCompactBoundaryMessage
        const tailUuid = compactMsg.compactMetadata?.preservedSegment?.tailUuid
        if (tailUuid) {
          const tailIdx = findLastIndexByUuid(state.mutableMessages, tailUuid)
          if (tailIdx !== -1) {
            await recordTranscript(state.mutableMessages.slice(0, tailIdx + 1))
          }
        }
      }
      messages.push(message as Message)
      if (persistSession) {
        await persistLoopMessage(messages, message.type, persistSession)
      }

      if (!hasAcknowledgedInitialMessages && messagesToAck.length > 0) {
        hasAcknowledgedInitialMessages = true
        for (const msgToAck of messagesToAck) {
          if (msgToAck.type === 'user') {
            yield {
              type: 'user',
              message: msgToAck.message,
              session_id: getSessionId(),
              parent_tool_use_id: null,
              uuid: msgToAck.uuid,
              timestamp: msgToAck.timestamp,
              isReplay: true,
            } as unknown as SDKUserMessageReplay
          }
        }
      }
    }

    if (message.type === 'user') {
      turnCount++
    }

    switch (message.type) {
      case 'tombstone':
        break
      case 'assistant': {
        const msg = message as Message
        const stopReason = msg.message?.stop_reason as string | null | undefined
        if (stopReason != null) {
          lastStopReason = stopReason
        }
        appendMessages(state.mutableMessages, [msg])
        yield* normalizeMessage(msg)
        break
      }
      case 'progress': {
        const msg = message as Message
        appendMessages(state.mutableMessages, [msg])
        if (persistSession) {
          messages.push(msg)
          void recordTranscript(messages)
        }
        yield* normalizeMessage(msg)
        break
      }
      case 'user': {
        const msg = message as Message
        appendMessages(state.mutableMessages, [msg])
        yield* normalizeMessage(msg)
        break
      }
      case 'stream_event': {
        const event = (message as unknown as { event: Record<string, unknown> })
          .event
        if (event.type === 'message_start') {
          currentMessageUsage = EMPTY_USAGE
          const eventMessage = event.message as { usage: BetaMessageDeltaUsage }
          currentMessageUsage = updateUsage(
            currentMessageUsage,
            eventMessage.usage,
          )
        }
        if (event.type === 'message_delta') {
          currentMessageUsage = updateUsage(
            currentMessageUsage,
            event.usage as BetaMessageDeltaUsage,
          )
          const delta = event.delta as { stop_reason?: string | null }
          if (delta.stop_reason != null) {
            lastStopReason = delta.stop_reason
          }
        }
        if (event.type === 'message_stop') {
          state.totalUsage = accumulateUsage(
            state.totalUsage,
            currentMessageUsage,
          )
        }

        if (resolvedConfig.includePartialMessages) {
          yield {
            type: 'stream_event' as const,
            event,
            session_id: getSessionId(),
            parent_tool_use_id: null,
            uuid: randomUUID(),
          }
        }
        break
      }
      case 'attachment': {
        const msg = message as Message
        appendMessages(state.mutableMessages, [msg])
        if (persistSession) {
          messages.push(msg)
          void recordTranscript(messages)
        }

        const attachment = msg.attachment as {
          type: string
          data?: unknown
          turnCount?: number
          maxTurns?: number
          prompt?: string
          source_uuid?: string
          [key: string]: unknown
        }

        if (attachment.type === 'structured_output') {
          structuredOutputFromTool = attachment.data
        } else if (attachment.type === 'max_turns_reached') {
          if (persistSession) {
            if (
              isEnvTruthy(process.env.CLAUDE_CODE_EAGER_FLUSH) ||
              isEnvTruthy(process.env.CLAUDE_CODE_IS_COWORK)
            ) {
              await flushSessionStorage()
            }
          }
          yield {
            type: 'result',
            subtype: 'error_max_turns',
            duration_ms: Date.now() - startTime,
            duration_api_ms: getTotalAPIDuration(),
            is_error: true,
            num_turns: attachment.turnCount as number,
            stop_reason: lastStopReason,
            session_id: getSessionId(),
            total_cost_usd: getTotalCost(),
            usage: state.totalUsage,
            modelUsage: getModelUsage(),
            permission_denials: state.permissionDenials,
            fast_mode_state: getFastModeState(
              mainLoopModel,
              initialAppState.fastMode,
            ),
            uuid: randomUUID(),
            errors: [
              `Reached maximum number of turns (${attachment.maxTurns})`,
            ],
          }
          return
        } else if (
          resolvedConfig.replayUserMessages &&
          attachment.type === 'queued_command'
        ) {
          yield {
            type: 'user',
            message: {
              role: 'user' as const,
              content: attachment.prompt,
            },
            session_id: getSessionId(),
            parent_tool_use_id: null,
            uuid: attachment.source_uuid || msg.uuid,
            timestamp: msg.timestamp,
            isReplay: true,
          } as unknown as SDKUserMessageReplay
        }
        break
      }
      case 'stream_request_start':
        break
      case 'system': {
        const msg = message as Message
        const snipResult = resolvedConfig.snipReplay?.(
          msg,
          state.mutableMessages,
        )
        if (snipResult !== undefined) {
          if (snipResult.executed) {
            replaceMessagesInPlace(state.mutableMessages, snipResult.messages)
          }
          break
        }
        appendMessages(state.mutableMessages, [msg])
        if (msg.subtype === 'compact_boundary' && msg.compactMetadata) {
          const compactMsg = msg as SystemCompactBoundaryMessage
          releasePreBoundaryMessages(state.mutableMessages, messages)
          yield {
            type: 'system',
            subtype: 'compact_boundary' as const,
            session_id: getSessionId(),
            uuid: msg.uuid,
            compact_metadata: toSDKCompactMetadata(compactMsg.compactMetadata),
          }
        }
        if (msg.subtype === 'api_error') {
          const apiErrorMsg = msg as Message & {
            retryAttempt: number
            maxRetries: number
            retryInMs: number
            error: APIError
          }
          yield {
            type: 'system',
            subtype: 'api_retry' as const,
            attempt: apiErrorMsg.retryAttempt,
            max_retries: apiErrorMsg.maxRetries,
            retry_delay_ms: apiErrorMsg.retryInMs,
            error_status: apiErrorMsg.error.status ?? null,
            error: categorizeRetryableAPIError(apiErrorMsg.error),
            session_id: getSessionId(),
            uuid: msg.uuid,
          }
        }
        break
      }
      case 'tool_use_summary': {
        const msg = message as Message & {
          summary: unknown
          precedingToolUseIds: unknown
        }
        yield {
          type: 'tool_use_summary' as const,
          summary: msg.summary,
          preceding_tool_use_ids: msg.precedingToolUseIds,
          session_id: getSessionId(),
          uuid: msg.uuid,
        }
        break
      }
    }

    // Budget 超限检查
    if (
      resolvedConfig.maxBudgetUsd !== undefined &&
      getTotalCost() >= resolvedConfig.maxBudgetUsd
    ) {
      if (persistSession) {
        if (
          isEnvTruthy(process.env.CLAUDE_CODE_EAGER_FLUSH) ||
          isEnvTruthy(process.env.CLAUDE_CODE_IS_COWORK)
        ) {
          await flushSessionStorage()
        }
      }
      yield {
        type: 'result',
        subtype: 'error_max_budget_usd',
        duration_ms: Date.now() - startTime,
        duration_api_ms: getTotalAPIDuration(),
        is_error: true,
        num_turns: turnCount,
        stop_reason: lastStopReason,
        session_id: getSessionId(),
        total_cost_usd: getTotalCost(),
        usage: state.totalUsage,
        modelUsage: getModelUsage(),
        permission_denials: state.permissionDenials,
        fast_mode_state: getFastModeState(
          mainLoopModel,
          initialAppState.fastMode,
        ),
        uuid: randomUUID(),
        errors: [
          `Reached maximum budget ($${resolvedConfig.maxBudgetUsd}). Increase the limit with --max-budget-usd or start a new session.`,
        ],
      }
      return
    }

    // Structured output retry 超限检查
    if (message.type === 'user' && resolvedConfig.jsonSchema) {
      const currentCalls = countToolCalls(
        state.mutableMessages,
        SYNTHETIC_OUTPUT_TOOL_NAME,
      )
      const callsThisQuery = currentCalls - initialStructuredOutputCalls
      const maxRetries = parseInt(
        process.env.MAX_STRUCTURED_OUTPUT_RETRIES || '5',
        10,
      )
      if (callsThisQuery >= maxRetries) {
        if (persistSession) {
          if (
            isEnvTruthy(process.env.CLAUDE_CODE_EAGER_FLUSH) ||
            isEnvTruthy(process.env.CLAUDE_CODE_IS_COWORK)
          ) {
            await flushSessionStorage()
          }
        }
        yield {
          type: 'result',
          subtype: 'error_max_structured_output_retries',
          duration_ms: Date.now() - startTime,
          duration_api_ms: getTotalAPIDuration(),
          is_error: true,
          num_turns: turnCount,
          stop_reason: lastStopReason,
          session_id: getSessionId(),
          total_cost_usd: getTotalCost(),
          usage: state.totalUsage,
          modelUsage: getModelUsage(),
          permission_denials: state.permissionDenials,
          fast_mode_state: getFastModeState(
            mainLoopModel,
            initialAppState.fastMode,
          ),
          uuid: randomUUID(),
          errors: [
            `Failed to provide valid structured output after ${maxRetries} attempts`,
          ],
        }
        return
      }
    }
  }

  // Post-loop 结果提取
  const result = messages.findLast(
    m => m.type === 'assistant' || m.type === 'user',
  )
  const edeResultType = result?.type ?? 'undefined'
  const edeLastContentType =
    result?.type === 'assistant'
      ? (last(
          result.message!
            .content as import('@anthropic-ai/sdk/resources/beta/messages/messages.js').BetaContentBlock[],
        )?.type ?? 'none')
      : 'n/a'

  await flushBeforeResult(persistSession)

  if (!isResultSuccessful(result, lastStopReason)) {
    yield {
      type: 'result',
      subtype: 'error_during_execution',
      duration_ms: Date.now() - startTime,
      duration_api_ms: getTotalAPIDuration(),
      is_error: true,
      num_turns: turnCount,
      stop_reason: lastStopReason,
      session_id: getSessionId(),
      total_cost_usd: getTotalCost(),
      usage: state.totalUsage,
      modelUsage: getModelUsage(),
      permission_denials: state.permissionDenials,
      fast_mode_state: getFastModeState(
        mainLoopModel,
        initialAppState.fastMode,
      ),
      uuid: randomUUID(),
      errors: (() => {
        const all = getInMemoryErrors()
        const start = errorLogWatermark
          ? all.lastIndexOf(errorLogWatermark) + 1
          : 0
        return [
          `[ede_diagnostic] result_type=${edeResultType} last_content_type=${edeLastContentType} stop_reason=${lastStopReason}`,
          ...all.slice(start).map(_ => _.error),
        ]
      })(),
    }
    return
  }

  let textResult = ''
  let isApiError = false
  if (result.type === 'assistant') {
    const lastContent = last(
      result.message!
        .content as import('@anthropic-ai/sdk/resources/beta/messages/messages.js').BetaContentBlock[],
    )
    if (
      lastContent?.type === 'text' &&
      !SYNTHETIC_MESSAGES.has(lastContent.text)
    ) {
      textResult = lastContent.text
    }
    isApiError = Boolean(result.isApiErrorMessage)
  }

  yield {
    type: 'result',
    subtype: 'success',
    is_error: isApiError,
    duration_ms: Date.now() - startTime,
    duration_api_ms: getTotalAPIDuration(),
    num_turns: turnCount,
    result: textResult,
    stop_reason: lastStopReason,
    session_id: getSessionId(),
    total_cost_usd: getTotalCost(),
    usage: state.totalUsage,
    modelUsage: getModelUsage(),
    permission_denials: state.permissionDenials,
    structured_output: structuredOutputFromTool,
    fast_mode_state: getFastModeState(mainLoopModel, initialAppState.fastMode),
    uuid: randomUUID(),
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 内部辅助函数
// ────────────────────────────────────────────────────────────────────────────

import last from 'lodash-es/last.js'
import type { BetaMessageDeltaUsage } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'

/**
 * 从 QueryEngine.config 解构出 submitMessage 运行所需字段。
 */
function resolveConfig(config: QueryEngineConfig): ResolvedEngineConfig {
  const {
    cwd,
    commands,
    tools,
    mcpClients,
    verbose = false,
    thinkingConfig,
    maxTurns,
    maxBudgetUsd,
    taskBudget,
    canUseTool,
    customSystemPrompt,
    appendSystemPrompt,
    userSpecifiedModel,
    fallbackModel,
    jsonSchema,
    getAppState,
    setAppState,
    replayUserMessages = false,
    includePartialMessages = false,
    agents = [],
    setSDKStatus,
    orphanedPermission,
    handleElicitation,
    snipReplay,
  } = config
  return {
    cwd,
    commands,
    tools,
    mcpClients,
    verbose,
    thinkingConfig,
    maxTurns,
    maxBudgetUsd,
    taskBudget,
    canUseTool,
    customSystemPrompt,
    appendSystemPrompt,
    userSpecifiedModel,
    fallbackModel,
    jsonSchema,
    getAppState,
    setAppState,
    replayUserMessages,
    includePartialMessages,
    agents,
    setSDKStatus,
    orphanedPermission,
    handleElicitation,
    snipReplay,
  }
}

/**
 * 创建 wrappedCanUseTool（原 :257-285）。
 * 捕获 permissionDenials 数组引用。
 */
function createWrappedCanUseTool(
  canUseTool: QueryEngineConfig['canUseTool'],
  state: EngineMutableState,
) {
  const wrappedCanUseTool = async (
    tool: Parameters<QueryEngineConfig['canUseTool']>[0],
    input: Parameters<QueryEngineConfig['canUseTool']>[1],
    toolUseContext: Parameters<QueryEngineConfig['canUseTool']>[2],
    assistantMessage: Parameters<QueryEngineConfig['canUseTool']>[3],
    toolUseID: Parameters<QueryEngineConfig['canUseTool']>[4],
    forceDecision: Parameters<QueryEngineConfig['canUseTool']>[5],
  ) => {
    const result = await canUseTool(
      tool,
      input,
      toolUseContext,
      assistantMessage,
      toolUseID,
      forceDecision,
    )
    if (result.behavior !== 'allow') {
      state.permissionDenials.push({
        type: 'permission_denial',
        tool_name: sdkCompatToolName(tool.name),
        tool_use_id: toolUseID,
        tool_input: input,
      })
    }
    return result
  }
  return wrappedCanUseTool
}

/**
 * 第一次 processUserInputContext 构建（原 :349-409）。
 *
 * setMessages 闭包写回 mutableMessages（通过 state 引用）。
 */
function buildProcessUserInputContext1(params: {
  mutableMessages: Message[]
  loadedNestedMemoryPaths: Set<string>
  discoveredSkillNames: Set<string>
  abortController: AbortController
  readFileState: EngineMutableState['readFileState']
  handleElicitation: ResolvedEngineConfig['handleElicitation']
  agents: ResolvedEngineConfig['agents']
  commands: ResolvedEngineConfig['commands']
  tools: ResolvedEngineConfig['tools']
  mcpClients: ResolvedEngineConfig['mcpClients']
  verbose: boolean
  mainLoopModel: string
  thinkingConfig: ThinkingConfig
  customSystemPrompt: string | undefined
  appendSystemPrompt: string | undefined
  maxBudgetUsd: number | undefined
  getAppState: () => AppState
  setAppState: (f: (prev: AppState) => AppState) => void
  setSDKStatus: ((status: SDKStatus) => void) | undefined
  setMessagesTarget: { mutableMessages: Message[] }
}): ProcessUserInputContext {
  const {
    setMessagesTarget,
    loadedNestedMemoryPaths,
    discoveredSkillNames,
    abortController,
    readFileState,
    handleElicitation,
    agents,
    commands,
    tools,
    mcpClients,
    verbose,
    mainLoopModel,
    thinkingConfig,
    customSystemPrompt,
    appendSystemPrompt,
    maxBudgetUsd,
    getAppState,
    setAppState,
    setSDKStatus,
  } = params

  const updateFileHistoryState = (
    updater: (prev: FileHistoryState) => FileHistoryState,
  ) => {
    setAppState(prev => {
      const updated = updater(prev.fileHistory)
      if (updated === prev.fileHistory) return prev
      return { ...prev, fileHistory: updated }
    })
  }
  const updateAttributionState = (
    updater: (prev: AttributionState) => AttributionState,
  ) => {
    setAppState(prev => {
      const updated = updater(prev.attribution)
      if (updated === prev.attribution) return prev
      return { ...prev, attribution: updated }
    })
  }

  return {
    messages: setMessagesTarget.mutableMessages,
    setMessages: fn => {
      setMessagesTarget.mutableMessages = fn(setMessagesTarget.mutableMessages)
    },
    onChangeAPIKey: () => {},
    handleElicitation,
    options: {
      commands,
      debug: false,
      tools,
      verbose,
      mainLoopModel,
      thinkingConfig,
      mcpClients,
      mcpResources: {},
      ideInstallationStatus: null,
      isNonInteractiveSession: true,
      customSystemPrompt,
      appendSystemPrompt,
      agentDefinitions: { activeAgents: agents, allAgents: [] },
      theme: resolveThemeSetting(getGlobalConfig().theme),
      maxBudgetUsd,
    },
    getAppState,
    setAppState,
    abortController,
    readFileState,
    nestedMemoryAttachmentTriggers: new Set<string>(),
    loadedNestedMemoryPaths,
    dynamicSkillDirTriggers: new Set<string>(),
    discoveredSkillNames,
    setInProgressToolUseIDs: () => {},
    setResponseLength: () => {},
    updateFileHistoryState,
    updateAttributionState,
    setSDKStatus,
  }
}

/**
 * 第二次 processUserInputContext 构建（原 :503-542）。
 * 复用第一次的 updateFileHistoryState / updateAttributionState 引用。
 */
function buildProcessUserInputContext2(params: {
  messages: Message[]
  loadedNestedMemoryPaths: Set<string>
  discoveredSkillNames: Set<string>
  abortController: AbortController
  readFileState: EngineMutableState['readFileState']
  handleElicitation: ResolvedEngineConfig['handleElicitation']
  agents: ResolvedEngineConfig['agents']
  commands: ResolvedEngineConfig['commands']
  tools: ResolvedEngineConfig['tools']
  mcpClients: ResolvedEngineConfig['mcpClients']
  verbose: boolean
  mainLoopModel: string
  thinkingConfig: ThinkingConfig
  customSystemPrompt: string | undefined
  appendSystemPrompt: string | undefined
  maxBudgetUsd: number | undefined
  getAppState: () => AppState
  setAppState: (f: (prev: AppState) => AppState) => void
  setSDKStatus: ((status: SDKStatus) => void) | undefined
  firstCtx: ProcessUserInputContext
}): ProcessUserInputContext {
  const {
    messages,
    loadedNestedMemoryPaths,
    discoveredSkillNames,
    abortController,
    readFileState,
    handleElicitation,
    agents,
    commands,
    tools,
    mcpClients,
    verbose,
    mainLoopModel,
    thinkingConfig,
    customSystemPrompt,
    appendSystemPrompt,
    maxBudgetUsd,
    getAppState,
    setAppState,
    setSDKStatus,
    firstCtx,
  } = params

  return {
    messages,
    setMessages: () => {},
    onChangeAPIKey: () => {},
    handleElicitation,
    options: {
      commands,
      debug: false,
      tools,
      verbose,
      mainLoopModel,
      thinkingConfig,
      mcpClients,
      mcpResources: {},
      ideInstallationStatus: null,
      isNonInteractiveSession: true,
      customSystemPrompt,
      appendSystemPrompt,
      theme: resolveThemeSetting(getGlobalConfig().theme),
      agentDefinitions: { activeAgents: agents, allAgents: [] },
      maxBudgetUsd,
    },
    getAppState,
    setAppState,
    abortController,
    readFileState,
    nestedMemoryAttachmentTriggers: new Set<string>(),
    loadedNestedMemoryPaths,
    dynamicSkillDirTriggers: new Set<string>(),
    discoveredSkillNames,
    setInProgressToolUseIDs: () => {},
    setResponseLength: () => {},
    updateFileHistoryState: firstCtx.updateFileHistoryState,
    updateAttributionState: firstCtx.updateAttributionState,
    setSDKStatus,
  }
}

/**
 * shouldQuery=false 分支：本地命令结果回放（原 :571-655）。
 */
async function* handleNoQueryLocalCommandReplay(params: {
  messagesFromUserInput: readonly Message[]
  messages: Message[]
  persistSession: boolean
  startTime: number
  resultText: string | undefined
  mainLoopModel: string
  initialFastMode: AppState['fastMode']
  totalUsage: NonNullableUsage
  permissionDenials: SDKPermissionDenial[]
}): AsyncGenerator<SDKMessage> {
  const {
    messagesFromUserInput,
    messages,
    persistSession,
    startTime,
    resultText,
    mainLoopModel,
    initialFastMode,
    totalUsage,
    permissionDenials,
  } = params

  for (const msg of messagesFromUserInput) {
    if (
      msg.type === 'user' &&
      typeof msg.message!.content === 'string' &&
      (msg.message!.content.includes(`<${LOCAL_COMMAND_STDOUT_TAG}>`) ||
        msg.message!.content.includes(`<${LOCAL_COMMAND_STDERR_TAG}>`) ||
        msg.isCompactSummary)
    ) {
      yield {
        type: 'user',
        message: {
          ...msg.message,
          content: stripAnsi(msg.message!.content),
        },
        session_id: getSessionId(),
        parent_tool_use_id: null,
        uuid: msg.uuid,
        timestamp: msg.timestamp,
        isReplay: !msg.isCompactSummary,
        isSynthetic: msg.isMeta || msg.isVisibleInTranscriptOnly,
      } as unknown as SDKUserMessageReplay
    }

    if (
      msg.type === 'system' &&
      msg.subtype === 'local_command' &&
      typeof msg.content === 'string' &&
      (msg.content.includes(`<${LOCAL_COMMAND_STDOUT_TAG}>`) ||
        msg.content.includes(`<${LOCAL_COMMAND_STDERR_TAG}>`))
    ) {
      yield localCommandOutputToSDKAssistantMessage(msg.content, msg.uuid)
    }

    if (msg.type === 'system' && msg.subtype === 'compact_boundary') {
      const compactMsg = msg as SystemCompactBoundaryMessage
      yield {
        type: 'system',
        subtype: 'compact_boundary' as const,
        session_id: getSessionId(),
        uuid: msg.uuid,
        compact_metadata: toSDKCompactMetadata(compactMsg.compactMetadata),
      } as unknown as SDKCompactBoundaryMessage
    }
  }

  await persistLocalCommandTranscript(messages, persistSession)

  yield {
    type: 'result',
    subtype: 'success',
    is_error: false,
    duration_ms: Date.now() - startTime,
    duration_api_ms: getTotalAPIDuration(),
    num_turns: messages.length - 1,
    result: resultText ?? '',
    stop_reason: null,
    session_id: getSessionId(),
    total_cost_usd: getTotalCost(),
    usage: totalUsage,
    modelUsage: getModelUsage(),
    permission_denials: permissionDenials,
    fast_mode_state: getFastModeState(mainLoopModel, initialFastMode),
    uuid: randomUUID(),
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 骨架 runSubmitMessage（H1 委托模式验证，C10 创建）
//
// 与生产 runSubmitMessageProduction 并存：
//   - 生产：被 QueryEngine.submitMessage 调用，37 个 yield
//   - 骨架：被 delegation.test.ts 验证 H1 yield* 委托模式
// ────────────────────────────────────────────────────────────────────────────

import type { EngineState, TurnEvent } from '../types.js'
import { queryLoop } from '../loop/index.js' // 依赖方向：engine → loop
import { pushMessage } from './messages-state.js'
import { snapshotHistory } from './file-history.js'
import { persistSession } from './session-persist.js'
import { computeAttribution } from './attribution.js'
import { maybeCompact, shouldCompact } from './compaction.js'
import { isInterrupted } from './interrupt.js'

/**
 * submitMessage 主生成器（骨架版，模式 A：AsyncGenerator<TurnEvent>）。
 * 被 QueryEngine.submitMessage 用 yield* 委托。
 *
 * v2 spec §7.5 H1：每个子模块委托模式已标注。
 * M3：这是物理拆分降低行数，submit-message 仍是协调节点。
 *
 * 注：此为 C10 拆分的新骨架实现。生产 runSubmitMessageProduction
 * 是生产入口。本骨架用于验证 H1 委托模式，不替代生产 submitMessage。
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
  computeAttribution(state)

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
