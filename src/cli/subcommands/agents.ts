// src/cli/subcommands/agents.ts
import type { Command } from '@commander-js/extra-typings'

/**
 * 注册 agents 子命令。
 * 替代 main.tsx 中 program.command('agents')... 链（原行 4596-4605）。
 */
export function define(program: Command): void {
  // Agents command - list configured agents
  program
    .command('agents')
    .description('List configured agents')
    .option(
      '--setting-sources <sources>',
      'Comma-separated list of setting sources to load (user, project, local).',
    )
    .action(async () => {
      const { agentsHandler } = await import('../handlers/agents.js')
      await agentsHandler()
      process.exit(0)
    })
}
