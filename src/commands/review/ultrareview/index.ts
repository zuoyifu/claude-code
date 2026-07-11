import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/messages.js'
import type { Command } from '../../../types/command.js'
import { isUltrareviewEnabled } from '../ultrareviewEnabled.js'

const CCR_TERMS_URL = 'https://code.claude.com/docs/en/claude-code-on-the-web'

// /ultrareview is the ONLY entry point to the remote bughunter path —
// /review stays purely local. local-jsx type renders the overage permission
// dialog when free reviews are exhausted.
const ultrareview: Command = {
  type: 'local-jsx',
  name: 'ultrareview',
  description: `~10–20 min · Finds and verifies bugs in your branch. Runs in Claude Code on the web. See ${CCR_TERMS_URL}`,
  isEnabled: () => isUltrareviewEnabled(),
  load: () => import('../ultrareviewCommand.js'),
}

export default ultrareview
