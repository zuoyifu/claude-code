import type { Tool } from '../core/index.js'
import { getTools, getAllBaseTools, assembleToolPool } from './assembler.js'

export { getTools, getAllBaseTools, assembleToolPool }
export type { Tool }

/**
 * Find a registered tool by name from a tool pool.
 * Convenience lookup helper that wraps toolMatchesName.
 */
export function findRegisteredTool(
  tools: Tool[],
  name: string,
): Tool | undefined {
  return tools.find(t => t.name === name)
}
