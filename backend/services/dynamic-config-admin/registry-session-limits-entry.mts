import {
  sessionLimitsConfig,
  sessionLimitsMaxValues,
} from '@services/jwt-session/session-limits-config'
import { defineDynamicConfigNamespace } from 'valkyries/dynamic-config'

export const sessionLimitsRegistryEntry = defineDynamicConfigNamespace({
  namespace: 'session-limits-config',
  label: 'Session limits',
  description: 'Maximum active authenticated sessions per user.',
  config: sessionLimitsConfig,
  access: { update_roles: ['developer'] },
  fields: {
    active_sessions_per_user: {
      description: 'Maximum unrevoked, unexpired sessions per user.',
      minValue: 1,
      maxValue: sessionLimitsMaxValues.active_sessions_per_user,
      integer: true,
    },
  },
})
