// These side-effects must run before all other imports:
// 1. profileCheckpoint marks entry before heavy module evaluation begins
// 2. startMdmRawRead fires MDM subprocesses (plutil/reg query) so they run in
//    parallel with the remaining ~135ms of imports below
// 3. startKeychainPrefetch fires both macOS keychain reads (OAuth + legacy API
//    key) in parallel — isRemoteManagedSettingsEligible() otherwise reads them
//    sequentially via sync spawn inside applySafeConfigEnvironmentVariables()
//    (~65ms on every macOS startup)
import { profileCheckpoint, profileReport } from './utils/startupProfiler.js';

// eslint-disable-next-line custom-rules/no-top-level-side-effects
profileCheckpoint('main_tsx_entry');

import { startMdmRawRead } from './utils/settings/mdm/rawRead.js';

// eslint-disable-next-line custom-rules/no-top-level-side-effects
startMdmRawRead();

import { startKeychainPrefetch } from './utils/secureStorage/keychainPrefetch.js';

// eslint-disable-next-line custom-rules/no-top-level-side-effects
startKeychainPrefetch();

import { feature } from 'bun:bundle';
import { Command as CommanderCommand } from '@commander-js/extra-typings';
import { createProgram } from './cli/program/index.js';
import { registerConditionalOptions, registerGlobalOptions } from './cli/program/options.js';
import { registerAllSubcommands } from './cli/subcommands/index.js';
import { handleDefaultAction } from './cli/dispatcher/index.js';
import chalk from 'chalk';
import { readFileSync } from 'fs';
import { getSystemContext, getUserContext } from './context.js';
import { prefetchAwsCredentialsAndBedRockInfoIfSafe, prefetchGcpCredentialsIfSafe } from './utils/auth.js';
import {
  checkHasTrustDialogAccepted,
  getGlobalConfig,
  isAutoUpdaterDisabled,
  saveGlobalConfig,
} from './utils/config.js';
import { stopCapturingEarlyInput } from './utils/earlyInput.js';
import { getBaseRenderOptions } from './utils/renderOptions.js';
import { settingsChangeDetector } from './utils/settings/changeDetector.js';
import { skillChangeDetector } from './utils/skills/skillChangeDetector.js';
import { writeFileSync_DEPRECATED } from './utils/slowOperations.js';
import { initializeWarningHandler } from './utils/warningHandler.js';

// Lazy require to avoid circular dependency: teammate.ts -> AppState.tsx -> ... -> main.tsx
// Exported for dispatcher/runner.ts (C6.5 migration).
/* eslint-disable @typescript-eslint/no-require-imports */
export const getTeammateUtils = () => require('./utils/teammate.js') as typeof import('./utils/teammate.js');
export const getTeammatePromptAddendum = () =>
  require('./utils/swarm/teammatePromptAddendum.js') as typeof import('./utils/swarm/teammatePromptAddendum.js');
export const getTeammateModeSnapshot = () =>
  require('./utils/swarm/backends/teammateModeSnapshot.js') as typeof import('./utils/swarm/backends/teammateModeSnapshot.js');
/* eslint-enable @typescript-eslint/no-require-imports */
// Dead code elimination: conditional import for COORDINATOR_MODE
// Exported for dispatcher/runner.ts (C6.5 migration).
/* eslint-disable @typescript-eslint/no-require-imports */
export const coordinatorModeModule = feature('COORDINATOR_MODE')
  ? (require('./coordinator/coordinatorMode.js') as typeof import('./coordinator/coordinatorMode.js'))
  : null;
/* eslint-enable @typescript-eslint/no-require-imports */
// Dead code elimination: conditional import for KAIROS (assistant mode)
// Exported for dispatcher/runner.ts (C6.5 migration).
/* eslint-disable @typescript-eslint/no-require-imports */
export const assistantModule = feature('KAIROS')
  ? (require('./assistant/index.js') as typeof import('./assistant/index.js'))
  : null;
export const kairosGate = feature('KAIROS')
  ? (require('./assistant/gate.js') as typeof import('./assistant/gate.js'))
  : null;

import { relative } from 'path';
import { isAnalyticsDisabled } from 'src/services/analytics/config.js';
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from 'src/services/analytics/index.js';
import { initializeAnalyticsGates } from 'src/services/analytics/sink.js';
import { getOriginalCwd } from './bootstrap/state.js';
import { SHOW_CURSOR } from '@anthropic/ink';
import { getContextWindowForModel } from './utils/context.js';
import { hasNodeOption, isBareMode, isEnvTruthy, isInProtectedNamespace } from './utils/envUtils.js';
import { findGitRoot, getIsGit, getWorktreeCount } from './utils/git.js';
import { getGhAuthStatus } from './utils/github/ghAuthStatus.js';
import { safeParseJSON } from './utils/json.js';
import { logError } from './utils/log.js';
import { getDefaultMainLoopModel, parseUserSpecifiedModel } from './utils/model/model.js';
import { getManagedPluginNames } from './utils/plugins/managedPlugins.js';
import { getPluginSeedDirs } from './utils/plugins/pluginDirectories.js';
import { countFilesRoundedRg } from './utils/ripgrep.js';
import {
  getInitialSettings,
  getManagedSettingsKeysForLogging,
  getSettingsForSource,
} from './utils/settings/settings.js';
import { resetSettingsCache } from './utils/settings/settingsCache.js';
import { logPluginLoadErrors, logPluginsEnabledForSession } from './utils/telemetry/pluginTelemetry.js';
import { logSkillsLoaded } from './utils/telemetry/skillLoadedEvent.js';
import { generateTempFilePath } from './utils/tempfile.js';
import { validateUuid } from './utils/uuid.js';
// Plugin startup checks are now handled non-blockingly in REPL.tsx

import { getRelevantTips } from 'src/services/tips/tipRegistry.js';
import { eagerParseCliFlag } from 'src/utils/cliArgs.js';
import { getCwd } from 'src/utils/cwd.js';
import { errorMessage, isENOENT } from 'src/utils/errors.js';
import { getFsImplementation, safeResolvePath } from 'src/utils/fsOperations.js';
import { gracefulShutdownSync } from 'src/utils/gracefulShutdown.js';
import { refreshModelCapabilities } from 'src/utils/model/modelCapabilities.js';
import { peekForStdinData } from 'src/utils/process.js';
import { parseSettingSourcesFlag } from 'src/utils/settings/constants.js';
import {
  getInitialMainLoopModel,
  getIsNonInteractiveSession,
  getSdkBetas,
  setAllowedSettingSources,
  setClientType,
  setCwdState,
  setDirectConnectServerUrl,
  setFlagSettingsPath,
  setIsInteractive,
  setOriginalCwd,
  setQuestionPreviewFormat,
  setSessionSource,
  setUserMsgOptIn,
} from './bootstrap/state.js';

/* eslint-disable @typescript-eslint/no-require-imports */
// Exported for dispatcher/runner.ts (C6.5 migration).
export const autoModeStateModule = feature('TRANSCRIPT_CLASSIFIER')
  ? (require('./utils/permissions/autoModeState.js') as typeof import('./utils/permissions/autoModeState.js'))
  : null;

