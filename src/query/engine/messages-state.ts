import type { Message } from '../../types/message.js'
import type { EngineState } from '../types.js'

/**
 * 消息状态管理（模式 C：同步函数）。
 * 替代 QueryEngine.ts 中 submitMessage 的消息 push 逻辑。
 *
 * 注：此为 C10 拆分的新骨架实现。生产 src/QueryEngine.ts 保留原样（Plan B）。
 */
export function pushMessage(state: EngineState, message: Message): void {
  state.messages.push(message)
}

export function getMessages(state: EngineState): Message[] {
  return state.messages
}

export function getLastAssistantMessage(
  state: EngineState,
): Message | undefined {
  for (let i = state.messages.length - 1; i >= 0; i--) {
    if (state.messages[i].role === 'assistant') return state.messages[i]
  }
  return undefined
}

export function clearMessages(state: EngineState): void {
  state.messages = []
}

// ────────────────────────────────────────────────────────────────────────────
// 生产 helpers（C10.5 迁移自 src/QueryEngine.ts）
// ────────────────────────────────────────────────────────────────────────────

/**
 * 将 messagesFromUserInput 追加到 mutableMessages（原 submitMessage :445）。
 */
export function appendMessages(
  target: Message[],
  newMessages: readonly Message[],
): void {
  target.push(...newMessages)
}

/**
 * 复制 mutableMessages 快照（原 submitMessage :448）。
 * 下游 query() 调用和 transcript 持久化都用这个 snapshot。
 */
export function snapshotMessages(source: readonly Message[]): Message[] {
  return [...source]
}

/**
 * 释放 compact_boundary 之前的消息以释放内存（原 submitMessage :968-975）。
 * boundary 已 push，所以是最后一个元素。
 */
export function releasePreBoundaryMessages(
  mutableMessages: Message[],
  localMessages: Message[],
): void {
  const mutableBoundaryIdx = mutableMessages.length - 1
  if (mutableBoundaryIdx > 0) {
    mutableMessages.splice(0, mutableBoundaryIdx)
  }
  const localBoundaryIdx = localMessages.length - 1
  if (localBoundaryIdx > 0) {
    localMessages.splice(0, localBoundaryIdx)
  }
}

/**
 * snip 回放结果替换整个 mutableMessages 数组（原 submitMessage :955-956）。
 * 通过 length=0 + spread 保持原数组引用（闭包持有的引用不断）。
 */
export function replaceMessagesInPlace(
  target: Message[],
  newMessages: readonly Message[],
): void {
  target.length = 0
  target.push(...newMessages)
}

/**
 * findLastIndex 兼容：查找指定 uuid 的消息索引。
 * 用于 snip preservedSegment.tailUuid 的尾部定位（原 submitMessage :727-729）。
 */
export function findLastIndexByUuid(
  messages: readonly Message[],
  uuid: string | undefined,
): number {
  if (!uuid) return -1
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].uuid === uuid) return i
  }
  return -1
}
