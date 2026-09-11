import createHttpError from 'http-errors'

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
  dataConflictStrategy: 'merge' | 'replace'
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
    dataConflictStrategy: 'replace',
    hasTokenColumns: true,
    hasRefreshToken: false,
  },
  apple: {
    table: 'apple_accounts',
    userIdColumn: 'user_id',
    providerUserIdColumn: 'apple_user_id',
    emailColumn: 'apple_user_email_address',
    dataColumn: 'apple_user_data',
    dataConflictStrategy: 'merge',
    hasTokenColumns: false,
    hasRefreshToken: false,
  },
  google: {
    table: 'google_accounts',
    userIdColumn: 'user_id',
    providerUserIdColumn: 'google_user_id',
    emailColumn: 'google_user_email_address',
    dataColumn: 'google_user_data',
    dataConflictStrategy: 'replace',
    hasTokenColumns: false,
    hasRefreshToken: false,
  },
  x: {
    table: 'x_accounts',
    userIdColumn: 'user_id',
    providerUserIdColumn: 'x_user_id',
    emailColumn: 'x_user_email_address',
    dataColumn: 'x_user_data',
    dataConflictStrategy: 'replace',
    hasTokenColumns: true,
    hasRefreshToken: true,
  },
  linkedin: {
    table: 'linkedin_accounts',
    userIdColumn: 'user_id',
    providerUserIdColumn: 'linkedin_user_id',
    emailColumn: 'linkedin_user_email_address',
    dataColumn: 'linkedin_user_data',
    dataConflictStrategy: 'replace',
    hasTokenColumns: true,
    hasRefreshToken: true,
  },
  microsoft: {
    table: 'microsoft_accounts',
    userIdColumn: 'user_id',
    providerUserIdColumn: 'microsoft_user_id',
    emailColumn: 'microsoft_user_email_address',
    dataColumn: 'microsoft_user_data',
    dataConflictStrategy: 'replace',
    hasTokenColumns: true,
    hasRefreshToken: true,
  },
  github: {
    table: 'github_accounts',
    userIdColumn: 'user_id',
    providerUserIdColumn: 'github_user_id',
    emailColumn: 'github_user_email_address',
    dataColumn: 'github_user_data',
    dataConflictStrategy: 'replace',
    hasTokenColumns: true,
    hasRefreshToken: true,
  },
}

export const oauthProviders = Object.keys(providerTableConfigs) as OAuthProvider[]

const validProviders = new Set(oauthProviders)

export function assertValidProvider(provider: string): OAuthProvider {
  if (!validProviders.has(provider as OAuthProvider)) {
    throw createHttpError(400, `Invalid OAuth provider: ${provider}`)
  }
  return provider as OAuthProvider
}
