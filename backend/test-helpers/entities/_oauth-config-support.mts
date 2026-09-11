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
  provider_user_id: string
  provider_user_email_address: string | null
  provider_user_data: Record<string, unknown>
}

type OAuthTableConfig = {
  table: string
  userIdColumn: string
  providerUserIdColumn: string
  emailColumn: string
  dataColumn: string
  hasTokenColumns: boolean
  hasRefreshToken: boolean
}

export const providerTableConfigs: Record<OAuthProvider, OAuthTableConfig> = {
  facebook: {
    table: 'facebook_accounts',
    userIdColumn: 'user_id',
    providerUserIdColumn: 'facebook_user_id',
    emailColumn: 'facebook_user_email_address',
    dataColumn: 'facebook_user_data',
    hasTokenColumns: true,
    hasRefreshToken: false,
  },
  apple: {
    table: 'apple_accounts',
    userIdColumn: 'user_id',
    providerUserIdColumn: 'apple_user_id',
    emailColumn: 'apple_user_email_address',
    dataColumn: 'apple_user_data',
    hasTokenColumns: false,
    hasRefreshToken: false,
  },
  google: {
    table: 'google_accounts',
    userIdColumn: 'user_id',
    providerUserIdColumn: 'google_user_id',
    emailColumn: 'google_user_email_address',
    dataColumn: 'google_user_data',
    hasTokenColumns: false,
    hasRefreshToken: false,
  },
  x: {
    table: 'x_accounts',
    userIdColumn: 'user_id',
    providerUserIdColumn: 'x_user_id',
    emailColumn: 'x_user_email_address',
    dataColumn: 'x_user_data',
    hasTokenColumns: true,
    hasRefreshToken: true,
  },
  linkedin: {
    table: 'linkedin_accounts',
    userIdColumn: 'user_id',
    providerUserIdColumn: 'linkedin_user_id',
    emailColumn: 'linkedin_user_email_address',
    dataColumn: 'linkedin_user_data',
    hasTokenColumns: true,
    hasRefreshToken: true,
  },
  microsoft: {
    table: 'microsoft_accounts',
    userIdColumn: 'user_id',
    providerUserIdColumn: 'microsoft_user_id',
    emailColumn: 'microsoft_user_email_address',
    dataColumn: 'microsoft_user_data',
    hasTokenColumns: true,
    hasRefreshToken: true,
  },
  github: {
    table: 'github_accounts',
    userIdColumn: 'user_id',
    providerUserIdColumn: 'github_user_id',
    emailColumn: 'github_user_email_address',
    dataColumn: 'github_user_data',
    hasTokenColumns: true,
    hasRefreshToken: true,
  },
}

export function getOAuthTokenPurpose(
  provider: OAuthProvider,
  providerUserId: string,
  column: 'access_token' | 'refresh_token',
): string {
  return `oauth:${provider}:${providerUserId}:${column}`
}
