// src/cli/dispatcher/teammate-options.ts
//
// C6 dispatcher 子模块：teammate 身份选项提取。
// 对应 plan `15-c6-dispatcher-split.md` Task 9。
//
// 替代 main.tsx 行 4571-4599 的 TeammateOptions 类型与 extractTeammateOptions 函数。
// 此函数为纯函数（无副作用），C6 阶段可直接提供完整实现（无需等 Task 11）。
// 但为避免 main.tsx 与 dispatcher 双份维护，暂不接入（main.tsx 仍用原函数）。
// Task 11 时从 main.tsx 删除原函数并改 import 此处。

/**
 * Teammate 身份选项（tmux-spawned agent 使用）。
 *
 * 任意字段缺失视为"非 teammate"（extractTeammateOptions 返回空对象）。
 * 若提供部分字段，main.tsx 会校验 agentId/agentName/teamName 三者齐全。
 */
export interface TeammateOptions {
  agentId?: string
  agentName?: string
  teamName?: string
  agentColor?: string
  planModeRequired?: boolean
  parentSessionId?: string
  teammateMode?: 'auto' | 'tmux' | 'in-process'
  agentType?: string
}

/**
 * 从 options 提取 teammate 身份字段。
 *
 * @param options - Commander 解析的 raw options（或任意对象）
 * @returns TeammateOptions；非对象/空对象返回 {}（空对象表示"非 teammate"）
 */
export function extractTeammateOptions(options: unknown): TeammateOptions {
  if (typeof options !== 'object' || options === null) {
    return {}
  }
  const opts = options as Record<string, unknown>
  const teammateMode = opts.teammateMode
  return {
    agentId: typeof opts.agentId === 'string' ? opts.agentId : undefined,
    agentName: typeof opts.agentName === 'string' ? opts.agentName : undefined,
    teamName: typeof opts.teamName === 'string' ? opts.teamName : undefined,
    agentColor:
      typeof opts.agentColor === 'string' ? opts.agentColor : undefined,
    planModeRequired:
      typeof opts.planModeRequired === 'boolean'
        ? opts.planModeRequired
        : undefined,
    parentSessionId:
      typeof opts.parentSessionId === 'string'
        ? opts.parentSessionId
        : undefined,
    teammateMode:
      teammateMode === 'auto' ||
      teammateMode === 'tmux' ||
      teammateMode === 'in-process'
        ? teammateMode
        : undefined,
    agentType: typeof opts.agentType === 'string' ? opts.agentType : undefined,
  }
}
