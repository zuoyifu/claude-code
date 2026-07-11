/**
 * 生产 QueryEngine 内部可变状态（C10.5 迁移）。
 *
 * src/QueryEngine.ts 的 QueryEngine 类持有这些字段，submitMessage 生成器
 * 通过本接口访问它们。抽出为独立类型以便 submit-message.ts 接收。
 *
 * 注：与 query/types.ts 的骨架 EngineState 是两套抽象：
 *   - 骨架 EngineState：用于 H1 委托模式验证（delegation.test.ts）
 *   - 本 EngineInternalState：生产 QueryEngine.submitMessage 的实际依赖
 */
import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/messages.mjs'
import type { NonNullableUsage } from '@ant/model-provider'
import type {
  SDKMessage,
  SDKPermissionDenial,
  SDKStatus,
} from '../../entrypoints/agentSdkTypes.js'
import type { Message } from '../../types/message.js'
import type { OrphanedPermission } from '../../types/textInputTypes.js'
import type { FileStateCache } from '../../utils/fileStateCache.js'
import type { FileHistoryState } from '../../utils/fileHistory.js'
import type { AttributionState } from '../../utils/commitAttribution.js'
import type { ThinkingConfig } from '../../utils/thinking.js'
import type { Tools, ToolUseContext } from '../../tools/core/index.js'
import type { Command } from '../../commands/_registry/registry.js'
import type { MCPServerConnection } from '../../services/mcp/types.js'
import type { AppState } from '../../state/AppState.js'
import type { CanUseToolFn } from '../../hooks/useCanUseTool.js'
import type { AgentDefinition } from '@claude-code-best/builtin-tools/tools/AgentTool/loadAgentsDir.js'

/**
 * snip 边界回调（ask() 注入 HISTORY_SNIP feature-gated 实现）。
 * 由 ask() 闭包捕获 snipModule/snipProjection，保持 feature-gated 字符串
 * 不进入 submit-message.ts。
 */
export type SnipReplayFn = (
  yieldedSystemMsg: Message,
  store: Message[],
) => { messages: Message[]; executed: boolean } | undefined

/**
 * QueryEngine 构造参数（原 QueryEngine.ts 的 QueryEngineConfig 类型）。
 */
export interface QueryEngineConfig {
  cwd: string
  tools: Tools
  commands: Command[]
  mcpClients: MCPServerConnection[]
  agents: AgentDefinition[]
  canUseTool: CanUseToolFn
  getAppState: () => AppState
  setAppState: (f: (prev: AppState) => AppState) => void
  initialMessages?: Message[]
  readFileCache: FileStateCache
  customSystemPrompt?: string
  appendSystemPrompt?: string
  userSpecifiedModel?: string
  fallbackModel?: string
  thinkingConfig?: ThinkingConfig
  maxTurns?: number
  maxBudgetUsd?: number
  taskBudget?: { total: number }
  jsonSchema?: Record<string, unknown>
  verbose?: boolean
  replayUserMessages?: boolean
  /** Handler for URL elicitations triggered by MCP tool -32042 errors. */
  handleElicitation?: ToolUseContext['handleElicitation']
  includePartialMessages?: boolean
  setSDKStatus?: (status: SDKStatus) => void
  abortController?: AbortController
  orphanedPermission?: OrphanedPermission
  snipReplay?: SnipReplayFn
}

/**
 * submitMessage 生成器的输入：引擎实例的可变内部状态引用。
 * 所有字段通过引用传递，生成器内部的 mutation 直接反映回 QueryEngine 实例。
 */
export interface SubmitMessageParams {
  prompt: string | ContentBlockParam[]
  options?: { uuid?: string; isMeta?: boolean }

  // 引擎配置（从 QueryEngine.config 解构后的子集）
  config: ResolvedEngineConfig
}

/**
 * submitMessage 运行期从 QueryEngine.config 解构出的字段集合。
 * 与原 submitMessage 顶部的解构一一对应。
 */
export interface ResolvedEngineConfig {
  cwd: string
  commands: Command[]
  tools: Tools
  mcpClients: MCPServerConnection[]
  verbose: boolean
  thinkingConfig: ThinkingConfig | undefined
  maxTurns: number | undefined
  maxBudgetUsd: number | undefined
  taskBudget: { total: number } | undefined
  canUseTool: CanUseToolFn
  customSystemPrompt: string | undefined
  appendSystemPrompt: string | undefined
  userSpecifiedModel: string | undefined
  fallbackModel: string | undefined
  jsonSchema: Record<string, unknown> | undefined
  getAppState: () => AppState
  setAppState: (f: (prev: AppState) => AppState) => void
  replayUserMessages: boolean
  includePartialMessages: boolean
  agents: AgentDefinition[]
  setSDKStatus: ((status: SDKStatus) => void) | undefined
  orphanedPermission: OrphanedPermission | undefined
  handleElicitation: ToolUseContext['handleElicitation'] | undefined
  snipReplay: SnipReplayFn | undefined
}

/**
 * QueryEngine 实例持有的可变状态。
 * submitMessage 生成器通过引用读写这些字段。
 */
export interface EngineMutableState {
  mutableMessages: Message[]
  abortController: AbortController
  permissionDenials: SDKPermissionDenial[]
  totalUsage: NonNullableUsage
  hasHandledOrphanedPermission: boolean
  readFileState: FileStateCache
  discoveredSkillNames: Set<string>
  loadedNestedMemoryPaths: Set<string>
  /** 用户指定的 model 写入口（setModel 调用） */
  userSpecifiedModel: string | undefined
}

export type {
  AppState,
  CanUseToolFn,
  Command,
  MCPServerConnection,
  Message,
  FileHistoryState,
  AttributionState,
  SDKMessage,
}
