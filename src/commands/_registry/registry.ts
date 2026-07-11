// src/commands/_registry/registry.ts
//
// Runtime query entry for the command registry. Exports all consumer-facing
// APIs. All implementations are self-contained (no dependency on commands.ts).

// ----- Generated registry -----
import { REGISTERED_COMMANDS } from './generated.js'
import type {
  CommandSafety,
  CommandVisibility,
  RegisteredCommand,
} from './types.js'

export type { CommandSafety, CommandVisibility, RegisteredCommand }

// ----- Command module imports (static) -----
import addDir from '../../commands/files/add-dir/index.js'
import autofixPr from '../../commands/review/autofix-pr/index.js'
import backfillSessions from '../../commands/session/backfill-sessions/index.js'
import btw from '../../commands/_misc/btw/index.js'
import goodClaude from '../../commands/_misc/good-claude/index.js'
import issue from '../../commands/_misc/issue/index.js'
import feedback from '../../commands/_misc/feedback/index.js'
import clear from '../../commands/session/clear/index.js'
import color from '../../commands/ui/color/index.js'
import commit from '../../commands/_misc/commit/index.js'
import copy from '../../commands/files/copy/index.js'
import desktop from '../../commands/ui/desktop/index.js'
import commitPushPr from '../../commands/_misc/commit-push-pr/index.js'
import compact from '../../commands/session/compact/index.js'
import config from '../../commands/config/config/index.js'
import {
  context,
  contextNonInteractive,
} from '../../commands/_misc/context/index.js'
import diff from '../../commands/files/diff/index.js'
import doctor from '../../commands/debug/doctor/index.js'
import memory from '../../commands/memory/index.js'
import mode from '../../commands/_misc/mode/index.js'
import help from '../../commands/_misc/help/index.js'
import ide from '../../commands/_misc/ide/index.js'
import init from '../../commands/_misc/init/index.js'
import initVerifiers from '../../commands/_misc/init-verifiers/index.js'
import keybindings from '../../commands/config/keybindings/index.js'
import lang from '../../commands/ui/lang/index.js'
import login from '../../commands/model/login/index.js'
import logout from '../../commands/model/logout/index.js'
import installGitHubApp from '../../commands/plugins/install-github-app/index.js'
import installSlackApp from '../../commands/plugins/install-slack-app/index.js'
import breakCache from '../../commands/debug/break-cache/index.js'
import breakCacheNonInteractive from '../../commands/debug/break-cache-noninteractive/index.js'
import mcp from '../../commands/mcp/manage/index.js'
import mobile from '../../commands/ui/mobile/index.js'
import onboarding from '../../commands/_misc/onboarding/index.js'
import pr_comments from '../../commands/review/pr_comments/index.js'
import releaseNotes from '../../commands/version/release-notes/index.js'
import rename from '../../commands/session/rename/index.js'
import resume from '../../commands/session/resume/index.js'
import review from '../../commands/review/review/index.js'
import ultrareview from '../../commands/review/ultrareview/index.js'
import session from '../../commands/ui/session-info/index.js'
import share from '../../commands/_misc/share/index.js'
import skills from '../../commands/skills/index.js'
import status from '../../commands/daemon/status/index.js'
import tasks from '../../commands/tasks/list/index.js'
import teleport from '../../commands/_misc/teleport/index.js'
import agentsPlatform from '../../commands/tasks/agents-platform/index.js'
import scheduleCommand from '../../commands/tasks/schedule/index.js'
import memoryStoresCommand from '../../commands/memory/memory-stores/index.js'
import skillStoreCommand from '../../commands/skills/skill-store/index.js'
import vaultCommand from '../../commands/memory/vault/index.js'
import localVaultCommand from '../../commands/memory/local-vault/index.js'
import localMemoryCommand from '../../commands/memory/local-memory/index.js'
import securityReview from '../../commands/review/security-review.js'
import bughunter from '../../commands/review/bughunter/index.js'
import terminalSetup from '../../commands/_misc/terminalSetup/index.js'
import usage from '../../commands/_misc/usage/index.js'
import theme from '../../commands/config/theme/index.js'
import vim from '../../commands/config/vim/index.js'
import webTools from '../../commands/_misc/web-tools/index.js'

