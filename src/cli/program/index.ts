// src/cli/program/index.ts
import {
  Command as CommanderCommand,
  Option,
} from '@commander-js/extra-typings'
import { profileCheckpoint } from '../../utils/startupProfiler.js'
import { ensureMdmSettingsLoaded } from '../../utils/settings/mdm/settings.js'
import { ensureKeychainPrefetchCompleted } from '../../utils/secureStorage/keychainPrefetch.js'
import { init } from '../../entrypoints/init.js'
import { isEnvTruthy } from '../../utils/envUtils.js'
import { loadRemoteManagedSettings } from '../../services/remoteManagedSettings/index.js'
import { loadPolicyLimits } from '../../services/policyLimits/index.js'
import { clearPluginCache } from '../../utils/plugins/pluginLoader.js'
import { setInlinePlugins } from '../../bootstrap/state.js'
import { feature } from 'bun:bundle'

/**
 * Create help config that sorts options by long option name.
 * Commander supports compareOptions at runtime but @commander-js/extra-typings
 * doesn't include it in the type definitions, so we use Object.assign to add it.
 *
 * 从 main.tsx 行 1069-1081 原样搬移。
 * 导出供子命令（mcp / auth / plugin / doctor）调用 .configureHelp()。
 */
export function createSortedHelpConfig(): {
  sortSubcommands: true
  sortOptions: true
} {
  const getOptionSortKey = (opt: Option): string =>
    opt.long?.replace(/^--/, '') ?? opt.short?.replace(/^-/, '') ?? ''
  return Object.assign({ sortSubcommands: true, sortOptions: true } as const, {
    compareOptions: (a: Option, b: Option) =>
      getOptionSortKey(a).localeCompare(getOptionSortKey(b)),
  })
}

/**
 * preAction hook 实现。
 * 从 main.tsx 行 1087-1148 整体搬移。
 *
 * 运行时仅当具体 command 被执行时触发（不含 --help），
 * 负责 MDM/keychain 预取、init()、telemetry sinks、migrations、
 * remote managed settings、--plugin-dir 内联插件装载、settings sync 上传。
 */
async function runPreActionHook(thisCommand: CommanderCommand): Promise<void> {
  profileCheckpoint('preAction_start')
  // Await async subprocess loads started at module evaluation (lines 12-20).
  // Nearly free — subprocesses complete during the ~135ms of imports above.
  // Must resolve before init() which triggers the first settings read
  // (applySafeConfigEnvironmentVariables → getSettingsForSource('policySettings')
  // → isRemoteManagedSettingsEligible → sync keychain reads otherwise ~65ms).
  await Promise.all([
    ensureMdmSettingsLoaded(),
    ensureKeychainPrefetchCompleted(),
  ])
  profileCheckpoint('preAction_after_mdm')
  await init()
  profileCheckpoint('preAction_after_init')

  // process.title on Windows sets the console title directly; on POSIX,
  // terminal shell integration may mirror the process name to the tab.
  // After init() so settings.json env can also gate this (gh-4765).
  if (!isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_TERMINAL_TITLE)) {
    process.title = 'claude'
  }

  // Attach logging sinks so subcommand handlers can use logEvent/logError.
  // Before PR #11106 logEvent dispatched directly; after, events queue until
  // a sink attaches. setup() attaches sinks for the default command, but
  // subcommands (doctor, mcp, plugin, auth) never call setup() and would
  // silently drop events on process.exit(). Both inits are idempotent.
  const { initSinks } = await import('../../utils/sinks.js')
  initSinks()
  profileCheckpoint('preAction_after_sinks')

  // gh-33508: --plugin-dir is a top-level program option. The default
  // action reads it from its own options destructure, but subcommands
  // (plugin list, plugin install, mcp *) have their own actions and
  // never see it. Wire it up here so getInlinePlugins() works everywhere.
  // thisCommand.opts() is typed {} here because this hook is attached
  // before .option('--plugin-dir', ...) in the chain — extra-typings
  // builds the type as options are added. Narrow with a runtime guard;
  // the collect accumulator + [] default guarantee string[] in practice.
  const pluginDir = thisCommand.getOptionValue('pluginDir')
  if (
    Array.isArray(pluginDir) &&
    pluginDir.length > 0 &&
    pluginDir.every(p => typeof p === 'string')
  ) {
    setInlinePlugins(pluginDir)
    clearPluginCache('preAction: --plugin-dir inline plugins')
  }

  // Dynamic import to avoid static circular dependency: main.tsx imports
  // createProgram from this module, and runMigrations lives in main.tsx.
  // The hook runs at command-execution time, well after module load.
  const { runMigrations } = await import('../../main.js')
  runMigrations()
  profileCheckpoint('preAction_after_migrations')

  // Load remote managed settings for enterprise customers (non-blocking)
  // Fails open - if fetch fails, continues without remote settings
  // Settings are applied via hot-reload when they arrive
  // Must happen after init() to ensure config reading is allowed
  void loadRemoteManagedSettings()
  void loadPolicyLimits()

  profileCheckpoint('preAction_after_remote_settings')

  // Load settings sync (non-blocking, fail-open)
  // CLI: uploads local settings to remote (CCR download is handled by print.ts)
  if (feature('UPLOAD_USER_SETTINGS')) {
    void import('../../services/settingsSync/index.js').then(m =>
      m.uploadUserSettingsInBackground(),
    )
  }

  profileCheckpoint('preAction_after_settings_sync')
}

/**
 * 创建 Commander program 实例 + 配置 preAction hook + 注册顶层元数据。
 *
 * 替代 main.tsx 行 1066-1156 的装配逻辑（program 创建 + preAction hook
 * + .name/.description/.argument/.helpOption）。
 *
 * 全局 option 链（main.tsx 行 1157-1433）请使用 registerGlobalOptions(program)
 * （见 ./options.ts）。.action() handler 与 .version() 仍在 main.tsx 中
 * 通过链式调用附加（属于默认 command 的 dispatcher，由 C5/C6 迁移）。
 */
export function createProgram(): CommanderCommand {
  const program = new CommanderCommand()
    .configureHelp(createSortedHelpConfig())
    .enablePositionalOptions()
  profileCheckpoint('run_commander_initialized')

  // Use preAction hook to run initialization only when executing a command,
  // not when displaying help. This avoids the need for env variable signaling.
  program.hook('preAction', async thisCommand => {
    await runPreActionHook(thisCommand)
  })

  program
    .name('claude')
    .description(
      'Claude Code - starts an interactive session by default, use -p/--print for non-interactive output',
    )
    .argument('[prompt]', 'Your prompt', String)
    // Subcommands inherit helpOption via commander's copyInheritedSettings —
    // setting it once here covers mcp, plugin, auth, and all other subcommands.
    .helpOption('-h, --help', 'Display help for command')

  return program
}

/**
 * 解析 argv 并返回 program。
 * 用于在 fast-paths 不走 Commander 时手动调度。
 */
export async function parseProgram(
  program: CommanderCommand,
  argv: string[],
): Promise<CommanderCommand> {
  await program.parseAsync(argv)
  return program
}
