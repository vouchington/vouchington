import {
  EXPOSURE_BREAK_THRESHOLD,
  EXPOSURE_COUNT_DISPLAY_CAP_MAX,
  moderationExposureConfig,
} from '@services/moderation-exposure/config'
import { defineDynamicConfigNamespace } from 'valkyries/dynamic-config'

export const moderationExposureRegistryEntry = defineDynamicConfigNamespace({
  namespace: 'moderation-exposure-config',
  label: 'Moderation Exposure',
  description:
    'Display cap for the distinct sensitive-media reveals a moderator sees in the break prompt. The cooldown threshold and timing are not affected.',
  config: moderationExposureConfig,
  access: { update_roles: ['developer'] },
  fields: {
    count_display_cap: {
      description:
        'Largest reveal count reported before clients show "N+". Never reported below the break threshold.',
      minValue: EXPOSURE_BREAK_THRESHOLD,
      maxValue: EXPOSURE_COUNT_DISPLAY_CAP_MAX,
      integer: true,
    },
  },
})