// TeleportRepoMismatchDialog, TeleportResumeWrapper dynamically imported at call sites
import { migrateBypassPermissionsAcceptedToSettings } from './migrations/migrateBypassPermissionsAcceptedToSettings.js';
import { migrateEnableAllProjectMcpServersToSettings } from './migrations/migrateEnableAllProjectMcpServersToSettings.js';
import { migrateFennecToOpus } from './migrations/migrateFennecToOpus.js';
import { migrateLegacyOpusToCurrent } from './migrations/migrateLegacyOpusToCurrent.js';
import { migrateOpusToOpus1m } from './migrations/migrateOpusToOpus1m.js';
import { migrateReplBridgeEnabledToRemoteControlAtStartup } from './migrations/migrateReplBridgeEnabledToRemoteControlAtStartup.js';
import { migrateSonnet1mToSonnet45 } from './migrations/migrateSonnet1mToSonnet45.js';
import { migrateSonnet45ToSonnet46 } from './migrations/migrateSonnet45ToSonnet46.js';
import { resetAutoModeOptInForDefaultOffer } from './migrations/resetAutoModeOptInForDefaultOffer.js';
import { resetProToOpusDefault } from './migrations/resetProToOpusDefault.js';
/* eslint-enable @typescript-eslint/no-require-imports */
// teleportWithProgress dynamically imported at call site
import { createDirectConnectSession, DirectConnectError } from './server/createDirectConnectSession.js';
import { isRunningWithBun } from './utils/bundledMode.js';
import { logForDiagnosticsNoPII } from './utils/diagLogs.js';
import { loadAllPluginsCacheOnly } from './utils/plugins/pluginLoader.js';
import { migrateChangelogFromConfig } from './utils/releaseNotes.js';
import { SandboxManager } from './utils/sandbox/sandbox-adapter.js';
import { type ThinkingConfig } from './utils/thinking.js';
import { initUser } from './utils/user.js';

// eslint-disable-next-line custom-rules/no-top-level-side-effects
profileCheckpoint('main_tsx_imports_loaded');

/**
 * Log managed settings keys to Statsig for analytics.
 * This is called after init() completes to ensure settings are loaded
 * and environment variables are applied before model resolution.
 */
// Exported for dispatcher/runner.ts (C6.5 migration).
export function logManagedSettings(): void {
  try {
    const policySettings = getSettingsForSource('policySettings');
    if (policySettings) {
      const allKeys = getManagedSettingsKeysForLogging(policySettings);
      logEvent('tengu_managed_settings_loaded', {
        keyCount: allKeys.length,
        keys: allKeys.join(',') as unknown as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      });
    }
  } catch {
    // Silently ignore errors - this is just for analytics
  }
}

// Check if running in debug/inspection mode
function _isBeingDebugged() {
  const isBun = isRunningWithBun();

  // Check for inspect flags in process arguments (including all variants)
  const hasInspectArg = process.execArgv.some(arg => {
    if (isBun) {
      // Note: Bun has an issue with single-file executables where application arguments
      // from process.argv leak into process.execArgv (similar to https://github.com/oven-sh/bun/issues/11673)
      // This breaks use of --debug mode if we omit this branch
      // We're fine to skip that check, because Bun doesn't support Node.js legacy --debug or --debug-brk flags
      return /--inspect(-brk)?/.test(arg);
    } else {
      // In Node.js, check for both --inspect and legacy --debug flags
      return /--inspect(-brk)?|--debug(-brk)?/.test(arg);
    }
  });

  // Check if NODE_OPTIONS contains inspect flags
  const hasInspectEnv = process.env.NODE_OPTIONS && /--inspect(-brk)?|--debug(-brk)?/.test(process.env.NODE_OPTIONS);

  // Check if inspector is available and active (indicates debugging)
  try {
    // Dynamic import would be better but is async - use global object instead
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inspector = (global as any).require('inspector');
    const hasInspectorUrl = !!inspector.url();
    return hasInspectorUrl || hasInspectArg || hasInspectEnv;
  } catch {
    // Ignore error and fall back to argument detection
    return hasInspectArg || hasInspectEnv;
  }
}

/**
 * Per-session skill/plugin telemetry. Called from both the interactive path
 * and the headless -p path (before runHeadless) — both go through
 * main.tsx but branch before the interactive startup path, so it needs two
 * call sites here rather than one here + one in QueryEngine.
 */
// Exported for dispatcher/runner.ts (C6.5 migration).
export function logSessionTelemetry(): void {
  const model = parseUserSpecifiedModel(getInitialMainLoopModel() ?? getDefaultMainLoopModel());
  void logSkillsLoaded(getCwd(), getContextWindowForModel(model, getSdkBetas()));
  void loadAllPluginsCacheOnly()
    .then(({ enabled, errors }) => {
      const managedNames = getManagedPluginNames();
      logPluginsEnabledForSession(enabled, managedNames, getPluginSeedDirs());
      logPluginLoadErrors(errors, managedNames);
    })
    .catch(err => logError(err));
}

// Exported for dispatcher/runner.ts (C6.5 migration).
export function getCertEnvVarTelemetry(): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  if (process.env.NODE_EXTRA_CA_CERTS) {
    result.has_node_extra_ca_certs = true;
  }
  if (process.env.CLAUDE_CODE_CLIENT_CERT) {
    result.has_client_cert = true;
  }
  if (hasNodeOption('--use-system-ca')) {
    result.has_use_system_ca = true;
  }
  if (hasNodeOption('--use-openssl-ca')) {
    result.has_use_openssl_ca = true;
  }
  return result;
}

// Exported for dispatcher/runner.ts (C6.5 migration).
export async function logStartupTelemetry(): Promise<void> {
  if (isAnalyticsDisabled()) return;
  const [isGit, worktreeCount, ghAuthStatus] = await Promise.all([getIsGit(), getWorktreeCount(), getGhAuthStatus()]);

  logEvent('tengu_startup_telemetry', {
    is_git: isGit,
    worktree_count: worktreeCount,
    gh_auth_status: ghAuthStatus as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    sandbox_enabled: SandboxManager.isSandboxingEnabled(),
    are_unsandboxed_commands_allowed: SandboxManager.areUnsandboxedCommandsAllowed(),
    is_auto_bash_allowed_if_sandbox_enabled: SandboxManager.isAutoAllowBashIfSandboxedEnabled(),
    auto_updater_disabled: isAutoUpdaterDisabled(),
    prefers_reduced_motion: getInitialSettings().prefersReducedMotion ?? false,
    ...getCertEnvVarTelemetry(),
  });
}

// @[MODEL LAUNCH]: Consider any migrations you may need for model strings. See migrateSonnet1mToSonnet45.ts for an example.
// Bump this when adding a new sync migration so existing users re-run the set.
const CURRENT_MIGRATION_VERSION = 11;
export function runMigrations(): void {
  if (getGlobalConfig().migrationVersion !== CURRENT_MIGRATION_VERSION) {
    migrateBypassPermissionsAcceptedToSettings();
    migrateEnableAllProjectMcpServersToSettings();
    resetProToOpusDefault();
    migrateSonnet1mToSonnet45();
    migrateLegacyOpusToCurrent();
    migrateSonnet45ToSonnet46();
    migrateOpusToOpus1m();
    migrateReplBridgeEnabledToRemoteControlAtStartup();
    if (feature('TRANSCRIPT_CLASSIFIER')) {
      resetAutoModeOptInForDefaultOffer();
    }
    if (process.env.USER_TYPE === 'ant') {
      migrateFennecToOpus();
    }
    saveGlobalConfig(prev =>
      prev.migrationVersion === CURRENT_MIGRATION_VERSION
        ? prev
        : { ...prev, migrationVersion: CURRENT_MIGRATION_VERSION },
    );
  }
  // Async migration - fire and forget since it's non-blocking
  migrateChangelogFromConfig().catch(() => {
    // Silently ignore migration errors - will retry on next startup
  });
}

/**
 * Prefetch system context (including git status) only when it's safe to do so.
 * Git commands can execute arbitrary code via hooks and config (e.g., core.fsmonitor,
 * diff.external), so we must only run them after trust is established or in
 * non-interactive mode where trust is implicit.
 */
