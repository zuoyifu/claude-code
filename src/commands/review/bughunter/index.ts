import type { Command } from '../../../types/command.js'

const bughunter: Command = {
  type: 'prompt',
  name: 'stub',
  description: 'Bug hunter (internal)',
  progressMessage: 'hunting bugs',
  contentLength: 0,
  source: 'builtin',
  isEnabled: () => false,
  isHidden: true,
  async getPromptForCommand(_args: string) {
    return []
  },
}

export default bughunter
