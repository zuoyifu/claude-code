/* eslint-disable @typescript-eslint/no-require-imports */
import { feature } from 'bun:bundle'
import type { Tool } from '../core/types.js'
import {
  FEATURE_GATED_TOOL_FLAGS,
  type FeatureGatedToolFlag,
} from './feature-gated-flags.js'

/**
 * 工具注册级 feature gating 边界。
 *
 * 仅本文件内允许调用 feature('XXX')。其他业务代码必须通过本模块的 API。
 *
 * C2 之后，src/tools/ 下任何其他文件出现 `feature(...)` 都会被 dependency-cruiser
 * 的 `feature-bundle-tool-boundary` 规则警告。
 *
 * Bun 编译器约束：`feature('X')` 只能直接出现在 `if (feature('X')) {}` 的条件位置，
 * 不能赋值给变量、不能放在 return/ternary/&& 链里。因此 `isToolEnabled` 必须用
 * 显式的 if 语句展开每个 flag，不能用 `feature(flag)` 变量调用。
 *
 * H5 决策（Plan B 触发）：保留 getTools() 同步语义。本模块同时提供：
 *   - isToolEnabled(flag): 同步 flag 检查
 *   - loadFeatureGatedToolSync(flag): 同步加载（require()），供 assembler.ts 用
 *   - loadFeatureGatedTool(flag): 异步加载（dynamic import），供未来 async 化用
 */

type _Tool = Tool

// ============================================================================
// 同步加载器表（Plan B：保持 getTools 同步）
// ============================================================================
// 每个 loader 返回 Tool | null。null 表示 flag 禁用或模块不可用。
// 路径必须与 assembler.ts 原 require() 路径一致。

type SyncToolLoader = () => _Tool | null

const SYNC_LOADERS: Record<FeatureGatedToolFlag, SyncToolLoader> = {
  AGENT_TRIGGERS_REMOTE: () =>
    isToolEnabled('AGENT_TRIGGERS_REMOTE')
      ? require('@claude-code-best/builtin-tools/tools/RemoteTriggerTool/RemoteTriggerTool.js')
          .RemoteTriggerTool
      : null,
  MONITOR_TOOL: () =>
    isToolEnabled('MONITOR_TOOL')
      ? require('@claude-code-best/builtin-tools/tools/MonitorTool/MonitorTool.js')
          .MonitorTool
      : null,
  KAIROS: () =>
    isToolEnabled('KAIROS')
      ? require('@claude-code-best/builtin-tools/tools/SendUserFileTool/SendUserFileTool.js')
          .SendUserFileTool
      : null,
  KAIROS_PUSH_NOTIFICATION: () =>
    isToolEnabled('KAIROS_PUSH_NOTIFICATION')
      ? require('@claude-code-best/builtin-tools/tools/PushNotificationTool/PushNotificationTool.js')
          .PushNotificationTool
      : null,
  PROACTIVE: () =>
    // SleepTool 由 isSleepToolEnabled 决定，此 loader 仅用于 flag 暴露
    null,
  KAIROS_GITHUB_WEBHOOKS: () =>
    isToolEnabled('KAIROS_GITHUB_WEBHOOKS')
      ? require('@claude-code-best/builtin-tools/tools/SubscribePRTool/SubscribePRTool.js')
          .SubscribePRTool
      : null,
  GOAL: () =>
    isToolEnabled('GOAL')
      ? require('@claude-code-best/builtin-tools/tools/GoalTool/GoalTool.js')
          .GoalTool
      : null,
  OVERFLOW_TEST_TOOL: () =>
    isToolEnabled('OVERFLOW_TEST_TOOL')
      ? require('@claude-code-best/builtin-tools/tools/OverflowTestTool/OverflowTestTool.js')
          .OverflowTestTool
      : null,
  CONTEXT_COLLAPSE: () =>
    isToolEnabled('CONTEXT_COLLAPSE')
      ? require('@claude-code-best/builtin-tools/tools/CtxInspectTool/CtxInspectTool.js')
          .CtxInspectTool
      : null,
  TERMINAL_PANEL: () =>
    isToolEnabled('TERMINAL_PANEL')
      ? require('@claude-code-best/builtin-tools/tools/TerminalCaptureTool/TerminalCaptureTool.js')
          .TerminalCaptureTool
      : null,
  WEB_BROWSER_TOOL: () =>
    isToolEnabled('WEB_BROWSER_TOOL')
      ? require('@claude-code-best/builtin-tools/tools/WebBrowserTool/WebBrowserTool.js')
          .WebBrowserTool
      : null,
  HISTORY_SNIP: () =>
    isToolEnabled('HISTORY_SNIP')
      ? require('@claude-code-best/builtin-tools/tools/SnipTool/SnipTool.js')
          .SnipTool
      : null,
  EXPERIMENTAL_SKILL_SEARCH: () =>
    isToolEnabled('EXPERIMENTAL_SKILL_SEARCH')
      ? require('@claude-code-best/builtin-tools/tools/DiscoverSkillsTool/DiscoverSkillsTool.js')
          .DiscoverSkillsTool
      : null,
  REVIEW_ARTIFACT: () =>
    isToolEnabled('REVIEW_ARTIFACT')
      ? require('@claude-code-best/builtin-tools/tools/ReviewArtifactTool/ReviewArtifactTool.js')
          .ReviewArtifactTool
      : null,
  UDS_INBOX: () =>
    isToolEnabled('UDS_INBOX')
      ? require('@claude-code-best/builtin-tools/tools/ListPeersTool/ListPeersTool.js')
          .ListPeersTool
      : null,
  WORKFLOW_SCRIPTS: () =>
    isToolEnabled('WORKFLOW_SCRIPTS')
      ? require('../../workflow/wiring.js').createWorkflowToolCore()
      : null,
  COORDINATOR_MODE: () =>
    // coordinatorModeModule 不是工具，而是模块；由专用加载器处理
    null,
}

