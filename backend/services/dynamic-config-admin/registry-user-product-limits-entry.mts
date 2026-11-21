import {
  FOLLOWER_DISTRIBUTION_RECIPIENTS_MAX,
  MESSAGE_RECIPIENTS_MAX,
  OAUTH_APP_SCOPES_MAX,
  USER_EMAIL_ADDRESSES_MAX,
  USER_PASSKEYS_MAX,
  USER_PROFILE_LINKS_MAX,
  userProductLimitsConfig,
} from '@services/user-product-limits'
import { defineDynamicConfigNamespace } from 'valkyries/dynamic-config'

export const userProductLimitsRegistryEntry = defineDynamicConfigNamespace({
  namespace: 'user-product-limits-config',
  label: 'User Product Limits',
  description:
    'Per-user caps on email addresses, passkeys, profile links, OAuth app scopes and recipients. Lowering one rejects new writes above it; rows already stored stay readable.',
  config: userProductLimitsConfig,
  access: { update_roles: ['moderator'] },
  fields: {
    email_addresses_max: {
      description: 'Maximum email addresses one user may verify and keep.',
      minValue: 1,
      maxValue: USER_EMAIL_ADDRESSES_MAX,
      integer: true,
    },
    passkeys_max: {
      description: 'Maximum passkeys one user may register.',
      minValue: 1,
      maxValue: USER_PASSKEYS_MAX,
      integer: true,
    },
    profile_links_max: {
      description: 'Maximum profile links one user may keep.',
      minValue: 1,
      maxValue: USER_PROFILE_LINKS_MAX,
      integer: true,
    },
    oauth_app_scopes_max: {
      description: 'Maximum scopes one OAuth app may request.',
      minValue: 1,
      maxValue: OAUTH_APP_SCOPES_MAX,
      integer: true,
    },
    message_recipients_max: {
      description: 'Maximum recipients one new message conversation may name.',
      minValue: 1,
      maxValue: MESSAGE_RECIPIENTS_MAX,
      integer: true,
    },
    follower_distribution_recipients_max: {
      description: 'Maximum selected followers one post or RSS feed item send may name.',
      minValue: 1,
      maxValue: FOLLOWER_DISTRIBUTION_RECIPIENTS_MAX,
      integer: true,
    },
  },
})
