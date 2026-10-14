import { assertWhitelistedSqlIdentifier } from '@data-stores/psql/sql-fragments'
import { providerTableConfigs } from '@services/oauth-accounts/providers'
import type { BrokerOAuthProvider } from './broker-config.mts'

const authorizationAccountIdentifiers = {
  facebook: {
    table: 'facebook_accounts',
    providerUserIdColumn: 'facebook_user_id',
    authorizationAccountColumn: 'facebook_user_id',
    emailColumn: 'facebook_user_email_address',
    dataColumn: 'facebook_user_data',
  },
  x: {
    table: 'x_accounts',
    providerUserIdColumn: 'x_user_id',
    authorizationAccountColumn: 'x_user_id',
    emailColumn: 'x_user_email_address',
    dataColumn: 'x_user_data',
  },
  github: {
    table: 'github_accounts',
    providerUserIdColumn: 'github_user_id',
    authorizationAccountColumn: 'github_user_id',
    emailColumn: 'github_user_email_address',
    dataColumn: 'github_user_data',
  },
  linkedin: {
    table: 'linkedin_accounts',
    providerUserIdColumn: 'linkedin_user_id',
    accountIdColumn: 'id',
    authorizationAccountColumn: 'linkedin_account_id',
    emailColumn: 'linkedin_user_email_address',
    dataColumn: 'linkedin_user_data',
  },
  microsoft: {
    table: 'microsoft_accounts',
    providerUserIdColumn: 'microsoft_user_id',
    accountIdColumn: 'id',
    authorizationAccountColumn: 'microsoft_account_id',
    emailColumn: 'microsoft_user_email_address',
    dataColumn: 'microsoft_user_data',
  },
} as const satisfies Record<
  BrokerOAuthProvider,
  {
    table: string
    providerUserIdColumn: string
    accountIdColumn?: string
    authorizationAccountColumn: string
    emailColumn: string
    dataColumn: string
  }
>

export function getAuthorizationAccountIdentifiers(provider: BrokerOAuthProvider) {
  const config = providerTableConfigs[provider]
  const allowed = authorizationAccountIdentifiers[provider]
  const accountIdColumn = 'accountIdColumn' in allowed ? allowed.accountIdColumn : undefined
  return {
    table: assertWhitelistedSqlIdentifier(
      config.table,
      [allowed.table],
      'OAuth authorization account table',
    ),
    providerUserIdColumn: assertWhitelistedSqlIdentifier(
      config.providerUserIdColumn,
      [allowed.providerUserIdColumn],
      'OAuth authorization account user ID column',
    ),
    accountIdColumn: assertWhitelistedSqlIdentifier(
      accountIdColumn ?? config.providerUserIdColumn,
      [accountIdColumn ?? config.providerUserIdColumn],
      'OAuth authorization account lookup column',
    ),
    authorizationAccountColumn: assertWhitelistedSqlIdentifier(
      allowed.authorizationAccountColumn,
      [allowed.authorizationAccountColumn],
      'OAuth authorization account reference column',
    ),
    emailColumn: assertWhitelistedSqlIdentifier(
      config.emailColumn,
      [allowed.emailColumn],
      'OAuth authorization account email column',
    ),
    dataColumn: assertWhitelistedSqlIdentifier(
      config.dataColumn,
      [allowed.dataColumn],
      'OAuth authorization account data column',
    ),
  }
}
