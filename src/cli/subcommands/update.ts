// src/cli/subcommands/update.ts
import type { Command } from '@commander-js/extra-typings'

/**
 * 注册 update 子命令。
 * 替代 main.tsx 中 program.command('update')... 链（原行 4810-4817）。
 */
export function define(program: Command): void {
  // claude update — update ccb to the latest version via npm or bun
  program
    .command('update')
    .description('Update claude-code-best (ccb) to the latest version')
    .action(async () => {
      const { updateCCB } = await import('../updateCCB.js')
      await updateCCB()
    })
}
