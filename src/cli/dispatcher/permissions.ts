// src/cli/dispatcher/permissions.ts
//
// C6 dispatcher 子模块：权限上下文设置。
// 对应 plan `15-c6-dispatcher-split.md` Task 5。
//
// 替代 main.tsx defaultAction 中权限初始化逻辑（行 ~2000-2200 / 实际 ~1700-1900）。
//
// **当前状态（C6 阶段）：** 骨架函数。具体规则解析（--allowed-tools / --disallowed-tools
// → alwaysAllowRules / alwaysDenyRules）在 Task 11 接入前从 main.tsx 迁入。
// 当前提供：bypassPermissions 环境校验（root 防护）+ 基础 context 构造。

import type { DispatcherContext } from './types.js'
import type { ToolPermissionContext } from '../../tools/core/types.js'
import { getEmptyToolPermissionContext } from '../../tools/core/types.js'

/**
 * 设置权限上下文。
 *
 * 步骤：
 * 1. 从空 context 起步（getEmptyToolPermissionContext）
 * 2. 填充 mode（permissionMode）
 * 3. 如果是 bypassPermissions，校验环境（非 root、非 sandbox 外）
 * 4. TODO(Task11): 解析 allowedTools/disallowedTools → alwaysAllowRules/alwaysDenyRules
 * 5. TODO(Task11): 填充 additionalWorkingDirectories（--add-dir）
 *
 * @returns 填充后的 ToolPermissionContext
 * @throws 如果 bypassPermissions 在不安全环境（root）
 */
export async function setupPermissions(
  ctx: DispatcherContext,
): Promise<ToolPermissionContext> {
  const permissionCtx: ToolPermissionContext = {
    ...getEmptyToolPermissionContext(),
    mode: (ctx.permissionMode ?? 'default') as ToolPermissionContext['mode'],
  }

  // 如果是 bypassPermissions，检查环境（非 root）
  // 原逻辑：main.tsx defaultAction 内 `--dangerously-skip-permissions` 校验
  if (permissionCtx.mode === 'bypassPermissions') {
    assertBypassPermissionsSafe()
  }

  // TODO(Task11): 从 main.tsx 迁入 allowedTools / disallowedTools 规则解析
  // 当前：空实现，原逻辑仍在 main.tsx defaultAction 内执行。

  return permissionCtx
}

/**
 * 校验 bypassPermissions 可用性。
 *
 * main.tsx 原逻辑（行 ~2000 附近）：
 * - root 用户（getuid() === 0）禁止
 * - sandbox 环境允许（由调用方通过环境变量标记）
 */
function assertBypassPermissionsSafe(): void {
  if (typeof process.getuid === 'function' && process.getuid() === 0) {
    throw new Error(
      'bypassPermissions cannot be used as root. Run as a non-root user or use a sandbox.',
    )
  }
}
