// DEPRECATED: This file is a backward-compatibility re-export.
// All implementations have moved to src/commands/_registry/registry.ts.
// New code should import from 'src/commands/_registry/registry.js'.
export {
  getCommands,
  getSlashCommandToolSkills,
  getSkillToolCommands,
  getMcpSkillCommands,
  filterCommandsForRemoteMode,
  REMOTE_SAFE_COMMANDS,
  BRIDGE_SAFE_COMMANDS,
  INTERNAL_ONLY_COMMANDS,
  isBridgeSafeCommand,
  getBridgeCommandSafety,
  clearCommandsCache,
  clearCommandMemoizationCaches,
  meetsAvailabilityRequirement,
  findCommand,
  hasCommand,
  getCommand,
  formatDescriptionWithSource,
  builtInCommandNames,
} from './commands/_registry/registry.js'
export type {
  Command,
  CommandBase,
  CommandResultDisplay,
  LocalCommandResult,
  LocalJSXCommandContext,
  PromptCommand,
  ResumeEntrypoint,
} from './types/command.js'
export { getCommandName, isCommandEnabled } from './types/command.js'