// ============================================================================
// OR-semantics 专用加载器（H5 决策：封装 OR 逻辑避免 feature() 泄漏）
// ============================================================================

/**
 * SleepTool 启用条件: PROACTIVE || KAIROS（OR-semantics）。
 * 封装在本边界内，避免 assembler.ts 调用 feature()。
 */
export function loadSleepToolSync(): _Tool | null {
  if (!isSleepToolEnabled()) return null
  return require('@claude-code-best/builtin-tools/tools/SleepTool/SleepTool.js')
    .SleepTool
}

export function isSleepToolEnabled(): boolean {
  return isToolEnabled('PROACTIVE') || isToolEnabled('KAIROS')
}

/**
 * PushNotificationTool 启用条件: KAIROS || KAIROS_PUSH_NOTIFICATION（OR-semantics）。
 */
export function loadPushNotificationToolSync(): _Tool | null {
  if (!isPushNotificationEnabled()) return null
  return require('@claude-code-best/builtin-tools/tools/PushNotificationTool/PushNotificationTool.js')
    .PushNotificationTool
}

export function isPushNotificationEnabled(): boolean {
  return isToolEnabled('KAIROS') || isToolEnabled('KAIROS_PUSH_NOTIFICATION')
}

/**
 * 加载 coordinatorMode 模块（非工具，是 isCoordinatorMode() 函数载体）。
 * 封装在边界内，避免 assembler.ts / REPL.tsx 直接调用 feature()。
 */
type CoordinatorModeModule =
  typeof import('../../coordinator/coordinatorMode.js')

export function loadCoordinatorModeModuleSync(): CoordinatorModeModule | null {
  if (!isToolEnabled('COORDINATOR_MODE')) return null
  try {
    return require('../../coordinator/coordinatorMode.js') as CoordinatorModeModule
  } catch {
    return null
  }
}

// ============================================================================
// flag 检查（唯一 feature() 调用边界）
// ============================================================================

/**
 * 检查 flag 是否启用。
 * 唯一一处 feature() 调用边界。
 *
 * 注意：必须用显式 if 语句展开，因为 Bun 编译器要求 feature() 参数是字符串字面量，
 * 且 feature() 只能出现在 if 条件位置。
 */
