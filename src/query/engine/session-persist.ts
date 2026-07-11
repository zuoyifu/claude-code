import type { EngineState } from '../types.js'
import type { Message } from '../../types/message.js'
import { isBareMode, isEnvTruthy } from '../../utils/envUtils.js'
import {
  flushSessionStorage,
  recordTranscript,
} from '../../utils/sessionStorage.js'

/**
 * 持久化会话（模式 B：Promise）。
 * 替代 QueryEngine.ts 中的 persistSession。
 *
 * 注：此为 C10 拆分的新骨架实现。生产 src/QueryEngine.ts 保留原样（Plan B）。
 * session save/load 服务尚未落地为独立模块；骨架阶段的 persistSession
 * 实现为 no-op，保留签名以匹配 v2 spec §7.5 接口。后续 PR 接入真实服务时
 * 替换实现。
 */
export async function persistSession(_state: EngineState): Promise<void> {
  // 骨架阶段 no-op：生产 src/QueryEngine.ts 内部已有完整的 sessionStorage
  // 调用（flushSessionStorage / recordTranscript），此骨架不重复实现。
}

export async function loadSessionState(
  _sessionId: string,
): Promise<Partial<EngineState>> {
  // 骨架阶段：返回空对象；后续 PR 接入真实 session 加载逻辑。
  return {}
}

// ────────────────────────────────────────────────────────────────────────────
// 生产 helpers（C10.5 迁移自 src/QueryEngine.ts）
// ────────────────────────────────────────────────────────────────────────────

/**
 * 用户消息入队前的 transcript 预写（原 submitMessage :464-477）。
 *
 * --bare / SIMPLE 路径：fire-and-forget（不阻塞关键路径）。
 * 其他路径：await；EAGER_FLUSH / COWORK 时再 await flush。
 *
 * 目的：进程在 API 响应前被 kill 时，transcript 仍可从用户消息点恢复。
 */
export async function persistUserInputTranscript(
  messages: Message[],
  newMessages: readonly Message[],
  persistSession: boolean,
): Promise<void> {
  if (!persistSession || newMessages.length === 0) return
  const transcriptPromise = recordTranscript(messages)
  if (isBareMode()) {
    void transcriptPromise
    return
  }
  await transcriptPromise
  if (
    isEnvTruthy(process.env.CLAUDE_CODE_EAGER_FLUSH) ||
    isEnvTruthy(process.env.CLAUDE_CODE_IS_COWORK)
  ) {
    await flushSessionStorage()
  }
}

/**
 * shouldQuery=false 时本地命令结果的 transcript 持久化（原 submitMessage :624-632）。
 */
export async function persistLocalCommandTranscript(
  messages: Message[],
  persistSession: boolean,
): Promise<void> {
  if (!persistSession) return
  await recordTranscript(messages)
  await maybeFlushSession()
}

/**
 * compact_boundary 前 flush in-memory-only preservedSegment tail
 * （原 submitMessage :718-734）。
 *
 * 仅当 tailUuid 命中 mutableMessages 时才切片持久化。
 */
export async function flushPreservedSegmentTail(
  mutableMessages: readonly Message[],
  tailUuid: string | undefined,
): Promise<void> {
  if (!tailUuid) return
  const tailIdx = mutableMessages.findIndex(m => m.uuid === tailUuid)
  if (tailIdx !== -1) {
    await recordTranscript(mutableMessages.slice(0, tailIdx + 1) as Message[])
  }
}

/**
 * 循环内 assistant/user/compact_boundary 消息的 transcript 持久化
 * （原 submitMessage :736-751）。
 *
 * assistant 消息：fire-and-forget（避免阻塞 message_delta 流）。
 * 其他：await。
 */
export async function persistLoopMessage(
  messages: Message[],
  messageType: Message['type'],
  persistSession: boolean,
): Promise<void> {
  if (!persistSession) return
  if (messageType === 'assistant') {
    void recordTranscript(messages)
    return
  }
  await recordTranscript(messages)
}

/**
 * progress / attachment 消息的 fire-and-forget 持久化
 * （原 submitMessage :805-806, :871-872）。
 */
export function persistAttachmentInline(
  messages: Message[],
  persistSession: boolean,
): void {
  if (!persistSession) return
  void recordTranscript(messages)
}

/**
 * 结果前 flush（原 submitMessage :1133-1140）。
 * 桌面端在收到 result 消息后会 kill 进程，必须先 flush 所有 buffered 写入。
 */
export async function flushBeforeResult(
  persistSession: boolean,
): Promise<void> {
  if (!persistSession) return
  await maybeFlushSession()
}

/**
 * EAGER_FLUSH / COWORK 环境变量为真时强制 flush。
 * 用于 max_turns_reached / max_budget_usd / structured_output_retry 等错误路径
 * （原 submitMessage :892-897, :1029-1034, :1073-1079）。
 */
export async function maybeFlushSession(): Promise<void> {
  if (
    isEnvTruthy(process.env.CLAUDE_CODE_EAGER_FLUSH) ||
    isEnvTruthy(process.env.CLAUDE_CODE_IS_COWORK)
  ) {
    await flushSessionStorage()
  }
}
