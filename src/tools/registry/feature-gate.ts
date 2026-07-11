import { feature } from 'bun:bundle'
// 注意：core/types.ts 由 C1 创建；此处先用 placeholder
// import type { Tool } from '../core/types.js'
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
 */

// TODO(C1): 把 _Tool 改为 Tool 真实类型（从 ../core/types.js 引入）
type _Tool = unknown // placeholder，C1 后改为真实 Tool 类型

/**
 * Loader 路径表（字符串形式，避免 tsc 解析尚不存在的模块路径）。
 * C2 之后这些路径指向 src/tools/builtin/feature-gated/*.js。
 */
const FEATURE_GATED_LOADER_PATHS: Record<FeatureGatedToolFlag, string> = {
  AGENT_TRIGGERS_REMOTE: '../../builtin/feature-gated/RemoteTriggerTool.js',
  MONITOR_TOOL: '../../builtin/feature-gated/MonitorTool.js',
  KAIROS: '../../builtin/feature-gated/SendUserFileTool.js',
  KAIROS_GITHUB_WEBHOOKS: '../../builtin/feature-gated/SubscribePRTool.js',
  GOAL: '../../builtin/feature-gated/GoalTool.js',
  OVERFLOW_TEST_TOOL: '../../builtin/feature-gated/OverflowTestTool.js',
  CONTEXT_COLLAPSE: '../../builtin/feature-gated/CtxInspectTool.js',
  TERMINAL_PANEL: '../../builtin/feature-gated/TerminalCaptureTool.js',
  WEB_BROWSER_TOOL: '../../builtin/feature-gated/WebBrowserTool.js',
  HISTORY_SNIP: '../../builtin/feature-gated/SnipTool.js',
  EXPERIMENTAL_SKILL_SEARCH:
    '../../builtin/feature-gated/DiscoverSkillsTool.js',
  REVIEW_ARTIFACT: '../../builtin/feature-gated/ReviewArtifactTool.js',
  UDS_INBOX: '../../builtin/feature-gated/ListPeersTool.js',
  WORKFLOW_SCRIPTS: '../../builtin/feature-gated/WorkflowTool.js',
  COORDINATOR_MODE: '../../builtin/feature-gated/CoordinatorModeModule.js',
}

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

/**
 * 加载 feature-gated 工具。
 * 返回 null 表示：flag 禁用 / import 失败 / 无 default export。
 * L2 改进：失败时打 warning，不静默。
 */
export async function loadFeatureGatedTool(
  flag: FeatureGatedToolFlag,
): Promise<_Tool | null> {
  if (!isToolEnabled(flag)) return null
  try {
    // 用字符串变量做 dynamic import，避免 tsc 解析尚不存在的路径（C2 后才存在）
    const path = FEATURE_GATED_LOADER_PATHS[flag]
    const mod = (await import(path)) as { default?: _Tool }
    if (!mod.default) {
      console.warn(
        `[feature-gate] ${flag}: import succeeded but no default export`,
      )
      return null
    }
    return mod.default
  } catch (err) {
    console.warn(`[feature-gate] ${flag}: import failed`, err)
    return null
  }
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