// Exported for dispatcher/runner.ts (C6.5 migration).
export function prefetchSystemContextIfSafe(): void {
  const isNonInteractiveSession = getIsNonInteractiveSession();

  // In non-interactive mode (--print), trust dialog is skipped and
  // execution is considered trusted (as documented in help text)
  if (isNonInteractiveSession) {
    logForDiagnosticsNoPII('info', 'prefetch_system_context_non_interactive');
    void getSystemContext();
    return;
  }

  // In interactive mode, only prefetch if trust has already been established
  const hasTrust = checkHasTrustDialogAccepted();
  if (hasTrust) {
    logForDiagnosticsNoPII('info', 'prefetch_system_context_has_trust');
    void getSystemContext();
  } else {
    logForDiagnosticsNoPII('info', 'prefetch_system_context_skipped_no_trust');
  }
  // Otherwise, don't prefetch - wait for trust to be established first
}

/**
 * Start background prefetches and housekeeping that are NOT needed before first render.
 * These are deferred from setup() to reduce event loop contention and child process
 * spawning during the critical startup path.
 * Call this after the REPL has been rendered.
 */
export function startDeferredPrefetches(): void {
  // This function runs after first render, so it doesn't block the initial paint.
  // However, the spawned processes and async work still contend for CPU and event
  // loop time, which skews startup benchmarks (CPU profiles, time-to-first-render
  // measurements). Skip all of it when we're only measuring startup performance.
  if (
    isEnvTruthy(process.env.CLAUDE_CODE_EXIT_AFTER_FIRST_RENDER) ||
    // --bare: skip ALL prefetches. These are cache-warms for the REPL's
    // first-turn responsiveness (initUser, getUserContext, tips, countFiles,
    // modelCapabilities, change detectors). Scripted -p calls don't have a
    // "user is typing" window to hide this work in — it's pure overhead on
    // the critical path.
    isBareMode()
  ) {
    return;
  }

  // Process-spawning prefetches (consumed at first API call, user is still typing)
  void initUser();
  void getUserContext();
  prefetchSystemContextIfSafe();
  void getRelevantTips();
  if (isEnvTruthy(process.env.CLAUDE_CODE_USE_BEDROCK) && !isEnvTruthy(process.env.CLAUDE_CODE_SKIP_BEDROCK_AUTH)) {
    void prefetchAwsCredentialsAndBedRockInfoIfSafe();
  }
  if (isEnvTruthy(process.env.CLAUDE_CODE_USE_VERTEX) && !isEnvTruthy(process.env.CLAUDE_CODE_SKIP_VERTEX_AUTH)) {
    void prefetchGcpCredentialsIfSafe();
  }
  void countFilesRoundedRg(getCwd(), AbortSignal.timeout(3000), []);

  // Analytics and feature flag initialization
  void initializeAnalyticsGates();

  void refreshModelCapabilities();

  // File change detectors deferred from init() to unblock first render
  void settingsChangeDetector.initialize();
  if (!isBareMode()) {
    void skillChangeDetector.initialize();
  }

  // Event loop stall detector — logs when the main thread is blocked >500ms
  if (process.env.USER_TYPE === 'ant') {
    void import('./utils/eventLoopStallDetector.js').then(m => m.startEventLoopStallDetector());
  }
}

// Exported for dispatcher/runner.ts (C6.5 migration).
export function loadSettingsFromFlag(settingsFile: string): void {
  try {
    const trimmedSettings = settingsFile.trim();
    const looksLikeJson = trimmedSettings.startsWith('{') && trimmedSettings.endsWith('}');

    let settingsPath: string;

    if (looksLikeJson) {
      // It's a JSON string - validate and create temp file
      const parsedJson = safeParseJSON(trimmedSettings);
      if (!parsedJson) {
        process.stderr.write(chalk.red('Error: Invalid JSON provided to --settings\n'));
        process.exit(1);
      }

      // Create a temporary file and write the JSON to it.
      // Use a content-hash-based path instead of random UUID to avoid
      // busting the Anthropic API prompt cache. The settings path ends up
      // in the Bash tool's sandbox denyWithinAllow list, which is part of
      // the tool description sent to the API. A random UUID per subprocess
      // changes the tool description on every query() call, invalidating
      // the cache prefix and causing a 12x input token cost penalty.
      // The content hash ensures identical settings produce the same path
      // across process boundaries (each SDK query() spawns a new process).
      settingsPath = generateTempFilePath('claude-settings', '.json', {
        contentHash: trimmedSettings,
      });
      writeFileSync_DEPRECATED(settingsPath, trimmedSettings, 'utf8');
    } else {
      // It's a file path - resolve and validate by attempting to read
      const { resolvedPath: resolvedSettingsPath } = safeResolvePath(getFsImplementation(), settingsFile);
      try {
        readFileSync(resolvedSettingsPath, 'utf8');
      } catch (e) {
        if (isENOENT(e)) {
          process.stderr.write(chalk.red(`Error: Settings file not found: ${resolvedSettingsPath}\n`));
          process.exit(1);
        }
        throw e;
      }
      settingsPath = resolvedSettingsPath;
    }

    setFlagSettingsPath(settingsPath);
    resetSettingsCache();
  } catch (error) {
    if (error instanceof Error) {
      logError(error);
    }
    process.stderr.write(chalk.red(`Error processing settings: ${errorMessage(error)}\n`));
    process.exit(1);
  }
}

// Exported for dispatcher/runner.ts (C6.5 migration).
export function loadSettingSourcesFromFlag(settingSourcesArg: string): void {
  try {
    const sources = parseSettingSourcesFlag(settingSourcesArg);
    setAllowedSettingSources(sources);
    resetSettingsCache();
  } catch (error) {
    if (error instanceof Error) {
      logError(error);
    }
    process.stderr.write(chalk.red(`Error processing --setting-sources: ${errorMessage(error)}\n`));
    process.exit(1);
  }
}

/**
 * Parse and load settings flags early, before init()
 * This ensures settings are filtered from the start of initialization
 */
function eagerLoadSettings(): void {
  profileCheckpoint('eagerLoadSettings_start');
  // Parse --settings flag early to ensure settings are loaded before init()
  const settingsFile = eagerParseCliFlag('--settings');
  if (settingsFile) {
    loadSettingsFromFlag(settingsFile);
  }

  // Parse --setting-sources flag early to control which sources are loaded
  const settingSourcesArg = eagerParseCliFlag('--setting-sources');
  if (settingSourcesArg !== undefined) {
    loadSettingSourcesFromFlag(settingSourcesArg);
  }
  profileCheckpoint('eagerLoadSettings_end');
}

function initializeEntrypoint(isNonInteractive: boolean): void {
  // Skip if already set (e.g., by SDK or other entrypoints)
  if (process.env.CLAUDE_CODE_ENTRYPOINT) {
    return;
  }

  const cliArgs = process.argv.slice(2);

  // Check for MCP serve command (handle flags before mcp serve, e.g., --debug mcp serve)
  const mcpIndex = cliArgs.indexOf('mcp');
  if (mcpIndex !== -1 && cliArgs[mcpIndex + 1] === 'serve') {
    process.env.CLAUDE_CODE_ENTRYPOINT = 'mcp';
    return;
  }

  if (isEnvTruthy(process.env.CLAUDE_CODE_ACTION)) {
    process.env.CLAUDE_CODE_ENTRYPOINT = 'claude-code-github-action';
    return;
  }

  // Note: 'local-agent' entrypoint is set by the local agent mode launcher
  // via CLAUDE_CODE_ENTRYPOINT env var (handled by early return above)

  // Set based on interactive status
  process.env.CLAUDE_CODE_ENTRYPOINT = isNonInteractive ? 'sdk-cli' : 'cli';
}