import { feature } from 'bun:bundle'

// ---- Feature-gated conditional imports ----
const proactive =
  feature('PROACTIVE') || feature('KAIROS')
    ? require('../../commands/_misc/proactive.js').default
    : null
const briefCommand =
  feature('KAIROS') || feature('KAIROS_BRIEF')
    ? require('../../commands/_misc/brief.js').default
    : null
const assistantCommand = feature('KAIROS')
  ? require('../../commands/_misc/assistant/index.js').default
  : null
const bridge = feature('BRIDGE_MODE')
  ? require('../../commands/bridge/index.js').default
  : null
const remoteControlServerCommand = feature('BRIDGE_MODE')
  ? require('../../commands/bridge/remoteControlServer/index.js').default
  : null
const voiceCommand = feature('VOICE_MODE')
  ? require('../../commands/_misc/voice/index.js').default
  : null
const monitorCmd = feature('MONITOR_TOOL')
  ? require('../../commands/_misc/monitor/index.js').default
  : null
const coordinatorCmd = feature('COORDINATOR_MODE')
  ? require('../../commands/_misc/coordinator/index.js').default
  : null
const forceSnip = feature('HISTORY_SNIP')
  ? require('../../commands/_misc/force-snip.js').default
  : null
const workflowsCmd = feature('WORKFLOW_SCRIPTS')
  ? (
      require('../../commands/_misc/workflows/index.js') as typeof import('../../commands/_misc/workflows/index.js')
    ).default
  : null
const webCmd = feature('CCR_REMOTE_SETUP')
  ? (
      require('../../commands/bridge/remote-setup/index.js') as typeof import('../../commands/bridge/remote-setup/index.js')
    ).default
  : null
const clearSkillIndexCache = feature('EXPERIMENTAL_SKILL_SEARCH')
  ? (
      require('../../services/skillSearch/localSearch.js') as typeof import('../../services/skillSearch/localSearch.js')
    ).clearSkillIndexCache
  : null
const subscribePr = feature('KAIROS_GITHUB_WEBHOOKS')
  ? require('../../commands/_misc/subscribe-pr/index.js').default
  : null
const ultraplan = feature('ULTRAPLAN')
  ? require('../../commands/_misc/ultraplan.js').default
  : null
const torch = feature('TORCH')
  ? require('../../commands/_misc/torch/index.js').default
  : null
const daemonCmd =
  feature('DAEMON') || feature('BG_SESSIONS')
    ? require('../../commands/daemon/index.js').default
    : null
const jobCmd = feature('TEMPLATES')
  ? require('../../commands/tasks/job/index.js').default
  : null
const peersCmd = feature('UDS_INBOX')
  ? (
      require('../../commands/daemon/peers/index.js') as typeof import('../../commands/daemon/peers/index.js')
    ).default
  : null
const attachCmd = feature('UDS_INBOX')
  ? require('../../commands/daemon/attach/index.js').default
  : null
const detachCmd = feature('UDS_INBOX')
  ? require('../../commands/daemon/detach/index.js').default
  : null
const sendCmd = feature('UDS_INBOX')
  ? require('../../commands/daemon/send/index.js').default
  : null
const pipesCmd = feature('UDS_INBOX')
  ? require('../../commands/daemon/pipes/index.js').default
  : null
const pipeStatusCmd = feature('UDS_INBOX')
  ? require('../../commands/daemon/pipe-status/index.js').default
  : null
const historyCmd = feature('UDS_INBOX')
  ? require('../../commands/daemon/history/index.js').default
  : null
const claimMainCmd = feature('UDS_INBOX')
  ? require('../../commands/daemon/claim-main/index.js').default
  : null
const forkCmd = feature('FORK_SUBAGENT')
  ? (
      require('../../commands/session/fork/index.js') as typeof import('../../commands/session/fork/index.js')
    ).default
  : null
