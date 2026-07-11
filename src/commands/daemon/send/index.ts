import type { Command } from '../../../types/command.js'

const send = {
  type: 'local',
  name: 'send',
  description: 'Send a message to a connected sub CLI',
  supportsNonInteractive: false,
  load: () => import('./send.js'),
} satisfies Command

export default send