// Set by early argv processing when `claude open <url>` is detected (interactive mode only)
// Exported for dispatcher/runner.ts (C6.5 migration).
export type PendingConnect = {
  url: string | undefined;
  authToken: string | undefined;
  dangerouslySkipPermissions: boolean;
};
export const _pendingConnect: PendingConnect | undefined = feature('DIRECT_CONNECT')
  ? {
      url: undefined,
      authToken: undefined,
      dangerouslySkipPermissions: false,
    }
  : undefined;

// Set by early argv processing when `claude assistant [sessionId]` is detected
// Exported for dispatcher/runner.ts (C6.5 migration).
export type PendingAssistantChat = { sessionId?: string; discover: boolean };
export const _pendingAssistantChat: PendingAssistantChat | undefined = feature('KAIROS')
  ? { sessionId: undefined, discover: false }
  : undefined;

// `claude ssh <host> [dir]` — parsed from argv early (same pattern as
// DIRECT_CONNECT above) so the main command path can pick it up and hand
// the REPL an SSH-backed session instead of a local one.
// Exported for dispatcher/runner.ts (C6.5 migration).
export type PendingSSH = {
  host: string | undefined;
  cwd: string | undefined;
  permissionMode: string | undefined;
  dangerouslySkipPermissions: boolean;
  /** --local: spawn the child CLI directly, skip ssh/probe/deploy. e2e test mode. */
  local: boolean;
  /** Extra CLI args to forward to the remote CLI on initial spawn (--resume, -c). */
  extraCliArgs: string[];
  remoteBin: string | undefined;
};
export const _pendingSSH: PendingSSH | undefined = feature('SSH_REMOTE')
  ? {
      host: undefined,
      cwd: undefined,
      permissionMode: undefined,
      dangerouslySkipPermissions: false,
      local: false,
      extraCliArgs: [],
      remoteBin: undefined,
    }
  : undefined;

