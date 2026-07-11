// src/cli/subcommands/doctor.ts
import type { Command } from '@commander-js/extra-typings'
import { getBaseRenderOptions } from '../../utils/renderOptions.js'

/**
 * 注册 doctor 子命令。
 * 替代 main.tsx 中 program.command('doctor')... 链（原行 4744-4757）。
 */
export function define(program: Command): void {
  // Doctor command - check installation health
  program
    .command('doctor')
    .description(
      'Check the health of your Claude Code auto-updater. Note: The workspace trust dialog is skipped and stdio servers from .mcp.json are spawned for health checks. Only use this command in directories you trust.',
    )
    .action(async () => {
      const [{ doctorHandler }, { createRoot }] = await Promise.all([
        import('../handlers/util.js'),
        import('@anthropic/ink'),
      ])
      const root = await createRoot(getBaseRenderOptions(false))
      await doctorHandler(root)
    })
}
