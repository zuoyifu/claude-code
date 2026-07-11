// src/cli/dispatcher/types.ts
//
// C6 dispatcher 模块的类型定义。
//
// 对应 plan `15-c6-dispatcher-split.md` Task 2。
// 字段数硬上限 20（v2 spec §6.2），当前 19 字段。
// 详见 docs/superpowers/refactor-assets/dispatcher-closure-analysis.md。

import type { ProgramOptions, NormalizedOptions } from '../program/types.js'
import type { ToolPermissionContext } from '../../tools/core/types.js'

/**
 * Dispatcher 上下文 —— H2 设计。
 *
 * 只装载"请求期"必需的、被 2 个以上子模块使用的变量。
 * 字段数硬上限 20（v2 spec §6.2）。
 *
 * 启动期变量（telemetry handles、settings cache、MCP connections 等）
 * 保留在 `bootstrap/` 各子模块内部，不暴露到此 context。
 * 临时变量（单次使用的解析结果、渲染态等）保留在各子模块内部。
 */
export interface DispatcherContext {
  // === 请求期变量（19 字段，<= 20 硬上限） ===

  /** 规范化后的 options */
  options: NormalizedOptions

  /** 权限上下文（setupPermissions 填充） */
  permissionCtx: ToolPermissionContext

  /** 会话 ID（--resume 指定或自动生成） */
  sessionId: string

  /** 工作目录 */
  cwd: string

  /** 用户输入 prompt（如有） */
  prompt?: string

  /** 是否 headless 模式（-p / 非 TTY） */
  isHeadless: boolean

  /** 是否 resume 模式（--resume） */
  isResume: boolean

  /** 是否 continue 模式（--continue） */
  isContinue: boolean

  /** worktree 配置 */
  worktree?: { enabled: boolean; branch?: string }

  /** tmux 集成配置 */
  tmux?: boolean

  /** MCP 配置（连接后的句柄） */
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

  /** 附加目录（--add-dir） */
  addDirs?: string[]

  /** 输入格式 */
  inputFormat?: string

  /** 输出格式 */
  outputFormat?: string

  // 字段数：19（<= 20 硬上限）
}

/**
 * 快速路径判断结果。
 *
 * 由 `fast-paths.checkActionFastPath` 返回。
 * `handled === true` 表示 action 已完成（通常已调用 process.exit）。
 */
export interface FastPathResult {
  handled: boolean
  exitCode?: number
}

export type { ProgramOptions, NormalizedOptions }