export async function main() {
  profileCheckpoint('main_function_start');

  // SECURITY: Prevent Windows from executing commands from current directory
  // This must be set before ANY command execution to prevent PATH hijacking attacks
  // See: https://docs.microsoft.com/en-us/windows/win32/api/processenv/nf-processenv-searchpathw
  process.env.NoDefaultCurrentDirectoryInExePath = '1';

  // Initialize warning handler early to catch warnings
  initializeWarningHandler();

  process.on('exit', () => {
    resetCursor();
    // 杀掉所有 running workflow，避免孤儿 task 留在 AppState 里
    try {
      const { peekWorkflowService } = require('./workflow/service.js') as {
        peekWorkflowService: () => { shutdown: () => void } | null;
      };
      peekWorkflowService()?.shutdown();
    } catch {
      // workflow 未启用或已卸载——忽略
    }
  });
  process.on('SIGINT', () => {
    // In print mode, print.ts registers its own SIGINT handler that aborts
    // the in-flight query and calls gracefulShutdown; skip here to avoid
    // preempting it with a synchronous process.exit().
    if (process.argv.includes('-p') || process.argv.includes('--print')) {
      return;
    }
    process.exit(0);
  });
  profileCheckpoint('main_warning_handler_initialized');

  // Check for cc:// or cc+unix:// URL in argv — rewrite so the main command
  // handles it, giving the full interactive TUI instead of a stripped-down subcommand.
  // For headless (-p), we rewrite to the internal `open` subcommand.
  if (feature('DIRECT_CONNECT')) {
    const rawCliArgs = process.argv.slice(2);
    const ccIdx = rawCliArgs.findIndex(a => a.startsWith('cc://') || a.startsWith('cc+unix://'));
    if (ccIdx !== -1 && _pendingConnect) {
      const ccUrl = rawCliArgs[ccIdx]!;
      const { parseConnectUrl } = await import('./server/parseConnectUrl.js');
      const parsed = parseConnectUrl(ccUrl);
      _pendingConnect.dangerouslySkipPermissions = rawCliArgs.includes('--dangerously-skip-permissions');

      if (rawCliArgs.includes('-p') || rawCliArgs.includes('--print')) {
        // Headless: rewrite to internal `open` subcommand
        const stripped = rawCliArgs.filter((_, i) => i !== ccIdx);
        const dspIdx = stripped.indexOf('--dangerously-skip-permissions');
        if (dspIdx !== -1) {
          stripped.splice(dspIdx, 1);
        }
        process.argv = [process.argv[0]!, process.argv[1]!, 'open', ccUrl, ...stripped];
      } else {
        // Interactive: strip cc:// URL and flags, run main command
        _pendingConnect.url = parsed.serverUrl;
        _pendingConnect.authToken = parsed.authToken;
        const stripped = rawCliArgs.filter((_, i) => i !== ccIdx);
        const dspIdx = stripped.indexOf('--dangerously-skip-permissions');
        if (dspIdx !== -1) {
          stripped.splice(dspIdx, 1);
        }
        process.argv = [process.argv[0]!, process.argv[1]!, ...stripped];
      }
    }
  }

  // Handle deep link URIs early — this is invoked by the OS protocol handler
  // and should bail out before full init since it only needs to parse the URI
  // and open a terminal.
  if (feature('LODESTONE')) {
    const handleUriIdx = process.argv.indexOf('--handle-uri');
    if (handleUriIdx !== -1 && process.argv[handleUriIdx + 1]) {
      const { enableConfigs } = await import('./utils/config.js');
      enableConfigs();
      const uri = process.argv[handleUriIdx + 1]!;
      const { handleDeepLinkUri } = await import('./utils/deepLink/protocolHandler.js');
      const exitCode = await handleDeepLinkUri(uri);
      process.exit(exitCode);
    }

    // macOS URL handler: when LaunchServices launches our .app bundle, the
    // URL arrives via Apple Event (not argv). LaunchServices overwrites
    // __CFBundleIdentifier to the launching bundle's ID, which is a precise
    // positive signal — cheaper than importing and guessing with heuristics.
    if (process.platform === 'darwin' && process.env.__CFBundleIdentifier === 'com.anthropic.claude-code-url-handler') {
      const { enableConfigs } = await import('./utils/config.js');
      enableConfigs();
      const { handleUrlSchemeLaunch } = await import('./utils/deepLink/protocolHandler.js');
      const urlSchemeResult = await handleUrlSchemeLaunch();
      process.exit(urlSchemeResult ?? 1);
    }
  }

  // `claude assistant [sessionId]` — stash and strip so the main
  // command handles it, giving the full interactive TUI. Position-0 only
  // (matching the ssh pattern below) — indexOf would false-positive on
  // `claude -p "explain assistant"`. Root-flag-before-subcommand
  // (e.g. `--debug assistant`) falls through to the stub, which
  // prints usage.
  if (feature('KAIROS') && _pendingAssistantChat) {
    const rawArgs = process.argv.slice(2);
    if (rawArgs[0] === 'assistant') {
      const nextArg = rawArgs[1];
      if (nextArg && !nextArg.startsWith('-')) {
        _pendingAssistantChat.sessionId = nextArg;
        rawArgs.splice(0, 2); // drop 'assistant' and sessionId
        process.argv = [process.argv[0]!, process.argv[1]!, ...rawArgs];
      } else if (!nextArg) {
        _pendingAssistantChat.discover = true;
        rawArgs.splice(0, 1); // drop 'assistant'
        process.argv = [process.argv[0]!, process.argv[1]!, ...rawArgs];
      }
      // else: `claude assistant --help` → fall through to stub
    }
  }

  // `claude ssh <host> [dir]` — strip from argv so the main command handler
  // runs (full interactive TUI), stash the host/dir for the REPL branch at
  // ~line 3720 to pick up. Headless (-p) mode not supported in v1: SSH
  // sessions need the local REPL to drive them (interrupt, permissions).
  if (feature('SSH_REMOTE') && _pendingSSH) {
    const rawCliArgs = process.argv.slice(2);
    // SSH-specific flags can appear before the host positional (e.g.
    // `ssh --permission-mode auto host /tmp` — standard POSIX flags-before-
    // positionals). Pull them all out BEFORE checking whether a host was
    // given, so `claude ssh --permission-mode auto host` and `claude ssh host
    // --permission-mode auto` are equivalent. The host check below only needs
    // to guard against `-h`/`--help` (which commander should handle).
    if (rawCliArgs[0] === 'ssh') {
      const localIdx = rawCliArgs.indexOf('--local');
      if (localIdx !== -1) {
        _pendingSSH.local = true;
        rawCliArgs.splice(localIdx, 1);
      }
      const dspIdx = rawCliArgs.indexOf('--dangerously-skip-permissions');
      if (dspIdx !== -1) {
        _pendingSSH.dangerouslySkipPermissions = true;
        rawCliArgs.splice(dspIdx, 1);
      }
      const pmIdx = rawCliArgs.indexOf('--permission-mode');
      if (pmIdx !== -1 && rawCliArgs[pmIdx + 1] && !rawCliArgs[pmIdx + 1]!.startsWith('-')) {
        _pendingSSH.permissionMode = rawCliArgs[pmIdx + 1];
        rawCliArgs.splice(pmIdx, 2);
      }
      const pmEqIdx = rawCliArgs.findIndex(a => a.startsWith('--permission-mode='));
      if (pmEqIdx !== -1) {
        _pendingSSH.permissionMode = rawCliArgs[pmEqIdx]!.split('=')[1];
        rawCliArgs.splice(pmEqIdx, 1);
      }
      // Forward session-resume + model flags to the remote CLI's initial spawn.
      // --continue/-c and --resume <uuid> operate on the REMOTE session history
      // (which persists under the remote's ~/.claude/projects/<cwd>/).
      // --model controls which model the remote uses.
      const extractFlag = (flag: string, opts: { hasValue?: boolean; as?: string } = {}) => {
        const i = rawCliArgs.indexOf(flag);
        if (i !== -1) {
          _pendingSSH.extraCliArgs.push(opts.as ?? flag);
          const val = rawCliArgs[i + 1];
          if (opts.hasValue && val && !val.startsWith('-')) {
            _pendingSSH.extraCliArgs.push(val);
            rawCliArgs.splice(i, 2);
          } else {
            rawCliArgs.splice(i, 1);
          }
        }
        const eqI = rawCliArgs.findIndex(a => a.startsWith(`${flag}=`));
        if (eqI !== -1) {
          _pendingSSH.extraCliArgs.push(opts.as ?? flag, rawCliArgs[eqI]!.slice(flag.length + 1));
          rawCliArgs.splice(eqI, 1);
        }
      };
      const rbIdx = rawCliArgs.indexOf('--remote-bin');
      if (rbIdx !== -1 && rawCliArgs[rbIdx + 1] && !rawCliArgs[rbIdx + 1]!.startsWith('-')) {
        _pendingSSH.remoteBin = rawCliArgs[rbIdx + 1];
        rawCliArgs.splice(rbIdx, 2);
      }
      const rbEqIdx = rawCliArgs.findIndex(a => a.startsWith('--remote-bin='));
      if (rbEqIdx !== -1) {
        _pendingSSH.remoteBin = rawCliArgs[rbEqIdx]!.split('=').slice(1).join('=');
        rawCliArgs.splice(rbEqIdx, 1);
      }

      extractFlag('-c', { as: '--continue' });
      extractFlag('--continue');
      extractFlag('--resume', { hasValue: true });
      extractFlag('--model', { hasValue: true });
    }
    // After pre-extraction, any remaining dash-arg at [1] is either -h/--help
    // (commander handles) or an unknown-to-ssh flag (fall through to commander
    // so it surfaces a proper error). Only a non-dash arg is the host.
    if (rawCliArgs[0] === 'ssh' && rawCliArgs[1] && !rawCliArgs[1].startsWith('-')) {
      _pendingSSH.host = rawCliArgs[1];
      // Optional positional cwd.
      let consumed = 2;
      if (rawCliArgs[2] && !rawCliArgs[2].startsWith('-')) {
        _pendingSSH.cwd = rawCliArgs[2];
        consumed = 3;
      }
      const rest = rawCliArgs.slice(consumed);

      // Headless (-p) mode is not supported with SSH in v1 — reject early
      // so the flag doesn't silently cause local execution.
      if (rest.includes('-p') || rest.includes('--print')) {
        process.stderr.write('Error: headless (-p/--print) mode is not supported with claude ssh\n');
        gracefulShutdownSync(1);
        return;
      }

      // Rewrite argv so the main command sees remaining flags but not `ssh`.
      process.argv = [process.argv[0]!, process.argv[1]!, ...rest];
    }
  }

  // Check for -p/--print and --init-only flags early to set isInteractiveSession before init()
  // This is needed because telemetry initialization calls auth functions that need this flag
  const cliArgs = process.argv.slice(2);
  const hasPrintFlag = cliArgs.includes('-p') || cliArgs.includes('--print');
  const hasInitOnlyFlag = cliArgs.includes('--init-only');
  const hasSdkUrl = cliArgs.some(arg => arg.startsWith('--sdk-url'));
  const forceInteractive = isEnvTruthy(process.env.CLAUDE_CODE_FORCE_INTERACTIVE);
  const isNonInteractive = hasPrintFlag || hasInitOnlyFlag || hasSdkUrl || (!forceInteractive && !process.stdout.isTTY);

  // Stop capturing early input for non-interactive modes
  if (isNonInteractive) {
    stopCapturingEarlyInput();
  }

  // Set simplified tracking fields
  const isInteractive = !isNonInteractive;
  setIsInteractive(isInteractive);

  // Initialize entrypoint based on mode - needs to be set before any event is logged
  initializeEntrypoint(isNonInteractive);

  // Determine client type
  const clientType = (() => {
    if (isEnvTruthy(process.env.GITHUB_ACTIONS)) return 'github-action';
    if (process.env.CLAUDE_CODE_ENTRYPOINT === 'sdk-ts') return 'sdk-typescript';
    if (process.env.CLAUDE_CODE_ENTRYPOINT === 'sdk-py') return 'sdk-python';
    if (process.env.CLAUDE_CODE_ENTRYPOINT === 'sdk-cli') return 'sdk-cli';
    if (process.env.CLAUDE_CODE_ENTRYPOINT === 'claude-vscode') return 'claude-vscode';
    if (process.env.CLAUDE_CODE_ENTRYPOINT === 'local-agent') return 'local-agent';
    if (process.env.CLAUDE_CODE_ENTRYPOINT === 'claude-desktop') return 'claude-desktop';

    // Check if session-ingress token is provided (indicates remote session)
    const hasSessionIngressToken =
      process.env.CLAUDE_CODE_SESSION_ACCESS_TOKEN || process.env.CLAUDE_CODE_WEBSOCKET_AUTH_FILE_DESCRIPTOR;
    if (process.env.CLAUDE_CODE_ENTRYPOINT === 'remote' || hasSessionIngressToken) {
      return 'remote';
    }

    return 'cli';
  })();
  setClientType(clientType);

  const previewFormat = process.env.CLAUDE_CODE_QUESTION_PREVIEW_FORMAT;
  if (previewFormat === 'markdown' || previewFormat === 'html') {
    setQuestionPreviewFormat(previewFormat);
  } else if (
    !clientType.startsWith('sdk-') &&
    // Desktop and CCR pass previewFormat via toolConfig; when the feature is
    // gated off they pass undefined — don't override that with markdown.
    clientType !== 'claude-desktop' &&
    clientType !== 'local-agent' &&
    clientType !== 'remote'
  ) {
    setQuestionPreviewFormat('markdown');
  }

  // Tag sessions created via `claude remote-control` so the backend can identify them
  if (process.env.CLAUDE_CODE_ENVIRONMENT_KIND === 'bridge') {
    setSessionSource('remote-control');
  }

  profileCheckpoint('main_client_type_determined');

  // Parse and load settings flags early, before init()
  eagerLoadSettings();

  profileCheckpoint('main_before_run');

  await run();
  profileCheckpoint('main_after_run');
}

