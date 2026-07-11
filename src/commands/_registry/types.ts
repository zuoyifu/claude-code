import type { Command } from '../../types/command.js'

/**
 * 命令主题分组。由 scanner 从目录路径推导（M4 修正：不在 CommandSpec 中重复声明）。
 *
 * 命令目录路径必须匹配 commands/<category>/<name>/index.ts。
 */
export type CommandCategory =
  | 'session-info' // 原 commands/session/，M5 重命名
  | 'session' // 会话生命周期：clear/resume/rewind/fork/rename/tag/compact/export
  | 'mcp' // MCP 子系统：serve/add/remove/list
  | 'model' // 模型与 provider：model/login/logout/provider/fast/effort
  | 'config' // 配置与权限：config/permissions/hooks/keybindings/theme/vim
  | 'memory' // 记忆系统：memory/local-memory/memory-stores
  | 'skills' // 技能：skills/skill-search/skill-store/skill-learning
  | 'plugins' // 插件：plugin/reload-plugins/install-*
  | 'tasks' // 任务与调度：tasks/agents/job/schedule
  | 'ui' // UI 控制：color/statusline/tui
  | 'debug' // 调试：doctor/debug-tool-call/perf-issue/heapdump/env
  | 'review' // 代码审查：review/security-review/autofix-pr/pr_comments
  | 'version' // 版本：version/upgrade/release-notes
  | 'files' // 文件操作：files/diff/add-dir/copy
  | 'bridge' // Bridge/RCS：bridge/remoteControlServer/remote-env/remote-setup
  | 'daemon' // 守护进程：daemon/attach/detach/status
  | '_misc' // 临时归桶，目标趋近于空

/**
 * 命令可见性——取代当前 commands.ts 顶部的多个数组。
 */
export type CommandVisibility =
  | 'public' // 普通用户可见（默认）
  | 'internal' // 仅 USER_TYPE=ant 可见（取代 INTERNAL_ONLY_COMMANDS）
  | 'feature-gated' // 由 feature flag 控制（featureGate 字段必填）

/**
 * 命令安全级别——取代 REMOTE_SAFE_COMMANDS / BRIDGE_SAFE_COMMANDS。
 */
export type CommandSafety =
  | 'remote-safe' // 取代 REMOTE_SAFE_COMMANDS
  | 'bridge-safe' // 取代 BRIDGE_SAFE_COMMANDS
  | 'restricted' // 默认

/**
 * 命令 spec——在现有 Command 类型基础上扩展。
 * 所有新字段 optional，向后兼容。
 *
 * Note: 使用 type alias + intersection 而非 interface extends，因为
 * Command 是 `CommandBase & (PromptCommand | LocalCommand | LocalJSXCommand)`
 * 联合类型，interface 无法 extends 联合类型（TS2312）。
 */
export type CommandSpec = Command & {
  /**
   * 命令可见性。默认 'public'。
   * - 'internal' 替代原 INTERNAL_ONLY_COMMANDS 集合
   * - 'feature-gated' 必须填 featureGate
   */
  visibility?: CommandVisibility

  /**
   * 命令安全级别。默认 'restricted'。
   * - 'remote-safe' 替代原 REMOTE_SAFE_COMMANDS
   * - 'bridge-safe' 替代原 BRIDGE_SAFE_COMMANDS
   */
  safety?: CommandSafety

  /**
   * visibility='feature-gated' 时必填。
   * flag 名必须存在于 scripts/defines.ts 的 DEFAULT_BUILD_FEATURES。
   */
  featureGate?: string
}

/**
 * 扫描器注入的最终形态——运行时由 generated.ts 提供。
 * 业务代码不直接创建此类型，只消费。
 */
export type RegisteredCommand = CommandSpec & {
  /**
   * 主题分组——由 scanner 从目录路径推导（M4 修正）。
   */
  category: CommandCategory

  /**
   * 源文件相对路径，例如 'commands/session/clear/index.ts'。
   * 用于调试和错误信息。
   */
  sourcePath: string
}
