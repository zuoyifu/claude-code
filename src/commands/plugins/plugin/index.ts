import type { Command } from '../../../types/command.js'

const plugin = {
  type: 'local-jsx',
  name: 'plugin',
  aliases: ['plugins', 'marketplace'],
  description: 'Manage Claude Code plugins',
  immediate: true,
  load: () => import('./plugin.js'),
} satisfies Command

export default plugin
