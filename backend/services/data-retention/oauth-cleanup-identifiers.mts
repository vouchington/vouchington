import { providerTableConfigs } from '@services/oauth/providers'
export const oauthProviderUserIdColumnByTable = new Map(
  Object.values(providerTableConfigs).map(config => [config.table, config.providerUserIdColumn]),
)
export const allowedOAuthCleanupIdentifiers = new Set([...oauthProviderUserIdColumnByTable].flat())
export const oauthAuthorizationProviderUserIdColumnByAccountTable = new Map([
  ['facebook_accounts', 'facebook_account_id'],
  ['github_accounts', 'github_account_id'],
  ['linkedin_accounts', 'linkedin_account_id'],
  ['x_accounts', 'x_account_id'],
  ['microsoft_accounts', 'microsoft_account_id'],
  ['google_accounts', 'google_account_id'],
])
export const oauthAccountIdColumnByTable = new Map([
  ['facebook_accounts', 'id'],
  ['github_accounts', 'id'],
  ['linkedin_accounts', 'id'],
  ['x_accounts', 'id'],
  ['microsoft_accounts', 'id'],
  ['google_accounts', 'id'],
])
export const allowedOAuthAccountIdIdentifiers = new Set([...allowedOAuthCleanupIdentifiers, 'id'])