const buddy = feature('BUDDY')
  ? (
      require('../../commands/_misc/buddy/index.js') as typeof import('../../commands/_misc/buddy/index.js')
    ).default
  : null
const poor = feature('POOR')
  ? (
      require('../../commands/_misc/poor/index.js') as typeof import('../../commands/_misc/poor/index.js')
    ).default
  : null
const goalCmd = feature('GOAL')
  ? (
      require('../../commands/_misc/goal/index.js') as typeof import('../../commands/_misc/goal/index.js')
    ).default
  : null

import thinkback from '../../commands/_misc/thinkback/index.js'
import thinkbackPlay from '../../commands/_misc/thinkback-play/index.js'
import permissions from '../../commands/config/permissions/index.js'
import plan from '../../commands/_misc/plan/index.js'
import fast from '../../commands/model/fast/index.js'
import passes from '../../commands/debug/passes/index.js'
import privacySettings from '../../commands/config/privacy-settings/index.js'
import hooks from '../../commands/config/hooks/index.js'
import files from '../../commands/files/files/index.js'
import branch from '../../commands/_misc/branch/index.js'
import artifacts from '../../commands/_misc/artifacts/index.js'
import agents from '../../commands/tasks/agents/index.js'
import plugin from '../../commands/plugins/plugin/index.js'
import reloadPlugins from '../../commands/plugins/reload-plugins/index.js'
import rewind from '../../commands/session/rewind/index.js'
import heapDump from '../../commands/debug/heapdump/index.js'
import mockLimits from '../../commands/debug/mock-limits/index.js'
import bridgeKick from '../../commands/_misc/bridge-kick/index.js'
import version from '../../commands/version/version/index.js'
import summary from '../../commands/_misc/summary/index.js'
import recap from '../../commands/_misc/recap/index.js'
import skillLearning from '../../commands/skills/skill-learning/index.js'
import skillSearch from '../../commands/skills/skill-search/index.js'
import {
  resetLimits,
  resetLimitsNonInteractive,
} from '../../commands/debug/reset-limits/index.js'
import antTrace from '../../commands/debug/ant-trace/index.js'
import perfIssue from '../../commands/debug/perf-issue/index.js'
import sandboxToggle from '../../commands/config/sandbox-toggle/index.js'
import tui, { tuiNonInteractive } from '../../commands/ui/tui/index.js'
import chrome from '../../commands/ui/chrome/index.js'
import stickers from '../../commands/ui/stickers/index.js'
import advisor from '../../commands/_misc/advisor/index.js'
import autonomy from '../../commands/_misc/autonomy/index.js'
import provider from '../../commands/model/provider/index.js'
import { logError } from '../../utils/log.js'
import { toError } from '../../utils/errors.js'
import { logForDebugging } from '../../utils/debug.js'
import {
  getSkillDirCommands,
  clearSkillCaches,
  getDynamicSkills,
} from '../../skills/loadSkillsDir.js'
import { getBundledSkills } from '../../skills/bundledSkills.js'
import { getBuiltinPluginSkillCommands } from '../../plugins/builtinPlugins.js'
import {
  getPluginCommands,
  clearPluginCommandCache,
  getPluginSkills,
  clearPluginSkillsCache,
} from '../../utils/plugins/loadPluginCommands.js'
import memoize from 'lodash-es/memoize.js'
import { isUsing3PServices, isClaudeAISubscriber } from '../../utils/auth.js'
import { isFirstPartyAnthropicBaseUrl } from '../../utils/model/providers.js'
import env from '../../commands/debug/env/index.js'
import exit from '../../commands/_misc/exit/index.js'
import exportCommand from '../../commands/session/export/index.js'
import model from '../../commands/model/model/index.js'
import tag from '../../commands/session/tag/index.js'
import outputStyle from '../../commands/config/output-style/index.js'
import remoteEnv from '../../commands/bridge/remote-env/index.js'
import upgrade from '../../commands/version/upgrade/index.js'
import {
  extraUsage,
  extraUsageNonInteractive,
} from '../../commands/debug/extra-usage/index.js'
import rateLimitOptions from '../../commands/debug/rate-limit-options/index.js'
import statusline from '../../commands/ui/statusline/index.js'
import effort from '../../commands/model/effort/index.js'
import usageReport from '../../commands/_misc/insights/index.js'
import oauthRefresh from '../../commands/debug/oauth-refresh/index.js'
import debugToolCall from '../../commands/debug/debug-tool-call/index.js'
import { getSettingSourceName } from '../../utils/settings/constants.js'
import {
  type Command,
  getCommandName,
  isCommandEnabled,
} from '../../types/command.js'

