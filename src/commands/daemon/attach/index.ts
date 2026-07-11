import type { Command } from '../../../types/command.js'

const attach = {
  type: 'local',
  name: 'attach',
  description: 'Attach to a sub Claude CLI instance via named pipe',
  supportsNonInteractive: false,
  load: () => import('./attach.js'),
} satisfies Command

export default attach
