import { defineDynamicConfigNamespace } from 'valkyries/dynamic-config'
import { PROFILE_COUNT_CAP_MAX_VALUE, profileCountConfig } from '@services/users/profile-count-cap'

export const profileCountRegistryEntry = defineDynamicConfigNamespace({
  namespace: 'profile-count-config',
  label: 'Profile counts',
  description: 'Largest exact count a user profile reports before it shows a capped count.',
  config: profileCountConfig,
  access: { update_roles: ['developer'] },
  fields: {
    count_cap: {
      description:
        'Each profile count is read up to this many rows; a larger count is reported as this value with capped set.',
      minValue: 1,
      maxValue: PROFILE_COUNT_CAP_MAX_VALUE,
      integer: true,
    },
  },
})