// ----- Type re-exports -----
export type {
  Command,
  CommandBase,
  CommandResultDisplay,
  LocalCommandResult,
  LocalJSXCommandContext,
  PromptCommand,
  ResumeEntrypoint,
} from '../../types/command.js'
export { getCommandName, isCommandEnabled } from '../../types/command.js'

// ============================================================================
// Internal-only commands (Anthropic admin/diagnostics)
// ============================================================================
export const INTERNAL_ONLY_COMMANDS = [
  backfillSessions,
  bughunter,
  goodClaude,
  mockLimits,
  resetLimits,
  resetLimitsNonInteractive,
  antTrace,
  oauthRefresh,
].filter(Boolean)

// ============================================================================
// COMMANDS — memoized list of all built-in commands
// ============================================================================
const COMMANDS = memoize((): Command[] => [
  addDir,
  advisor,
  agentsPlatform,
  scheduleCommand,
  memoryStoresCommand,
  skillStoreCommand,
  vaultCommand,
  localVaultCommand,
  localMemoryCommand,
  autonomy,
  provider,
  artifacts,
  agents,
  branch,
  btw,
  chrome,
  clear,
  color,
  compact,
  config,
  copy,
  desktop,
  context,
  contextNonInteractive,
  diff,
  doctor,
  effort,
  exit,
  fast,
  files,
  heapDump,
  help,
  ide,
  init,
  keybindings,
  lang,
  installGitHubApp,
  installSlackApp,
  mcp,
  memory,
  mobile,
  mode,
  model,
  outputStyle,
  remoteEnv,
  plugin,
  pr_comments,
  releaseNotes,
  reloadPlugins,
  rename,
  resume,
  session,
  skills,
  status,
  statusline,
  stickers,
  tag,
  theme,
  feedback,
  review,
  ultrareview,
  rewind,
  securityReview,
  terminalSetup,
  upgrade,
  extraUsage,
  extraUsageNonInteractive,
  rateLimitOptions,
  usage,
  usageReport,
  vim,
  webTools,
  ...(webCmd ? [webCmd] : []),
  ...(forkCmd ? [forkCmd] : []),
  ...(buddy ? [buddy] : []),
  ...(poor ? [poor] : []),
  ...(goalCmd ? [goalCmd] : []),
  ...(proactive ? [proactive] : []),
  ...(monitorCmd ? [monitorCmd] : []),
  ...(coordinatorCmd ? [coordinatorCmd] : []),
  ...(briefCommand ? [briefCommand] : []),
  ...(assistantCommand ? [assistantCommand] : []),
  ...(bridge ? [bridge] : []),
  ...(remoteControlServerCommand ? [remoteControlServerCommand] : []),
  ...(voiceCommand ? [voiceCommand] : []),
  thinkback,
  thinkbackPlay,
  permissions,
  plan,
  privacySettings,
  hooks,
  exportCommand,
  sandboxToggle,
  ...(!isUsing3PServices() ? [logout, login] : []),
  passes,
  ...(peersCmd ? [peersCmd] : []),
  ...(attachCmd ? [attachCmd] : []),
  ...(detachCmd ? [detachCmd] : []),
  ...(sendCmd ? [sendCmd] : []),
  ...(pipesCmd ? [pipesCmd] : []),
  ...(pipeStatusCmd ? [pipeStatusCmd] : []),
  ...(historyCmd ? [historyCmd] : []),
  ...(claimMainCmd ? [claimMainCmd] : []),
  tasks,
  ...(workflowsCmd ? [workflowsCmd] : []),
  ...(ultraplan ? [ultraplan] : []),
  ...(torch ? [torch] : []),
  ...(daemonCmd ? [daemonCmd] : []),
  ...(jobCmd ? [jobCmd] : []),
  ...(forceSnip ? [forceSnip] : []),
  summary,
  recap,
  skillLearning,
  skillSearch,
  autofixPr,
  commit,
  commitPushPr,
  bridgeKick,
  version,
  ...(subscribePr ? [subscribePr] : []),
  initVerifiers,
  env,
  debugToolCall,
  perfIssue,
  breakCache,
  breakCacheNonInteractive,
  issue,
  share,
  teleport,
  tui,
  tuiNonInteractive,
  onboarding,
  ...(process.env.USER_TYPE === 'ant' && !process.env.IS_DEMO
    ? INTERNAL_ONLY_COMMANDS
    : []),
])

