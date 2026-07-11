import { getIsNonInteractiveSession } from '../../../bootstrap/state.js'
import type { Command } from '../../../types/command.js'
import { isOverageProvisioningAllowed } from '../../../utils/auth.js'
import { isEnvTruthy } from '../../../utils/envUtils.js'

function isExtraUsageAllowed(): boolean {
  if (isEnvTruthy(process.env.DISABLE_EXTRA_USAGE_COMMAND)) {
    return false
  }
  return isOverageProvisioningAllowed()
}

const extraUsage = {
  type: 'local-jsx',
  name: 'extra-usage',
  description: 'Configure extra usage to keep working when limits are hit',
  isEnabled: () => isExtraUsageAllowed() && !getIsNonInteractiveSession(),
  load: () => import('./extra-usage.js'),
} satisfies Command

export default extraUsage

const extraUsageNonInteractive = {
  type: 'local',
  name: 'extra-usage',
  supportsNonInteractive: true,
  description: 'Configure extra usage to keep working when limits are hit',
  isEnabled: () => isExtraUsageAllowed() && getIsNonInteractiveSession(),
  get isHidden() {
    return !getIsNonInteractiveSession()
  },
  load: () => import('./extra-usage-noninteractive.js'),
} satisfies Command

export { extraUsage, extraUsageNonInteractive }