// Exported for dispatcher/runner.ts (C6.5 migration).
export async function getInputPrompt(
  prompt: string,
  inputFormat: 'text' | 'stream-json',
): Promise<string | AsyncIterable<string>> {
  if (
    !process.stdin.isTTY &&
    // Input hijacking breaks MCP.
    !process.argv.includes('mcp')
  ) {
    if (inputFormat === 'stream-json') {
      return process.stdin;
    }
    process.stdin.setEncoding('utf8');
    let data = '';
    const onData = (chunk: string) => {
      data += chunk;
    };
    process.stdin.on('data', onData);
    // If no data arrives in 3s, stop waiting and warn. Stdin is likely an
    // inherited pipe from a parent that isn't writing (subprocess spawned
    // without explicit stdin handling). 3s covers slow producers like curl,
    // jq on large files, python with import overhead. The warning makes
    // silent data loss visible for the rare producer that's slower still.
    const timedOut = await peekForStdinData(process.stdin, 3000);
    process.stdin.off('data', onData);
    if (timedOut) {
      process.stderr.write(
        'Warning: no stdin data received in 3s, proceeding without it. ' +
          'If piping from a slow command, redirect stdin explicitly: < /dev/null to skip, or wait longer.\n',
      );
    }
    return [prompt, data].filter(Boolean).join('\n');
  }
  return prompt;
}

