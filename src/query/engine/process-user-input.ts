/**
 * ProcessUserInputContext 构建器（C10.5 迁移自 src/QueryEngine.ts :349-409, :503-542）。
 *
 * 包含两次 processUserInputContext 对象字面量构建：
 *   1. 第一次（:349-409）：setMessages 写回 mutableMessages，使用 initialMainLoopModel
 *   2. 第二次（:503-542）：processUserInput 处理后重建，setMessages no-op，使用 mainLoopModel
 *
 * 两次构建共享 updateFileHistoryState / updateAttributionState 引用
 * （第二次显式从第一次复用，:539-540）。
 */
import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/messages.mjs'
import type { ProcessUserInputContext } from '../../utils/processUserInput/processUserInput.js'
import type { Command } from '../../commands/_registry/registry.js'
import type { MCPServerConnection } from '../../services/mcp/types.js'
import type { AppState } from '../../state/AppState.js'
import type { AgentDefinition } from '@claude-code-best/builtin-tools/tools/AgentTool/loadAgentsDir.js'
import type { Message } from '../../types/message.js'
import type { Tools, ToolUseContext } from '../../tools/core/index.js'
import type { CanUseToolFn } from '../../hooks/useCanUseTool.js'
import type { SDKStatus } from '../../entrypoints/agentSdkTypes.js'
import type { FileStateCache } from '../../utils/fileStateCache.js'
import type { FileHistoryState } from '../../utils/fileHistory.js'
import type { AttributionState } from '../../utils/commitAttribution.js'
import type { ThinkingConfig } from '../../utils/thinking.js'
import { resolveThemeSetting } from '../../utils/systemTheme.js'
import { getGlobalConfig } from '../../utils/config.js'

/**
 * 第一次构建参数（:349-409）。
 */
export interface BuildProcessUserInputContextParams {
  mutableMessages: Message[]
  loadedNestedMemoryPaths: Set<string>
  discoveredSkillNames: Set<string>
  abortController: AbortController
  readFileState: FileStateCache
  handleElicitation: ToolUseContext['handleElicitation'] | undefined
  agents: AgentDefinition[]
  commands: Command[]
  tools: Tools
  mcpClients: MCPServerConnection[]
  verbose: boolean
  mainLoopModel: string
  thinkingConfig: ThinkingConfig
  customSystemPrompt: string | undefined
  appendSystemPrompt: string | undefined
  maxBudgetUsd: number | undefined
  getAppState: () => AppState
  setAppState: (f: (prev: AppState) => AppState) => void
  setSDKStatus: ((status: SDKStatus) => void) | undefined
}

/**
 * 构建第一次 processUserInputContext（原 :349-409）。
 *
 * setMessages 闭包写回 mutableMessages（用于 slash 命令的消息变更）。
 */
export function buildProcessUserInputContext(
  params: BuildProcessUserInputContextParams,
): ProcessUserInputContext {
  const {
    mutableMessages,
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

  return {
    messages: mutableMessages,
    setMessages: fn => {
      // 闭包写入外层 mutableMessages 变量
      // 注意：调用方需要通过引用获取最新值
      params.mutableMessages = fn(params.mutableMessages)
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
    updateFileHistoryState: (
      updater: (prev: FileHistoryState) => FileHistoryState,
    ) => {
      setAppState(prev => {
        const updated = updater(prev.fileHistory)
        if (updated === prev.fileHistory) return prev
        return { ...prev, fileHistory: updated }
      })
    },
    updateAttributionState: (
      updater: (prev: AttributionState) => AttributionState,
    ) => {
      setAppState(prev => {
        const updated = updater(prev.attribution)
        if (updated === prev.attribution) return prev
        return { ...prev, attribution: updated }
      })
    },
    setSDKStatus,
  }
}

/**
 * 第二次构建参数（:503-542）。
 * 复用第一次的 updateFileHistoryState / updateAttributionState 引用。
 */
export interface RebuildProcessUserInputContextParams {
  messages: Message[]
  loadedNestedMemoryPaths: Set<string>
  discoveredSkillNames: Set<string>
  abortController: AbortController
  readFileState: FileStateCache
  handleElicitation: ToolUseContext['handleElicitation'] | undefined
  agents: AgentDefinition[]
  commands: Command[]
  tools: Tools
  mcpClients: MCPServerConnection[]
  verbose: boolean
  mainLoopModel: string
  thinkingConfig: ThinkingConfig
  customSystemPrompt: string | undefined
  appendSystemPrompt: string | undefined
  maxBudgetUsd: number | undefined
  getAppState: () => AppState
  setAppState: (f: (prev: AppState) => AppState) => void
  setSDKStatus: ((status: SDKStatus) => void) | undefined
  updateFileHistoryState: ProcessUserInputContext['updateFileHistoryState']
  updateAttributionState: ProcessUserInputContext['updateAttributionState']
}

/**
 * 重建 processUserInputContext（原 :503-542）。
 *
 * 与第一次的区别：
 *   - messages 改为 processUserInput 后的快照（不再写回 mutableMessages）
 *   - setMessages 改为 no-op
 *   - mainLoopModel 改为更新后的 mainLoopModel（可能被 /model 改）
 */
export function rebuildProcessUserInputContext(
  params: RebuildProcessUserInputContextParams,
): ProcessUserInputContext {
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
    updateFileHistoryState,
    updateAttributionState,
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
    updateFileHistoryState,
    updateAttributionState,
    setSDKStatus,
  }
}

// 类型 re-export 便于 submit-message.ts 单点 import
export type {
  AppState,
  CanUseToolFn,
  Command,
  ContentBlockParam,
  MCPServerConnection,
  Message,
  Tools,
  ToolUseContext,
}
