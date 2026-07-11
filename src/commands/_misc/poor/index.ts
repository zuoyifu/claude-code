import type { Command } from '../../../types/command.js'

const poor = {
  type: 'local',
  name: 'poor',
  description:
    'Toggle poor mode — disable extract_memories and prompt_suggestion to save tokens',
  supportsNonInteractive: false,
  load: () => import('./poor.js'),
} satisfies Command

export default poor