export function isToolEnabled(flag: FeatureGatedToolFlag): boolean {
  // 每个 flag 必须显式展开为 `if (feature('FLAG'))` —— 这是 Bun 宏的唯一合法用法
  if (flag === 'AGENT_TRIGGERS_REMOTE') {
    if (feature('AGENT_TRIGGERS_REMOTE')) return true
  }
  if (flag === 'MONITOR_TOOL') {
    if (feature('MONITOR_TOOL')) return true
  }
  if (flag === 'KAIROS') {
    if (feature('KAIROS')) return true
  }
  if (flag === 'KAIROS_PUSH_NOTIFICATION') {
    if (feature('KAIROS_PUSH_NOTIFICATION')) return true
  }
  if (flag === 'PROACTIVE') {
    if (feature('PROACTIVE')) return true
  }
  if (flag === 'KAIROS_GITHUB_WEBHOOKS') {
    if (feature('KAIROS_GITHUB_WEBHOOKS')) return true
  }
  if (flag === 'GOAL') {
    if (feature('GOAL')) return true
  }
  if (flag === 'OVERFLOW_TEST_TOOL') {
    if (feature('OVERFLOW_TEST_TOOL')) return true
  }
  if (flag === 'CONTEXT_COLLAPSE') {
    if (feature('CONTEXT_COLLAPSE')) return true
  }
  if (flag === 'TERMINAL_PANEL') {
    if (feature('TERMINAL_PANEL')) return true
  }
  if (flag === 'WEB_BROWSER_TOOL') {
    if (feature('WEB_BROWSER_TOOL')) return true
  }
  if (flag === 'HISTORY_SNIP') {
    if (feature('HISTORY_SNIP')) return true
  }
  if (flag === 'EXPERIMENTAL_SKILL_SEARCH') {
    if (feature('EXPERIMENTAL_SKILL_SEARCH')) return true
  }
  if (flag === 'REVIEW_ARTIFACT') {
    if (feature('REVIEW_ARTIFACT')) return true
  }
  if (flag === 'UDS_INBOX') {
    if (feature('UDS_INBOX')) return true
  }
  if (flag === 'WORKFLOW_SCRIPTS') {
    if (feature('WORKFLOW_SCRIPTS')) return true
  }
  if (flag === 'COORDINATOR_MODE') {
    if (feature('COORDINATOR_MODE')) return true
  }
  return false
}

// ============================================================================
// 非工具注册级 flag 的边界封装（run-tool-use.ts 用）
// ============================================================================

/**
 * 检查 TRANSCRIPT_CLASSIFIER flag。
 * 该 flag 不属于工具注册级（在 tools/execution/run-tool-use.ts 用于权限分类），
 * 但因 F2 约束 "src/tools/ 下无 feature()"，在此边界封装。
 */
export function isTranscriptClassifierEnabled(): boolean {
  if (feature('TRANSCRIPT_CLASSIFIER')) return true
  return false
}

// ============================================================================
// 工具加载 API
// ============================================================================

/**
 * 同步加载 feature-gated 工具（Plan B：保持 getTools 同步）。
 * 返回 null 表示：flag 禁用 / 模块不可用。
 *
 * 注意：对 OR-semantics flag（PROACTIVE / KAIROS_PUSH_NOTIFICATION），请用
 * 专用加载器（loadSleepToolSync / loadPushNotificationToolSync）。
 */
export function loadFeatureGatedToolSync(
  flag: FeatureGatedToolFlag,
): _Tool | null {
  try {
    return SYNC_LOADERS[flag]()
  } catch (err) {
    console.warn(`[feature-gate] ${flag}: sync require failed`, err)
    return null
  }
}

/**
 * 异步加载 feature-gated 工具（供未来 async getTools 化使用）。
 * 返回 null 表示：flag 禁用 / import 失败 / 无 default export。
 * L2 改进：失败时打 warning，不静默。
 */
export async function loadFeatureGatedTool(
  flag: FeatureGatedToolFlag,
): Promise<_Tool | null> {
  if (!isToolEnabled(flag)) return null
  // 异步加载委托给同步 loader（两者语义一致，require 在 Bun 中是同步的）
  return loadFeatureGatedToolSync(flag)
}

/**
 * 列出当前启用的 feature-gated flag。
 * 在 tools/builtin/index.ts 装配时使用。
 */
export function listEnabledFeatureGatedTools(): FeatureGatedToolFlag[] {
  return FEATURE_GATED_TOOL_FLAGS.filter(isToolEnabled)
}

/**
 * L2 改进：启动期校验所有声明的 flag 在 build.ts 中存在。
 * 在 cli/bootstrap/ 中调用一次。
 *
 * 当前阶段（P1）：仅做 placeholder 检查（flag 必须在 FEATURE_GATED_TOOL_FLAGS 列表中）。
 * P4 完成后：与 build.ts 生成的 flag 列表交叉验证。
 */
export function validateFeatureGateFlags(
  knownFlags?: ReadonlySet<string>,
): void {
  for (const flag of FEATURE_GATED_TOOL_FLAGS) {
    if (knownFlags && !knownFlags.has(flag)) {
      console.warn(
        `[feature-gate] Unknown flag in feature-gate.ts: ${flag} (not in build.ts defines)`,
      )
    }
  }
}
