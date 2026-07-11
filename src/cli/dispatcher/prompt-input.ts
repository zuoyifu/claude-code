// src/cli/dispatcher/prompt-input.ts
//
// C6 dispatcher 子模块：stdin prompt 读取。
// 对应 plan `15-c6-dispatcher-split.md` Task 9。
//
// 替代 main.tsx getInputPrompt 函数（行 1021-1056）。
// main.tsx 原函数签名含多个参数（command / fork / options 等），C6 阶段先提供简化版，
// 保留核心 stdin 读取逻辑；Task 11 时按 main.tsx 原签名补全参数。

/**
 * 从 stdin 读取 prompt（管道模式）。
 *
 * - TTY 模式：返回 undefined（由 REPL 内部处理输入）
 * - 非 TTY：读取全部 stdin，trim 后返回；空串返回 undefined
 *
 * main.tsx 原函数（行 1021-1056）还处理：
 * - command 参数（用于 deep-link 检测）
 * - fork 参数
 * - options.forkSession
 *
 * 这些参数化逻辑在 Task 11 接入时补全。
 */
export async function getInputPrompt(): Promise<string | undefined> {
  // TTY 模式（交互终端）：无 stdin prompt
  if (process.stdin.isTTY) return undefined

  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer)
  }
  const text = Buffer.concat(chunks).toString('utf8').trim()
  return text || undefined
}