// ============================================================================
// Remote-safe and bridge-safe commands
// ============================================================================

/**
 * Commands that are safe to use in remote mode (--remote).
 * These only affect local TUI state and don't depend on local filesystem,
 * git, shell, IDE, MCP, or other local execution context.
 */
export const REMOTE_SAFE_COMMANDS: Set<Command> = new Set([
  session,
  exit,
  clear,
  help,
  theme,
  color,
  vim,
  usage,
  copy,
  btw,
  feedback,
  plan,
  proactive,
  keybindings,
  statusline,
  stickers,
  mobile,
])

/**
 * Builtin commands of type 'local' that ARE safe to execute when received
 * over the Remote Control bridge.
 */
export const BRIDGE_SAFE_COMMANDS: Set<Command> = new Set(
  [compact, clear, usage, summary, releaseNotes, files].filter(
    (c): c is Command => c !== null,
  ),
)

// ============================================================================
// meetsAvailabilityRequirement
// ============================================================================

/**
 * Filters commands by their declared `availability` (auth/provider requirement).
 * Commands without `availability` are treated as universal.
 */
export function meetsAvailabilityRequirement(cmd: Command): boolean {
  if (!cmd.availability || cmd.availability.length === 0) return true
  for (const a of cmd.availability) {
    switch (a) {
      case 'claude-ai':
        if (isClaudeAISubscriber()) return true
        break
      case 'console':
        if (
          !isClaudeAISubscriber() &&
          !isUsing3PServices() &&
          isFirstPartyAnthropicBaseUrl()
        )
          return true
        break
      default: {
        const _exhaustive: never = a
        void _exhaustive
        break
      }
    }
  }
  return false
}

// ============================================================================
// getSkills, getWorkflowCommands, loadAllCommands, getCommands
// ============================================================================

async function getSkills(cwd: string): Promise<{
  skillDirCommands: Command[]
  pluginSkills: Command[]
  bundledSkills: Command[]
  builtinPluginSkills: Command[]
}> {
  try {
    const [skillDirCommands, pluginSkills] = await Promise.all([
      getSkillDirCommands(cwd).catch(err => {
        logError(toError(err))
        logForDebugging(
          'Skill directory commands failed to load, continuing without them',
        )
        return []
      }),
      getPluginSkills().catch(err => {
        logError(toError(err))
        logForDebugging('Plugin skills failed to load, continuing without them')
        return []
      }),
    ])
    const bundledSkills = getBundledSkills()
    const builtinPluginSkills = getBuiltinPluginSkillCommands()
    logForDebugging(
      `getSkills returning: ${skillDirCommands.length} skill dir commands, ${pluginSkills.length} plugin skills, ${bundledSkills.length} bundled skills, ${builtinPluginSkills.length} builtin plugin skills`,
    )
    return {
      skillDirCommands,
      pluginSkills,
      bundledSkills,
      builtinPluginSkills,
    }
  } catch (err) {
    logError(toError(err))
    logForDebugging('Unexpected error in getSkills, returning empty')
    return {
      skillDirCommands: [],
      pluginSkills: [],
      bundledSkills: [],
      builtinPluginSkills: [],
    }
  }
}