async function run(): Promise<CommanderCommand> {
  profileCheckpoint('run_function_start');

  // Commander program 装配（createProgram + preAction hook + 元数据）
  // 与全局 option 链已抽取到 src/cli/program/（见 C4）。
  const program = createProgram();
  registerGlobalOptions(program);

  // .action() handler 接收 prompt（来自 .argument('[prompt]')）和 options。
  // extra-typings 在链式调用中推断类型，但 option 链已抽取到 registerGlobalOptions，
  // 因此这里用 unknown 中转再断言，绕过 Command<[],{},{}> 的静态签名约束（见 C4）。
  // 运行时 Commander 仍会按 .argument() / .option() 注册传参。
  // C6.5: defaultAction 主体（~3014 行）已迁移到 src/cli/dispatcher/runner.ts。
  // 通过 `program.action(handleDefaultAction)` 接入。
  // 迁移日期：2026-07-11。骨架子模块（bootstrap/permissions/...）保留为未来拆分接入点。
  // extra-typings 的 .action() 期望基于 Command<Params, Opts> 推断的签名，
  // 但 option 链类型已不在 program 变量上（registerGlobalOptions 内部注册）。
  // 运行时行为不变：Commander 按 .argument('[prompt]') / .option() 注册传参。
  program.action(
    handleDefaultAction as unknown as (
      this: typeof program,
      args_0: {},
      args_1: typeof program,
    ) => void | Promise<void>,
  );
  program.version(`${MACRO.VERSION} (Claude Code)`, '-v, --version', 'Output the version number');

  // 条件性全局 option（worktree / tmux / ANT-only / feature-gated / teammate）
  // 已抽取到 src/cli/program/options.ts（见 C4）。
  registerConditionalOptions(program);

  profileCheckpoint('run_main_options_built');

  // -p/--print mode: skip subcommand registration. The 52 subcommands
  // (mcp, auth, plugin, skill, task, config, doctor, update, etc.) are
  // never dispatched in print mode — commander routes the prompt to the
  // default action. The subcommand registration path was measured at ~65ms
  // on baseline — mostly the isBridgeEnabled() call (25ms settings Zod parse
  // + 40ms sync keychain subprocess), both hidden by the try/catch that
  // always returns false before enableConfigs(). cc:// URLs are rewritten to
  // `open` at main() line ~851 BEFORE this runs, so argv check is safe here.
  const isPrintMode = process.argv.includes('-p') || process.argv.includes('--print');
  const isCcUrl = process.argv.some(a => a.startsWith('cc://') || a.startsWith('cc+unix://'));
  if (isPrintMode && !isCcUrl) {
    profileCheckpoint('run_before_parse');
    await program.parseAsync(process.argv);
    profileCheckpoint('run_after_parse');
    return program;
  }

  // Register the 10 extracted subcommands (mcp/auth/plugin/agents/doctor/
  // update/server/auto-mode/autonomy/task) via static-import definers (C5).
  // Remaining subcommands (ssh/open/setup-token/remote-control/assistant/
  // up/rollback/install/log/error/export/completion) stay inline below for
  // closure access or feature-gate simplicity (Plan B for complex ones).
  registerAllSubcommands(program);

  // claude mcp + claude server — registered via registerAllSubcommands (C5).
  // See src/cli/subcommands/{mcp,server}.ts.

  // `claude ssh <host> [dir]` — registered here only so --help shows it.
  // The actual interactive flow is handled by early argv rewriting in main()
  // (parallels the DIRECT_CONNECT/cc:// pattern above). If commander reaches
  // this action it means the argv rewrite didn't fire (e.g. user ran
  // `claude ssh` with no host) — just print usage.
  if (feature('SSH_REMOTE')) {
    program
      .command('ssh <host> [dir]')
      .description(
        'Run Claude Code on a remote host over SSH. Deploys the binary and ' +
          'tunnels API auth back through your local machine — no remote setup needed.',
      )
      .option('--permission-mode <mode>', 'Permission mode for the remote session')
      .option('--dangerously-skip-permissions', 'Skip all permission prompts on the remote (dangerous)')
      .option(
        '--remote-bin <command>',
        'Custom remote binary command (skips probe/deploy). ' +
          "Example: --remote-bin 'bun /path/to/project/dist/cli.js'",
      )
      .option(
        '--local',
        'e2e test mode — spawn the child CLI locally (skip ssh/deploy). ' +
          'Exercises the auth proxy and unix-socket plumbing without a remote host.',
      )
      .action(async () => {
        // Argv rewriting in main() should have consumed `ssh <host>` before
        // commander runs. Reaching here means host was missing or the
        // rewrite predicate didn't match.
        process.stderr.write(
          'Usage: claude ssh <user@host | ssh-config-alias> [dir]\n\n' +
            "Runs Claude Code on a remote Linux host. You don't need to install\n" +
            'anything on the remote or run `claude auth login` there — the binary is\n' +
            'deployed over SSH and API auth tunnels back through your local machine.\n',
        );
        process.exit(1);
      });
  }

  // claude connect — subcommand only handles -p (headless) mode.
  // Interactive mode (without -p) is handled by early argv rewriting in main()
  // which redirects to the main command with full TUI support.
  if (feature('DIRECT_CONNECT')) {
    program
      .command('open <cc-url>')
      .description('Connect to a Claude Code server (internal — use cc:// URLs)')
      .option('-p, --print [prompt]', 'Print mode (headless)')
      .option('--output-format <format>', 'Output format: text, json, stream-json', 'text')
      .action(
        async (
          ccUrl: string,
          opts: {
            print?: string | true;
            outputFormat?: string;
          },
        ) => {
          const { parseConnectUrl } = await import('./server/parseConnectUrl.js');
          const { serverUrl, authToken } = parseConnectUrl(ccUrl);

          let connectConfig;
          try {
            const session = await createDirectConnectSession({
              serverUrl,
              authToken,
              cwd: getOriginalCwd(),
              dangerouslySkipPermissions: _pendingConnect?.dangerouslySkipPermissions,
            });
            if (session.workDir) {
              setOriginalCwd(session.workDir);
              setCwdState(session.workDir);
            }
            setDirectConnectServerUrl(serverUrl);
            connectConfig = session.config;
          } catch (err) {
            console.error(err instanceof DirectConnectError ? err.message : String(err));
            process.exit(1);
          }

          const { runConnectHeadless } = await import('./server/connectHeadless.js');

          const prompt = typeof opts.print === 'string' ? opts.print : '';
          const interactive = opts.print === true;
          await runConnectHeadless(connectConfig, prompt, opts.outputFormat, interactive);
        },
      );
  }

  // claude auth — registered via registerAllSubcommands (C5).
  // See src/cli/subcommands/auth.ts.

  // plugin — registered via registerAllSubcommands (C5).
  // See src/cli/subcommands/plugin.ts.

  // Setup token command
  program
    .command('setup-token')
    .description('Set up a long-lived authentication token (requires Claude subscription)')
    .action(async () => {
      const [{ setupTokenHandler }, { createRoot }] = await Promise.all([
        import('./cli/handlers/util.js'),
        import('@anthropic/ink'),
      ]);
      const root = await createRoot(getBaseRenderOptions(false));
      await setupTokenHandler(root);
    });

  // agents — registered via registerAllSubcommands (C5).
  // See src/cli/subcommands/agents.ts.

  // auto-mode — registered via registerAllSubcommands (C5).
  // See src/cli/subcommands/auto-mode.ts (feature-gated + circuit breaker).

  // autonomy — registered via registerAllSubcommands (C5).
  // See src/cli/subcommands/autonomy.ts.

  // Remote Control command — connect local environment to claude.ai/code.
  // The actual command is intercepted by the fast-path in cli.tsx before
  // Commander.js runs, so this registration exists only for help output.
  // Always hidden: isBridgeEnabled() at this point (before enableConfigs)
  // would throw inside isClaudeAISubscriber → getGlobalConfig and return
  // false via the try/catch — but not before paying ~65ms of side effects
  // (25ms settings Zod parse + 40ms sync `security` keychain subprocess).
  // The dynamic visibility never worked; the command was always hidden.
  if (feature('BRIDGE_MODE')) {
    program
      .command('remote-control', { hidden: true })
      .alias('rc')
      .description('Connect your local environment for remote-control sessions via claude.ai/code')
      .action(async () => {
        // Unreachable — cli.tsx fast-path handles this command before main.tsx loads.
        // If somehow reached, delegate to bridgeMain.
        const { bridgeMain } = await import('./bridge/bridgeMain.js');
        await bridgeMain(process.argv.slice(3));
      });
  }

  if (feature('KAIROS')) {
    program
      .command('assistant [sessionId]')
      .description(
        'Attach the REPL as a client to a running bridge session. Discovers sessions via API if no sessionId given.',
      )
      .action(() => {
        // Argv rewriting above should have consumed `assistant [id]`
        // before commander runs. Reaching here means a root flag came first
        // (e.g. `--debug assistant`) and the position-0 predicate
        // didn't match. Print usage like the ssh stub does.
        process.stderr.write(
          'Usage: claude assistant [sessionId]\n\n' +
            'Attach the REPL as a viewer client to a running bridge session.\n' +
            'Omit sessionId to discover and pick from available sessions.\n',
        );
        process.exit(1);
      });
  }

  // doctor — registered via registerAllSubcommands (C5).
  // See src/cli/subcommands/doctor.ts.

  // claude up — run the project's CLAUDE.md "# claude up" setup instructions.
  if (process.env.USER_TYPE === 'ant') {
    program
      .command('up')
      .description(
        '[ANT-ONLY] Initialize or upgrade the local dev environment using the "# claude up" section of the nearest CLAUDE.md',
      )
      .action(async () => {
        const { up } = await import('src/cli/up.js');
        await up();
      });
  }

  // claude rollback (ant-only)
  // Rolls back to previous releases
  if (process.env.USER_TYPE === 'ant') {
    program
      .command('rollback [target]')
      .description(
        '[ANT-ONLY] Roll back to a previous release\n\nExamples:\n  claude rollback                                    Go 1 version back from current\n  claude rollback 3                                  Go 3 versions back from current\n  claude rollback 2.0.73-dev.20251217.t190658        Roll back to a specific version',
      )
      .option('-l, --list', 'List recent published versions with ages')
      .option('--dry-run', 'Show what would be installed without installing')
      .option('--safe', 'Roll back to the server-pinned safe version (set by oncall during incidents)')
      .action(
        async (
          target?: string,
          options?: {
            list?: boolean;
            dryRun?: boolean;
            safe?: boolean;
          },
        ) => {
          const { rollback } = await import('src/cli/rollback.js');
          await rollback(target, options);
        },
      );
  }

  // claude install
  program
    .command('install [target]')
    .description(
      'Install Claude Code native build. Use [target] to specify version (stable, latest, or specific version)',
    )
    .option('--force', 'Force installation even if already installed')
    .action(async (target: string | undefined, options: { force?: boolean }) => {
      const { installHandler } = await import('./cli/handlers/util.js');
      await installHandler(target, options);
    });

  // update — registered via registerAllSubcommands (C5).
  // See src/cli/subcommands/update.ts.

  // ant-only commands
  if (process.env.USER_TYPE === 'ant') {
    const validateLogId = (value: string) => {
      const maybeSessionId = validateUuid(value);
      if (maybeSessionId) return maybeSessionId;
      return Number(value);
    };
    // claude log
    program
      .command('log')
      .description('[ANT-ONLY] Manage conversation logs.')
      .argument(
        '[number|sessionId]',
        'A number (0, 1, 2, etc.) to display a specific log, or the sesssion ID (uuid) of a log',
        validateLogId,
      )
      .action(async (logId: string | number | undefined) => {
        const { logHandler } = await import('./cli/handlers/ant.js');
        await logHandler(logId);
      });

    // claude error
    program
      .command('error')
      .description(
        '[ANT-ONLY] View error logs. Optionally provide a number (0, -1, -2, etc.) to display a specific log.',
      )
      .argument('[number]', 'A number (0, 1, 2, etc.) to display a specific log', parseInt)
      .action(async (number: number | undefined) => {
        const { errorHandler } = await import('./cli/handlers/ant.js');
        await errorHandler(number);
      });

    // claude export
    program
      .command('export')
      .description('[ANT-ONLY] Export a conversation to a text file.')
      .usage('<source> <outputFile>')
      .argument('<source>', 'Session ID, log index (0, 1, 2...), or path to a .json/.jsonl log file')
      .argument('<outputFile>', 'Output file path for the exported text')
      .addHelpText(
        'after',
        `
Examples:
  $ claude export 0 conversation.txt                Export conversation at log index 0
  $ claude export <uuid> conversation.txt           Export conversation by session ID
  $ claude export input.json output.txt             Render JSON log file to text
  $ claude export <uuid>.jsonl output.txt           Render JSONL session file to text`,
      )
      .action(async (source: string, outputFile: string) => {
        const { exportHandler } = await import('./cli/handlers/ant.js');
        await exportHandler(source, outputFile);
      });

    // task — registered via registerAllSubcommands (C5).
    // See src/cli/subcommands/task.ts (USER_TYPE === 'ant' guard inside).

    // claude completion <shell>
    program
      .command('completion <shell>', { hidden: true })
      .description('Generate shell completion script (bash, zsh, or fish)')
      .option('--output <file>', 'Write completion script directly to a file instead of stdout')
      .action(async (shell: string, opts: { output?: string }) => {
        const { completionHandler } = await import('./cli/handlers/ant.js');
        await completionHandler(shell, opts, program);
      });
  }

  profileCheckpoint('run_before_parse');
  await program.parseAsync(process.argv);
  profileCheckpoint('run_after_parse');

  // Record final checkpoint for total_time calculation
  profileCheckpoint('main_after_run');

  // Log startup perf to Statsig (sampled) and output detailed report if enabled
  profileReport();

  return program;
}

