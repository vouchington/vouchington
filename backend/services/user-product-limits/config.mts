import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

/**
 * Hard maxes of the per-user product caps. Stored rows are read back with these bounds and the
 * static request schemas admit up to them, so lowering a configured cap never hides stored rows.
 */
export const USER_EMAIL_ADDRESSES_MAX = 25
export const USER_PASSKEYS_MAX = 25
export const USER_PROFILE_LINKS_MAX = 50
export const OAUTH_APP_SCOPES_MAX = 64
export const MESSAGE_RECIPIENTS_MAX = 100
export const FOLLOWER_DISTRIBUTION_RECIPIENTS_MAX = 500

export const userProductLimitsConfig = new DynamicConfig({
  key: 'user-product-limits-config',
  fieldTypes: {
    email_addresses_max: 'number',
    passkeys_max: 'number',
    profile_links_max: 'number',
    oauth_app_scopes_max: 'number',
    message_recipients_max: 'number',
    follower_distribution_recipients_max: 'number',
  },
  defaultFields: {
    email_addresses_max: 10,
    passkeys_max: 10,
    profile_links_max: 20,
    oauth_app_scopes_max: 32,
    message_recipients_max: 25,
    follower_distribution_recipients_max: 100,
  },
})

/** Verified email addresses one user may hold. */
export function getUserEmailAddressesMax(): number {
  return getBoundedPositiveIntegerField(userProductLimitsConfig, 'email_addresses_max', {
    defaultValue: 10,
    maxValue: USER_EMAIL_ADDRESSES_MAX,
  })
}

/** Passkeys one user may register. */
export function getUserPasskeysMax(): number {
  return getBoundedPositiveIntegerField(userProductLimitsConfig, 'passkeys_max', {
    defaultValue: 10,
    maxValue: USER_PASSKEYS_MAX,
  })
}

/** Profile links one user may keep. */
export function getUserProfileLinksMax(): number {
  return getBoundedPositiveIntegerField(userProductLimitsConfig, 'profile_links_max', {
    defaultValue: 20,
    maxValue: USER_PROFILE_LINKS_MAX,
  })
}

/** Scopes one OAuth app may request. */
export function getOAuthAppScopesMax(): number {
  return getBoundedPositiveIntegerField(userProductLimitsConfig, 'oauth_app_scopes_max', {
    defaultValue: 32,
    maxValue: OAUTH_APP_SCOPES_MAX,
  })
}

/** Recipients one new conversation may name. */
export function getMessageRecipientsMax(): number {
  return getBoundedPositiveIntegerField(userProductLimitsConfig, 'message_recipients_max', {
    defaultValue: 25,
    maxValue: MESSAGE_RECIPIENTS_MAX,
  })
}

/** Selected followers one post or feed-item send may name. */
export function getFollowerDistributionRecipientsMax(): number {
  return getBoundedPositiveIntegerField(
    userProductLimitsConfig,
    'follower_distribution_recipients_max',
    { defaultValue: 100, maxValue: FOLLOWER_DISTRIBUTION_RECIPIENTS_MAX },
  )
}