const getWorkflowCommands = feature('WORKFLOW_SCRIPTS')
  ? (
      require('../../workflow/namedWorkflowCommands.js') as typeof import('../../workflow/namedWorkflowCommands.js')
    ).getWorkflowCommands
  : null

/**
 * Loads all command sources (skills, plugins, workflows). Memoized by cwd.
 */
const loadAllCommands = memoize(async (cwd: string): Promise<Command[]> => {
  const [
    { skillDirCommands, pluginSkills, bundledSkills, builtinPluginSkills },
    pluginCommands,
    workflowCommands,
  ] = await Promise.all([
    getSkills(cwd),
    getPluginCommands(),
    getWorkflowCommands ? getWorkflowCommands(cwd) : Promise.resolve([]),
  ])

  return [
    ...bundledSkills,
    ...builtinPluginSkills,
    ...skillDirCommands,
    ...(workflowCommands as Command[]),
    ...(pluginCommands as Command[]),
    ...pluginSkills,
    ...COMMANDS(),
  ]
})

/**
 * Returns commands available to the current user. The expensive loading is
 * memoized, but availability and isEnabled checks run fresh every call so
 * auth changes (e.g. /login) take effect immediately.
 */
export async function getCommands(cwd: string): Promise<Command[]> {
  const allCommands = await loadAllCommands(cwd)

  const dynamicSkills = getDynamicSkills()

  const baseCommands = allCommands.filter(
    _ => meetsAvailabilityRequirement(_) && isCommandEnabled(_),
  )

  if (dynamicSkills.length === 0) {
    return baseCommands
  }

  const baseCommandNames = new Set(baseCommands.map(c => c.name))
  const uniqueDynamicSkills = dynamicSkills.filter(
    s =>
      !baseCommandNames.has(s.name) &&
      meetsAvailabilityRequirement(s) &&
      isCommandEnabled(s),
  )

  if (uniqueDynamicSkills.length === 0) {
    return baseCommands
  }

  const builtInNames = new Set(COMMANDS().map(c => c.name))
  const insertIndex = baseCommands.findIndex(c => builtInNames.has(c.name))

  if (insertIndex === -1) {
    return [...baseCommands, ...uniqueDynamicSkills]
  }

  return [
    ...baseCommands.slice(0, insertIndex),
    ...uniqueDynamicSkills,
    ...baseCommands.slice(insertIndex),
  ]
}

// ============================================================================
// Cache clearing
// ============================================================================

/**
 * Clears only the memoization caches for commands, WITHOUT clearing skill caches.
 */
export function clearCommandMemoizationCaches(): void {
  loadAllCommands.cache?.clear?.()
  getSkillToolCommands.cache?.clear?.()
  getSlashCommandToolSkills.cache?.clear?.()
  clearSkillIndexCache?.()
}

export function clearCommandsCache(): void {
  clearCommandMemoizationCaches()
  clearPluginCommandCache()
  clearPluginSkillsCache()
  clearSkillCaches()
}

// ============================================================================
// MCP Skill Commands
// ============================================================================

/**
 * Filter commands to MCP-provided skills (prompt-type, model-invocable).
 */
export function getMcpSkillCommands(
  mcpCommands: readonly Command[],
): readonly Command[] {
  if (feature('MCP_SKILLS')) {
    return mcpCommands.filter(
      cmd =>
        cmd.type === 'prompt' &&
        cmd.loadedFrom === 'mcp' &&
        !cmd.disableModelInvocation,
    )
  }
  return []
}

// ============================================================================
// Skill tool commands
// ============================================================================

/**
 * Returns all prompt-based commands that the model can invoke.
 */
export const getSkillToolCommands = memoize(
  async (cwd: string): Promise<Command[]> => {
    const allCommands = await getCommands(cwd)
    return allCommands.filter(
      cmd =>
        cmd.type === 'prompt' &&
        !cmd.disableModelInvocation &&
        cmd.source !== 'builtin' &&
        (cmd.loadedFrom === 'bundled' ||
          cmd.loadedFrom === 'skills' ||
          cmd.loadedFrom === 'commands_DEPRECATED' ||
          cmd.hasUserSpecifiedDescription ||
          cmd.whenToUse),
    )
  },
)

