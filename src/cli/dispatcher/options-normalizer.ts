// src/cli/dispatcher/options-normalizer.ts
//
// C6 dispatcher 子模块：把 Commander 解析的 raw options 规范化为 NormalizedOptions。
// 对应 plan `15-c6-dispatcher-split.md` Task 3。
//
// 当前 main.tsx 的 defaultAction 顶部（行 1151-1168 等）对 raw options 做解构和默认值填充，
// 本模块集中这部分逻辑，供 dispatcher/index.ts 调用。
// 互斥校验（--resume vs --continue、--print vs resume/continue）在此统一抛错。

import type { ProgramOptions, NormalizedOptions } from '../program/types.js'
import { randomUUID } from 'node:crypto'

/**
 * 把 Commander 解析的 raw options 规范化为 NormalizedOptions。
 *
 * 行为：
 * - 不传 `programCwd` 时用 `process.cwd()`
 * - `sessionId` 缺失时自动生成（randomUUID）
 * - 解析 permissionMode（--dangerously-skip-permissions 优先；其次 --permission-mode；否则 'default'）
 * - 推断 isHeadless：`--print` 被显式使用 或 stdin 非 TTY
 * - 推断 isResume / isContinue，并做互斥校验
 *
 * 互斥规则：
 * - `--resume` 与 `--continue` 不能同时使用
 * - `--print` 不能与 `--resume` / `--continue` 同时使用
 */
export function normalizeOptions(
  raw: ProgramOptions,
  programCwd?: string,
): NormalizedOptions {
  const cwd = programCwd ?? process.cwd()

  const sessionId = raw.sessionId ?? generateSessionId()
  const permissionMode = resolvePermissionMode(raw)

  // `--print` 被显式传入（含 `true`/字符串），或 stdin 非 TTY（管道/重定向）均视为 headless。
  // 注意：`process.stdin.isTTY` 在某些环境为 `undefined`，需用 `=== false` 严格判定。
  const isHeadless = raw.print !== undefined || process.stdin.isTTY === false

  // Commander 会把不带值的 `--resume` 解析为 `true`，带值则为字符串。
  const isResume = raw.resume !== undefined
  const isContinue = raw.continue === true

  // 互斥校验
  if (isResume && isContinue) {
    throw new Error('--resume and --continue are mutually exclusive')
  }
  if (isHeadless && (isResume || isContinue)) {
    throw new Error('--print cannot be used with --resume/--continue')
  }

  // 以原 options 为基底填充规范化字段。ProgramOptions 的 index signature 允许扩展。
  const normalized = {
    ...raw,
    cwd,
    sessionId,
    permissionMode,
    isHeadless,
    isResume,
    isContinue,
  } as NormalizedOptions

  return normalized
}

function generateSessionId(): string {
  return randomUUID()
}

function resolvePermissionMode(
  raw: ProgramOptions,
): NormalizedOptions['permissionMode'] {
  if (raw.dangerouslySkipPermissions) return 'bypassPermissions'
  if (raw.permissionMode) {
    const valid = ['default', 'plan', 'acceptEdits', 'bypassPermissions']
    if (valid.includes(raw.permissionMode)) {
      return raw.permissionMode as NormalizedOptions['permissionMode']
    }
  }
  return 'default'
}
