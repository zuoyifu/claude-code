// src/cli/program/types.ts

/**
 * Commander 解析后的全局 options。
 *
 * 字段对应 main.tsx 行 1150-1433 的第一个 .option() 链
 * 以及行 4463-4593 的条件性 .addOption()/.option() 链
 * （worktree、tmux、ANT-only、feature-gated）。
 *
 * Commander 会把 kebab-case flag 名转成 camelCase 属性，
 * 例如 `--permission-mode` → `permissionMode`。
 */
export interface ProgramOptions {
  // 行 1150-1433 第一个 option 链
  // -d, --debug [filter]: 解析器恒返回 true（实际过滤由 debug.ts 解析 argv）
  debug?: boolean
  debugToStderr?: boolean
  debugFile?: boolean
  verbose?: boolean
  print?: boolean
  bare?: boolean
  init?: boolean
  initOnly?: boolean
  maintenance?: boolean
  outputFormat?: 'text' | 'json' | 'stream-json'
  jsonSchema?: string
  includeHookEvents?: boolean
  includePartialMessages?: boolean
  inputFormat?: 'text' | 'stream-json'
  mcpDebug?: boolean
  dangerouslySkipPermissions?: boolean
  allowDangerouslySkipPermissions?: boolean
  thinking?: 'enabled' | 'adaptive' | 'disabled'
  maxThinkingTokens?: number
  maxTurns?: number
  maxBudgetUsd?: number
  taskBudget?: number
  replayUserMessages?: boolean
  enableAuthStatus?: boolean
  allowedTools?: string[]
  tools?: string[]
  disallowedTools?: string[]
  mcpConfig?: string[]
  permissionPromptTool?: string
  systemPrompt?: string
  systemPromptFile?: string
  appendSystemPrompt?: string
  appendSystemPromptFile?: string
  permissionMode?: string
  continue?: boolean
  resume?: string | boolean
  forkSession?: boolean
  prefill?: string
  deepLinkOrigin?: boolean
  deepLinkRepo?: string
  deepLinkLastFetch?: number
  fromPr?: string | boolean
  noSessionPersistence?: boolean
  resumeSessionAt?: string
  rewindFiles?: string
  model?: string
  effort?: 'low' | 'medium' | 'high' | 'max'
  agent?: string
  betas?: string[]
  fallbackModel?: string
  workload?: string
  settings?: string
  addDir?: string[]
  ide?: boolean
  strictMcpConfig?: boolean
  sessionId?: string
  name?: string
  agents?: string
  settingSources?: string
  pluginDir?: string[]
  disableSlashCommands?: boolean
  chrome?: boolean

  // 行 4463-4593 条件性 option 链
  worktree?: string | boolean
  tmux?: string | boolean
  advisor?: string
  delegatePermissions?: boolean
  dangerouslySkipPermissionsWithClassifiers?: boolean
  afk?: boolean
  tasks?: string
  agentTeams?: boolean
  enableAutoMode?: boolean
  proactive?: boolean
  messagingSocketPath?: string
  brief?: boolean
  assistant?: boolean
  channels?: string[]
  dangerouslyLoadDevelopmentChannels?: string[]
  agentId?: string
  agentName?: string
  teamName?: string
  agentColor?: string
  planModeRequired?: boolean
  parentSessionId?: string
  teammateMode?: 'auto' | 'tmux' | 'in-process'
  agentType?: string
  sdkUrl?: string
  teleport?: string | boolean
  remote?: string
  remoteControl?: string | boolean
  rc?: string | boolean
  hardFail?: boolean

  // Commander 内置 / 兜底
  help?: boolean
  version?: boolean

  // 未知 option 兜底（Commander 允许 allowUnknownOption）
  [key: string]: unknown
}

/**
 * preAction hook 执行后的规范化 options。
 * 字段在 hook 中被填充或转换。
 *
 * C6 dispatcher 阶段额外补充 normalizeOptions() 推断出的布尔标志
 * （isHeadless / isResume / isContinue），供 dispatcher/index.ts 使用。
 */
export interface NormalizedOptions extends ProgramOptions {
  cwd: string
  sessionId: string
  permissionMode:
    | 'default'
    | 'plan'
    | 'acceptEdits'
    | 'bypassPermissions'
    | string
  /** 是否 headless 模式（-p 显式或 stdin 非 TTY）。由 normalizeOptions 推断。 */
  isHeadless: boolean
  /** 是否 --resume（Commander 解析 resume 字段存在）。由 normalizeOptions 推断。 */
  isResume: boolean
  /** 是否 --continue（Commander 解析 continue === true）。由 normalizeOptions 推断。 */
  isContinue: boolean
}
