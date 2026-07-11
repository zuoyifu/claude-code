import type { Command } from '../../../types/command.js'

const hooks = {
  type: 'local-jsx',
  name: 'hooks',
  description: 'View hook configurations for tool events',
  immediate: true,
  load: () => import('./hooks.js'),
} satisfies Command

export default hooks
