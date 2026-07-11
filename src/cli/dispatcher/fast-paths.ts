// src/cli/dispatcher/fast-paths.ts
//
// C6 dispatcher 子模块：action 内的 fast-path 判断。
// 对应 plan `15-c6-dispatcher-split.md` Task 9。
//
// 替代 main.tsx defaultAction 顶部的 early-return 分支（行 1070-1100 等）。
//
// **注意：** main.tsx 中 --version / --help 由 Commander 自身处理（program.version() /
// program.help()），不进入 defaultAction。defaultAction 内的实际 fast-path 较少：
// - `prompt === 'code'` → 重置为 undefined（行 1080-1084）
// - `options.bare` → 设置 CLAUDE_CODE_SIMPLE 环境变量（行 1075-1077）
// - 单词 prompt 日志（行 1087-1089）
//
// 这些都是"配置/日志"性质的前置处理，非 exit-fast-path。
// 真正的 exit-fast-path 在更外层的 main() 函数（cli.tsx 入口已处理）。

import type { DispatcherContext, FastPathResult } from './types.js'

/**
 * 检查 action 内的 fast-path。
 *
 * plan 原示例假设 --version 在此处处理，但实际 main.tsx 把 --version 委托给
 * Commander 的 `program.version()`。defaultAction 内无 exit-fast-path。
 *
 * 当前实现：恒返回 `{ handled: false }`。
 * 保留此函数作为 Task 11 接入点（若未来需要新增 fast-path）。
 */
export function checkActionFastPath(_ctx: DispatcherContext): FastPathResult {
  // 当前无 fast-path 需要在此处理。
  return { handled: false }
}

/**
 * 处理 prompt 预处理（原 main.tsx 行 1080-1089）。
 *
 * - `prompt === 'code'` → 重置为 undefined + 日志
 * - 单词 prompt → 日志
 *
 * 此函数不是 exit-fast-path，而是 prompt 规范化。
 * 返回处理后的 prompt（可能为 undefined）。
 */
export function preprocessPrompt(
  prompt: string | undefined,
  onLogCode?: () => void,
  onLogSingleWord?: (length: number) => void,
): string | undefined {
  // Ignore "code" as a prompt - treat it the same as no prompt
  if (prompt === 'code') {
    onLogCode?.()
    return undefined
  }

  // Log event for any single-word prompt
  if (
    prompt &&
    typeof prompt === 'string' &&
    !/\s/.test(prompt) &&
    prompt.length > 0
  ) {
    onLogSingleWord?.(prompt.length)
  }

  return prompt
}

/**
 * 处理 --bare 模式（原 main.tsx 行 1075-1077）。
 * 设置 CLAUDE_CODE_SIMPLE=1 触发 simple 模式。
 */
export function activateBareMode(ctx: DispatcherContext): void {
  const bare = (ctx.options as { bare?: boolean }).bare
  if (bare) {
    process.env.CLAUDE_CODE_SIMPLE = '1'
  }
}
