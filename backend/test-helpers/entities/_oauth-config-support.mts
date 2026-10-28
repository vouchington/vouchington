// Internal support module (leading underscore = not part of the public barrel).
// Duplicates the oauth-accounts domain's provider table config and token-purpose helper so
// test-helpers does not depend on that service package, which would otherwise create a workspace
// dependency cycle (every backend service devDeps test-helpers for its tests). Both duplicated
// items are pure data/logic with zero imports in their source of truth — a plain config object and
// a string-template function — so the duplication cannot drift into a data-store/service dependency.

export type OAuthProvider =
  | 'facebook'
  | 'apple'
  | 'google'
  | 'x'
  | 'linkedin'
  | 'microsoft'
  | 'github'

export type OAuthAccount = {
  user_id: string | null
  account_id?: string
  provider_user_id: string
  provider_user_email_address: string | null
  provider_user_data: Record<string, unknown>
}

type OAuthTableConfig = Readonly<{
  table: string
  userIdColumn: string
  providerUserIdColumn: string
  emailColumn: string
  dataColumn: string
  hasTokenColumns: boolean
  hasRefreshToken: boolean
  accountIdColumn?: string
}>

const providerTableConfigs = Object.freeze({
  facebook: Object.freeze({
    table: 'facebook_accounts',
    userIdColumn: 'user_id',
    providerUserIdColumn: 'facebook_user_id',
    emailColumn: 'facebook_user_email_address',
    dataColumn: 'facebook_user_data',
    hasTokenColumns: true,
    hasRefreshToken: false,
    accountIdColumn: 'id',
  }),
  apple: Object.freeze({
    table: 'apple_accounts',
    userIdColumn: 'user_id',
    providerUserIdColumn: 'apple_user_id',
    emailColumn: 'apple_user_email_address',
    dataColumn: 'apple_user_data',
    hasTokenColumns: false,
    hasRefreshToken: false,
    accountIdColumn: 'id',
  }),
  google: Object.freeze({
    table: 'google_accounts',
    userIdColumn: 'user_id',
    providerUserIdColumn: 'google_user_id',
    emailColumn: 'google_user_email_address',
    dataColumn: 'google_user_data',
    hasTokenColumns: false,
    hasRefreshToken: false,
    accountIdColumn: 'id',
  }),
  x: Object.freeze({
    table: 'x_accounts',
    userIdColumn: 'user_id',
    providerUserIdColumn: 'x_user_id',
    emailColumn: 'x_user_email_address',
    dataColumn: 'x_user_data',
    hasTokenColumns: true,
    hasRefreshToken: true,
    accountIdColumn: 'id',
  }),
  linkedin: Object.freeze({
    table: 'linkedin_accounts',
    userIdColumn: 'user_id',
    providerUserIdColumn: 'linkedin_user_id',
    emailColumn: 'linkedin_user_email_address',
    dataColumn: 'linkedin_user_data',
    hasTokenColumns: true,
    hasRefreshToken: true,
  }),
  microsoft: Object.freeze({
    table: 'microsoft_accounts',
    userIdColumn: 'user_id',
    providerUserIdColumn: 'microsoft_user_id',
    emailColumn: 'microsoft_user_email_address',
    dataColumn: 'microsoft_user_data',
    hasTokenColumns: true,
    hasRefreshToken: true,
    accountIdColumn: 'id',
  }),
  github: Object.freeze({
    table: 'github_accounts',
    userIdColumn: 'user_id',
    providerUserIdColumn: 'github_user_id',
    emailColumn: 'github_user_email_address',
    dataColumn: 'github_user_data',
    hasTokenColumns: true,
    hasRefreshToken: true,
    accountIdColumn: 'id',
  }),
} satisfies Record<OAuthProvider, OAuthTableConfig>)

export function getOAuthTableConfig(provider: OAuthProvider): OAuthTableConfig {
  if (typeof provider !== 'string' || !Object.hasOwn(providerTableConfigs, provider)) {
    throw new Error('Invalid OAuth provider')
  }
  return providerTableConfigs[provider]
}

export function getOAuthTokenPurpose(
  provider: OAuthProvider,
  providerUserId: string,
  column: 'access_token' | 'refresh_token',
): string {
  return `oauth:${provider}:${providerUserId}:${column}`
}
