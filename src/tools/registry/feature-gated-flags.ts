/**
 * 所有工具注册级 feature flag 常量。
 * 必须与 scripts/defines.ts 中的 DEFAULT_BUILD_FEATURES 对齐。
 *
 * 此文件存在的目的：
 * 1. IDE 跳转支持
 * 2. P3 mock 引用
 * 3. C2 完成后 validateFeatureGateFlags 校验
 */
export const FEATURE_GATED_TOOL_FLAGS = [
  'AGENT_TRIGGERS_REMOTE',
  'MONITOR_TOOL',
  'KAIROS',
  'KAIROS_GITHUB_WEBHOOKS',
  'GOAL',
  'OVERFLOW_TEST_TOOL',
  'CONTEXT_COLLAPSE',
  'TERMINAL_PANEL',
  'WEB_BROWSER_TOOL',
  'HISTORY_SNIP',
  'EXPERIMENTAL_SKILL_SEARCH',
  'REVIEW_ARTIFACT',
  'UDS_INBOX',
  'WORKFLOW_SCRIPTS',
  'COORDINATOR_MODE',
  'HISTORY_SNIP',
] as const

export type FeatureGatedToolFlag = (typeof FEATURE_GATED_TOOL_FLAGS)[number]
