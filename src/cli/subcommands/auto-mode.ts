// src/cli/subcommands/auto-mode.ts
import type { Command } from '@commander-js/extra-typings'
import { feature } from 'bun:bundle'
import { getAutoModeEnabledStateIfCached } from '../../utils/permissions/permissionSetup.js'

/**
 * 注册 auto-mode 及其子命令（defaults/config/critique）。
 * 替代 main.tsx 中 program.command('auto-mode')... 链（原行 4607-4641）。
 *
 * feature-gated by TRANSCRIPT_CLASSIFIER。Skip when
 * tengu_auto_mode_config.enabled === 'disabled'（circuit breaker）。
 * Reads from disk cache — GrowthBook isn't initialized at registration time.
 */
export function define(program: Command): void {
  if (feature('TRANSCRIPT_CLASSIFIER')) {
    // Skip when tengu_auto_mode_config.enabled === 'disabled' (circuit breaker).
    // Reads from disk cache — GrowthBook isn't initialized at registration time.
    if (getAutoModeEnabledStateIfCached() !== 'disabled') {
      const autoModeCmd = program
        .command('auto-mode')
        .description('Inspect auto mode classifier configuration')

      autoModeCmd
        .command('defaults')
        .description(
          'Print the default auto mode environment, allow, and deny rules as JSON',
        )
        .action(async () => {
          const { autoModeDefaultsHandler } = await import(
            '../handlers/autoMode.js'
          )
          autoModeDefaultsHandler()
          process.exit(0)
        })

      autoModeCmd
        .command('config')
        .description(
          'Print the effective auto mode config as JSON: your settings where set, defaults otherwise',
        )
        .action(async () => {
          const { autoModeConfigHandler } = await import(
            '../handlers/autoMode.js'
          )
          autoModeConfigHandler()
          process.exit(0)
        })

      autoModeCmd
        .command('critique')
        .description('Get AI feedback on your custom auto mode rules')
        .option('--model <model>', 'Override which model is used')
        .action(async options => {
          const { autoModeCritiqueHandler } = await import(
            '../handlers/autoMode.js'
          )
          await autoModeCritiqueHandler(options)
          process.exit()
        })
    }
  }
}
