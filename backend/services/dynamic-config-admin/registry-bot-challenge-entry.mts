import {
  BOT_CHALLENGE_CLEARANCE_MAX_SECONDS,
  botChallengeConfig,
} from '@services/captcha/bot-challenge-config'
import { defineDynamicConfigNamespace } from 'valkyries/dynamic-config'

export const botChallengeRegistryEntry = defineDynamicConfigNamespace({
  namespace: 'bot-challenge-config',
  label: 'Bot challenge',
  description: 'Session clearance after a verified low-score mutation challenge.',
  config: botChallengeConfig,
  access: { update_roles: ['developer'] },
  fields: {
    clearance_seconds: {
      description:
        'Seconds a verified session may make low-score mutations without another generic challenge. Zero disables clearance.',
      integer: true,
      minValue: 0,
      maxValue: BOT_CHALLENGE_CLEARANCE_MAX_SECONDS,
    },
  },
})