/**
 * Filters commands to include only skills (for slash command suggestions).
 */
export const getSlashCommandToolSkills = memoize(
  async (cwd: string): Promise<Command[]> => {
    try {
      const allCommands = await getCommands(cwd)
      return allCommands.filter(
        cmd =>
          cmd.type === 'prompt' &&
          cmd.source !== 'builtin' &&
          (cmd.hasUserSpecifiedDescription || cmd.whenToUse) &&
          (cmd.loadedFrom === 'skills' ||
            cmd.loadedFrom === 'plugin' ||
            cmd.loadedFrom === 'bundled' ||
            cmd.disableModelInvocation),
      )
    } catch (error) {
      logError(toError(error))
      logForDebugging('Returning empty skills array due to load failure')
      return []
    }
  },
)

// ============================================================================
// Bridge safety
// ============================================================================

export function isBridgeSafeCommand(cmd: Command): boolean {
  if (cmd.type === 'local-jsx') return cmd.bridgeSafe === true
  if (cmd.type === 'prompt') return true
  return cmd.bridgeSafe === true || BRIDGE_SAFE_COMMANDS.has(cmd)
}

export function getBridgeCommandSafety(
  cmd: Command,
  args: string,
): { ok: true } | { ok: false; reason?: string } {
  if (!isBridgeSafeCommand(cmd)) return { ok: false }
  const reason = cmd.getBridgeInvocationError?.(args)
  return reason ? { ok: false, reason } : { ok: true }
}

// ============================================================================
// Filter helpers
// ============================================================================

export function filterCommandsForRemoteMode(commands: Command[]): Command[] {
  return commands.filter(cmd => REMOTE_SAFE_COMMANDS.has(cmd))
}

// ============================================================================
// Command lookup utilities
// ============================================================================

/**
 * Format a command's description with its source annotation for user-facing UI.
 */
export function formatDescriptionWithSource(cmd: Command): string {
  if (cmd.type !== 'prompt') {
    return cmd.description
  }

  if (cmd.kind === 'workflow') {
    return `${cmd.description} (workflow)`
  }

  if (cmd.source === 'plugin') {
    const pluginName = cmd.pluginInfo?.pluginManifest.name
    if (pluginName) {
      return `(${pluginName}) ${cmd.description}`
    }
    return `${cmd.description} (plugin)`
  }

  if (cmd.source === 'builtin' || cmd.source === 'mcp') {
    return cmd.description
  }

  if (cmd.source === 'bundled') {
    return `${cmd.description} (bundled)`
  }

  return `${cmd.description} (${getSettingSourceName(cmd.source)})`
}

export function findCommand(
  commandName: string,
  commands: readonly Command[],
): Command | undefined {
  return commands.find(
    c =>
      c.name === commandName ||
      getCommandName(c) === commandName ||
      c.aliases?.includes(commandName),
  )
}

export function hasCommand(
  commandName: string,
  commands: readonly Command[],
): boolean {
  return findCommand(commandName, commands) !== undefined
}

export function getCommand(
  commandName: string,
  commands: readonly Command[],
): Command {
  const cmd = findCommand(commandName, commands)
  if (!cmd) {
    throw ReferenceError(
      `Command ${commandName} not found. Available commands: ${commands
        .map(c => {
          const name = getCommandName(c)
          return c.aliases ? `${name} (aliases: ${c.aliases.join(', ')})` : name
        })
        .sort((a, b) => a.localeCompare(b))
        .join(', ')}`,
    )
  }
  return cmd
}

// ============================================================================
// Registry-specific functions
// ============================================================================

/**
 * The set of built-in command names (including aliases), derived from
 * the generated registry.
 */
