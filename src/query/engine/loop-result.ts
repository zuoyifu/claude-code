/**
 * Post-loop 结果提取（C10.5 迁移自 src/QueryEngine.ts submitMessage :1108-1218）。
 *
 * 包含 result findLast + ede 诊断 + flush + error_during_execution / success
 * 分支构建与 yield。
 */
import { randomUUID } from 'crypto'
import last from 'lodash-es/last.js'
import { getSessionId } from '../../bootstrap/state.js'
import {
  getTotalAPIDuration,
  getTotalCost,
  getModelUsage,
} from '../../cost-tracker.js'
import { getFastModeState } from '../../utils/fastMode.js'
import { getInMemoryErrors } from '../../utils/log.js'
import { SYNTHETIC_MESSAGES } from '../../utils/messages.js'
import { isResultSuccessful } from '../../utils/queryHelpers.js'
import type { NonNullableUsage } from '@ant/model-provider'
import type {
  SDKMessage,
  SDKPermissionDenial,
} from '../../entrypoints/agentSdkTypes.js'
import type { Message } from '../../types/message.js'
import type { AppState } from '../../state/AppState.js'

/**
 * 循环运行期状态（由 submitMessage 循环内维护，post-loop 提取时传入）。
 */
export interface LoopRunState {
  turnCount: number
  lastStopReason: string | null
  totalUsage: NonNullableUsage
  permissionDenials: SDKPermissionDenial[]
  structuredOutputFromTool: unknown
  errorLogWatermark: unknown
}

/**
 * Post-loop 结果提取参数。
 */
export interface BuildResultParams {
  messages: Message[]
  startTime: number
  mainLoopModel: string
  initialFastMode: AppState['fastMode']
  persistSession: boolean
  runState: LoopRunState
}

/**
 * Yield 给调用方的 result 消息集合。
 *
 * - error_during_execution：isResultSuccessful 为 false
 * - success：result.type === 'assistant' 提取文本，否则 textResult = ''
 * - isApiError：assistant.isApiErrorMessage 标志
 */
export interface ResultYield {
  type: 'result'
  subtype:
    | 'success'
    | 'error_during_execution'
    | 'error_max_turns'
    | 'error_max_budget_usd'
    | 'error_max_structured_output_retries'
  is_error: boolean
  duration_ms: number
  duration_api_ms: number
  num_turns: number
  result?: string
  stop_reason: string | null
  session_id: string
  total_cost_usd: number
  usage: NonNullableUsage
  modelUsage: ReturnType<typeof getModelUsage>
  permission_denials: SDKPermissionDenial[]
  fast_mode_state: ReturnType<typeof getFastModeState>
  uuid: string
  errors?: string[]
  structured_output?: unknown
}

/**
 * findLast assistant|user（原 :1115-1117）。
 */
export function findLastAssistantOrUser(
  messages: readonly Message[],
): Message | undefined {
  return messages.findLast(m => m.type === 'assistant' || m.type === 'user')
}

/**
 * 提取 ede 诊断字段（原 :1121-1128）。
 *
 * isResultSuccessful 是 type predicate，false 分支会窄化 result 为 never，
 * 因此必须在谓词调用之前捕获这些字段。
 */
export function extractEdeDiagnostic(result: Message | undefined): {
  edeResultType: string
  edeLastContentType: string
} {
  const edeResultType = result?.type ?? 'undefined'
  const edeLastContentType =
    result?.type === 'assistant'
      ? (last(
          result.message!
            .content as import('@anthropic-ai/sdk/resources/beta/messages/messages.js').BetaContentBlock[],
        )?.type ?? 'none')
      : 'n/a'
  return { edeResultType, edeLastContentType }
}

/**
 * 构建 error_during_execution result（原 :1142-1178）。
 *
 * errors[] 通过 errorLogWatermark lastIndexOf 实现按轮次作用域（turn-scoped）。
 */
export function buildErrorDuringExecutionResult(
  params: BuildResultParams & {
    edeResultType: string
    edeLastContentType: string
  },
): ResultYield {
  const {
    startTime,
    mainLoopModel,
    initialFastMode,
    runState,
    edeResultType,
    edeLastContentType,
  } = params
  const all = getInMemoryErrors()
  const start = params.runState.errorLogWatermark
    ? all.lastIndexOf(
        params.runState.errorLogWatermark as {
          error: string
          timestamp: string
        },
      ) + 1
    : 0
  return {
    type: 'result',
    subtype: 'error_during_execution',
    is_error: true,
    duration_ms: Date.now() - startTime,
    duration_api_ms: getTotalAPIDuration(),
    num_turns: runState.turnCount,
    stop_reason: runState.lastStopReason,
    session_id: getSessionId(),
    total_cost_usd: getTotalCost(),
    usage: runState.totalUsage,
    modelUsage: getModelUsage(),
    permission_denials: runState.permissionDenials,
    fast_mode_state: getFastModeState(mainLoopModel, initialFastMode),
    uuid: randomUUID(),
    errors: [
      `[ede_diagnostic] result_type=${edeResultType} last_content_type=${edeLastContentType} stop_reason=${runState.lastStopReason}`,
      ...all.slice(start).map(_ => _.error),
    ],
  }
}

/**
 * 构建 success result（原 :1180-1218）。
 */
export function buildSuccessResult(
  params: BuildResultParams & { result: Message },
): ResultYield {
  const { startTime, mainLoopModel, initialFastMode, runState, result } = params

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

  return {
    type: 'result',
    subtype: 'success',
    is_error: isApiError,
    duration_ms: Date.now() - startTime,
    duration_api_ms: getTotalAPIDuration(),
    num_turns: runState.turnCount,
    result: textResult,
    stop_reason: runState.lastStopReason,
    session_id: getSessionId(),
    total_cost_usd: getTotalCost(),
    usage: runState.totalUsage,
    modelUsage: getModelUsage(),
    permission_denials: runState.permissionDenials,
    structured_output: runState.structuredOutputFromTool,
    fast_mode_state: getFastModeState(mainLoopModel, initialFastMode),
    uuid: randomUUID(),
  }
}

/**
 * 判断 result 是否成功（封装 isResultSuccessful 以避免窄化陷阱）。
 */
export function checkResultSuccess(
  result: Message | undefined,
  lastStopReason: string | null,
): boolean {
  return isResultSuccessful(result, lastStopReason)
}

export type { SDKMessage, Message, AppState }