// Exported for dispatcher/runner.ts (C6.5 migration).
export async function logTenguInit({
  hasInitialPrompt,
  hasStdin,
  verbose,
  debug,
  debugToStderr,
  print,
  outputFormat,
  inputFormat,
  numAllowedTools,
  numDisallowedTools,
  mcpClientCount,
  worktreeEnabled,
  skipWebFetchPreflight,
  githubActionInputs,
  dangerouslySkipPermissionsPassed,
  permissionMode,
  modeIsBypass,
  allowDangerouslySkipPermissionsPassed,
  systemPromptFlag,
  appendSystemPromptFlag,
  thinkingConfig,
  assistantActivationPath,
}: {
  hasInitialPrompt: boolean;
  hasStdin: boolean;
  verbose: boolean;
  debug: boolean;
  debugToStderr: boolean;
  print: boolean;
  outputFormat: string;
  inputFormat: string;
  numAllowedTools: number;
  numDisallowedTools: number;
  mcpClientCount: number;
  worktreeEnabled: boolean;
  skipWebFetchPreflight: boolean | undefined;
  githubActionInputs: string | undefined;
  dangerouslySkipPermissionsPassed: boolean;
  permissionMode: string;
  modeIsBypass: boolean;
  allowDangerouslySkipPermissionsPassed: boolean;
  systemPromptFlag: 'file' | 'flag' | undefined;
  appendSystemPromptFlag: 'file' | 'flag' | undefined;
  thinkingConfig: ThinkingConfig;
  assistantActivationPath: string | undefined;
}): Promise<void> {
  try {
    logEvent('tengu_init', {
      entrypoint: 'claude' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      hasInitialPrompt,
      hasStdin,
      verbose,
      debug,
      debugToStderr,
      print,
      outputFormat: outputFormat as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      inputFormat: inputFormat as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      numAllowedTools,
      numDisallowedTools,
      mcpClientCount,
      worktree: worktreeEnabled,
      skipWebFetchPreflight,
      ...(githubActionInputs && {
        githubActionInputs: githubActionInputs as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      }),
      dangerouslySkipPermissionsPassed,
      permissionMode: permissionMode as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      modeIsBypass,
      inProtectedNamespace: isInProtectedNamespace(),
      allowDangerouslySkipPermissionsPassed,
      thinkingType: thinkingConfig.type as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      ...(thinkingConfig.type === 'enabled' && {
        thinkingBudgetTokens: thinkingConfig.budgetTokens,
      }),
      ...(systemPromptFlag && {
        systemPromptFlag: systemPromptFlag as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      }),
      ...(appendSystemPromptFlag && {
        appendSystemPromptFlag: appendSystemPromptFlag as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      }),
      is_simple: isBareMode() || undefined,
      is_coordinator: feature('COORDINATOR_MODE') && coordinatorModeModule?.isCoordinatorMode() ? true : undefined,
      ...(assistantActivationPath && {
        assistantActivationPath: assistantActivationPath as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      }),
      autoUpdatesChannel: (getInitialSettings().autoUpdatesChannel ??
        'latest') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      ...(process.env.USER_TYPE === 'ant'
        ? (() => {
            const cwd = getCwd();
            const gitRoot = findGitRoot(cwd);
            const rp = gitRoot ? relative(gitRoot, cwd) || '.' : undefined;
            return rp
              ? {
                  relativeProjectPath: rp as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
                }
              : {};
          })()
        : {}),
    });
  } catch (error) {
    logError(error);
  }
}

// Exported for dispatcher/runner.ts (C6.5 migration).
export function maybeActivateProactive(options: unknown): void {
  if (
    (feature('PROACTIVE') || feature('KAIROS')) &&
    ((options as { proactive?: boolean }).proactive || isEnvTruthy(process.env.CLAUDE_CODE_PROACTIVE))
  ) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const proactiveModule = require('./proactive/index.js');
    if (!proactiveModule.isProactiveActive()) {
      proactiveModule.activateProactive('command');
    }
  }
}

// Exported for dispatcher/runner.ts (C6.5 migration).
export function maybeActivateBrief(options: unknown): void {
  if (!(feature('KAIROS') || feature('KAIROS_BRIEF'))) return;
  const briefFlag = (options as { brief?: boolean }).brief;
  const briefEnv = isEnvTruthy(process.env.CLAUDE_CODE_BRIEF);
  if (!briefFlag && !briefEnv) return;
  // --brief / CLAUDE_CODE_BRIEF are explicit opt-ins: check entitlement,
  // then set userMsgOptIn to activate the tool + prompt section. The env
  // var also grants entitlement (isBriefEntitled() reads it), so setting
  // CLAUDE_CODE_BRIEF=1 alone force-enables for dev/testing — no GB gate
  // needed. initialIsBriefOnly reads getUserMsgOptIn() directly.
  // Conditional require: static import would leak the tool name string
  // into external builds via BriefTool.ts → prompt.ts.
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { isBriefEntitled } =
    require('@claude-code-best/builtin-tools/tools/BriefTool/BriefTool.js') as typeof import('@claude-code-best/builtin-tools/tools/BriefTool/BriefTool.js');
  /* eslint-enable @typescript-eslint/no-require-imports */
  const entitled = isBriefEntitled();
  if (entitled) {
    setUserMsgOptIn(true);
  }
  // Fire unconditionally once intent is seen: enabled=false captures the
  // "user tried but was gated" failure mode in Datadog.
  logEvent('tengu_brief_mode_enabled', {
    enabled: entitled,
    gated: !entitled,
    source: (briefEnv ? 'env' : 'flag') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  });
}

// Exported for callers that need cursor reset on exit.
export function resetCursor() {
  const terminal = process.stderr.isTTY ? process.stderr : process.stdout.isTTY ? process.stdout : undefined;
  terminal?.write(SHOW_CURSOR);
}

// Exported for dispatcher/runner.ts (C6.5 migration).
export type TeammateOptions = {
  agentId?: string;
  agentName?: string;
  teamName?: string;
  agentColor?: string;
  planModeRequired?: boolean;
  parentSessionId?: string;
  teammateMode?: 'auto' | 'tmux' | 'in-process';
  agentType?: string;
};

// Exported for dispatcher/runner.ts (C6.5 migration).
export function extractTeammateOptions(options: unknown): TeammateOptions {
  if (typeof options !== 'object' || options === null) {
    return {};
  }
  const opts = options as Record<string, unknown>;
  const teammateMode = opts.teammateMode;
  return {
    agentId: typeof opts.agentId === 'string' ? opts.agentId : undefined,
    agentName: typeof opts.agentName === 'string' ? opts.agentName : undefined,
    teamName: typeof opts.teamName === 'string' ? opts.teamName : undefined,
    agentColor: typeof opts.agentColor === 'string' ? opts.agentColor : undefined,
    planModeRequired: typeof opts.planModeRequired === 'boolean' ? opts.planModeRequired : undefined,
    parentSessionId: typeof opts.parentSessionId === 'string' ? opts.parentSessionId : undefined,
    teammateMode:
      teammateMode === 'auto' || teammateMode === 'tmux' || teammateMode === 'in-process' ? teammateMode : undefined,
    agentType: typeof opts.agentType === 'string' ? opts.agentType : undefined,
  };
}
