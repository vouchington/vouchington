import {
  EMAIL_CODE_REQUEST_MIN_INTERVAL_MAX_SECONDS,
  emailAuthLimitsConfig,
} from '@services/users/email-auth-limits-config'
import { defineDynamicConfigNamespace } from 'valkyries/dynamic-config'

export const emailAuthLimitsRegistryEntry = defineDynamicConfigNamespace({
  namespace: 'email-auth-limits-config',
  label: 'Email sign-in limits',
  description: 'Spacing between emailed sign-in and re-authentication codes.',
  config: emailAuthLimitsConfig,
  access: { update_roles: ['developer'] },
  fields: {
    code_request_min_interval_seconds: {
      description:
        'Minimum seconds between code emails for one email address (login) or session (re-auth). Zero disables the spacing.',
      integer: true,
      minValue: 0,
      maxValue: EMAIL_CODE_REQUEST_MIN_INTERVAL_MAX_SECONDS,
    },
  },
})
