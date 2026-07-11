import type { Command } from '../../../types/command.js'
import { hasAnthropicApiKeyAuth } from '../../../utils/auth.js'
import { isEnvTruthy } from '../../../utils/envUtils.js'

const loginCommand = {
  type: 'local-jsx',
  name: 'login',
  get description() {
    return hasAnthropicApiKeyAuth()
      ? 'Switch Anthropic accounts'
      : 'Sign in with your Anthropic account'
  },
  isEnabled: () => !isEnvTruthy(process.env.DISABLE_LOGIN_COMMAND),
  load: () => import('./login.js'),
} satisfies Command

export default loginCommand