export function builtInCommandNames(): Set<string> {
  const names = new Set<string>()
  for (const cmd of REGISTERED_COMMANDS) {
    names.add(cmd.name)
    if (cmd.aliases) {
      for (const alias of cmd.aliases) {
        names.add(alias)
      }
    }
  }
  return names
}

/**
 * Resolve a feature gate string to its runtime enabled state.
 * Bun's feature() macro requires string literal arguments, so we use a
 * switch with known gate names. Add new gates here as needed.
 */
function resolveFeatureGate(gate: string): boolean {
  if (gate === 'ACP') return feature('ACP') ? true : false
  if (gate === 'AGENT_TRIGGERS') return feature('AGENT_TRIGGERS') ? true : false
  if (gate === 'BG_SESSIONS') return feature('BG_SESSIONS') ? true : false
  if (gate === 'BRIDGE_MODE') return feature('BRIDGE_MODE') ? true : false
  if (gate === 'BUDDY') return feature('BUDDY') ? true : false
  if (gate === 'CCR_REMOTE_SETUP')
    return feature('CCR_REMOTE_SETUP') ? true : false
  if (gate === 'COORDINATOR_MODE')
    return feature('COORDINATOR_MODE') ? true : false
  if (gate === 'DAEMON') return feature('DAEMON') ? true : false
  if (gate === 'FORK_SUBAGENT') return feature('FORK_SUBAGENT') ? true : false
  if (gate === 'GOAL') return feature('GOAL') ? true : false
  if (gate === 'HISTORY_SNIP') return feature('HISTORY_SNIP') ? true : false
  if (gate === 'KAIROS') return feature('KAIROS') ? true : false
  if (gate === 'KAIROS_BRIEF') return feature('KAIROS_BRIEF') ? true : false
  if (gate === 'KAIROS_GITHUB_WEBHOOKS')
    return feature('KAIROS_GITHUB_WEBHOOKS') ? true : false
  if (gate === 'MCP_SKILLS') return feature('MCP_SKILLS') ? true : false
  if (gate === 'MONITOR_TOOL') return feature('MONITOR_TOOL') ? true : false
  if (gate === 'POOR') return feature('POOR') ? true : false
  if (gate === 'PROACTIVE') return feature('PROACTIVE') ? true : false
  if (gate === 'TEMPLATES') return feature('TEMPLATES') ? true : false
  if (gate === 'TORCH') return feature('TORCH') ? true : false
  if (gate === 'UDS_INBOX') return feature('UDS_INBOX') ? true : false
  if (gate === 'ULTRAPLAN') return feature('ULTRAPLAN') ? true : false
  if (gate === 'VOICE_MODE') return feature('VOICE_MODE') ? true : false
  if (gate === 'WORKFLOW_SCRIPTS')
    return feature('WORKFLOW_SCRIPTS') ? true : false
  return false
}

export function meetsVisibility(
  spec: RegisteredCommand,
  userType: string,
): boolean {
  if (spec.visibility === 'internal') return userType === 'ant'
  if (spec.visibility === 'feature-gated') {
    return spec.featureGate ? resolveFeatureGate(spec.featureGate) : false
  }
  return true
}

export function meetsSafety(
  spec: RegisteredCommand,
  required: CommandSafety,
): boolean {
  if (required === 'remote-safe') return spec.safety === 'remote-safe'
  if (required === 'bridge-safe') return spec.safety === 'bridge-safe'
  return true
}

export function getRegisteredCommands(
  options: { userType?: string; requiredSafety?: CommandSafety } = {},
): RegisteredCommand[] {
  const userType = options.userType ?? process.env.USER_TYPE ?? 'external'
  return REGISTERED_COMMANDS.filter(spec =>
    meetsVisibility(spec, userType),
  ).filter(spec =>
    options.requiredSafety ? meetsSafety(spec, options.requiredSafety) : true,
  )
}

export function findRegisteredCommand(
  name: string,
): RegisteredCommand | undefined {
  return REGISTERED_COMMANDS.find(
    c => c.name === name || c.aliases?.includes(name),
  )
}

export { REGISTERED_COMMANDS }
