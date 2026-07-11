// src/cli/dispatcher/headless.ts
//
// C6 dispatcher 子模块：headless 模式（-p / 非 TTY）。
// 对应 plan `15-c6-dispatcher-split.md` Task 7。
//
// 替代 main.tsx defaultAction 中 headless 逻辑（行 ~2600-3400 / 实际 ~2300-3100）。
//
// **当前状态（C6 阶段）：** 骨架函数。
// main.tsx 原 headless 路径（print.ts / structuredIO.ts）非常复杂（~800 行），
// 涉及 syntheticOutput、outputFormat 三种模式、preFlight 等。C6 不迁入，
// 保持 no-op 避免破坏 -p 模式。Task 11 时按"逐分支迁移"策略搬移。

import type { DispatcherContext } from './types.js'

/**
 * Headless 模式执行。
 *
 * 步骤（plan 描述）：
 * 1. 读取输入（prompt 参数 / --print 值 / stdin）
 * 2. 构造 QueryEngine
 * 3. submitMessage 并消费事件流
 * 4. 按 outputFormat 渲染（text / json / stream-json）
 * 5. process.exit(0)
 *
 * **当前实现：no-op。** Task 11 时从 main.tsx 行 ~2300-3100 迁入。
 */
export async function runHeadless(
  _prompt: string | undefined,
  _ctx: DispatcherContext,
): Promise<void> {
  // TODO(Task11): 完整迁移。
  //
  // const input = await readHeadlessInput(prompt, ctx)
  // const { printHeadless } = await import('../print.js')
  // await printHeadless({ ... })
  // process.exit(0)
  //
  // 注意：main.tsx 现有 headless 路径通过 src/cli/print.ts（222KB）处理，
  // 不经 QueryEngine 直接路径。迁移时需保留 print.ts 入口。
  void _prompt
  void _ctx
}

/**
 * 读取 headless 输入：prompt 参数 > --print 值 > stdin。
 * TODO(Task11): 从 main.tsx 迁入（含 stdin 读取 + trimming 逻辑）。
 */
export async function readHeadlessInput(
  prompt: string | undefined,
  ctx: DispatcherContext,
): Promise<string> {
  if (prompt) return prompt
  const printValue = ctx.options.print
  if (typeof printValue === 'string') return printValue

  // 从 stdin 读取（原 main.tsx 逻辑）
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer)
  }
  return Buffer.concat(chunks).toString('utf8')
}

/**
 * 按 outputFormat 渲染单个事件。
 * TODO(Task11): 从 main.tsx / print.ts 迁入完整渲染逻辑。
 */
export function renderHeadlessEvent(
  _event: unknown,
  _ctx: DispatcherContext,
): void {
  // TODO(Task11): 完整迁移
  // if (ctx.options.outputFormat === 'json') {
  //   process.stdout.write(JSON.stringify(event) + '\n')
  // } else if (ctx.options.outputFormat === 'stream-json') {
  //   process.stdout.write(JSON.stringify(event) + '\n')
  // } else {
  //   process.stdout.write(String((event as { text?: string }).text ?? ''))
  // }
}
