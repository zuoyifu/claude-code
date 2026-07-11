import type { Message } from '../../types/message.js'

/**
 * 把流事件 reduce 到消息对象。
 * 委托模式 C（同步函数）：调用方直接调用。
 *
 * 注：这是 C9 拆分的新骨架，仅处理 content_block_* 基础事件。
 * 生产 query.ts 的完整流处理逻辑保留原样（Plan B：薄包装层）。
 */
export function reduceMessage(
  acc: Message,
  event: unknown,
): { message: Message } {
  const evt = event as { type: string; [key: string]: unknown }
  const message = acc
  // 从 query.ts 流处理逻辑搬移
  // 处理 content_block_start / content_block_delta / content_block_stop
  // 累积 text / tool_use blocks
  switch (evt.type) {
    case 'content_block_start':
      // 初始化新 block（骨架实现）
      break
    case 'content_block_delta':
      // 追加 delta 到当前 block（骨架实现）
      break
    case 'content_block_stop':
      // 结束当前 block（骨架实现）
      break
    default:
      // 其他事件类型忽略
      break
  }
  return { message }
}
