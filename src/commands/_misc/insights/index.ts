import type { Command } from '../../../types/command.js'

/**
 * Lazy shim defers the heavy insights module (113KB, 3200 lines) until
 * /insights is actually invoked.
 */
const usageReport: Command = {
  type: 'prompt',
  name: 'insights',
  description: 'Generate a report analyzing your Claude Code sessions',
  contentLength: 0,
  progressMessage: 'analyzing your sessions',
  source: 'builtin',
  async getPromptForCommand(args, context) {
    const real = (await import('./handler.js')).default
    if (real.type !== 'prompt') throw new Error('unreachable')
    return real.getPromptForCommand(args, context)
  },
}

export default usageReport
