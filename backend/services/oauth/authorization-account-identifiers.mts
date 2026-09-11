import { assertWhitelistedSqlIdentifier } from '@data-stores/psql'
import { providerTableConfigs } from '@services/oauth-accounts'
import type { BrokerOAuthProvider } from './broker-config.mts'

const authorizationAccountIdentifiers = {
  facebook: {
    table: 'facebook_accounts',
    providerUserIdColumn: 'facebook_user_id',
    emailColumn: 'facebook_user_email_address',
    dataColumn: 'facebook_user_data',
  },
  x: {
    table: 'x_accounts',
    providerUserIdColumn: 'x_user_id',
    emailColumn: 'x_user_email_address',
    dataColumn: 'x_user_data',
  },
  github: {
    table: 'github_accounts',
    providerUserIdColumn: 'github_user_id',
    emailColumn: 'github_user_email_address',
    dataColumn: 'github_user_data',
  },
} as const satisfies Record<
  BrokerOAuthProvider,
  {
    table: string
    providerUserIdColumn: string
    emailColumn: string
    dataColumn: string
  }
>

export function getAuthorizationAccountIdentifiers(provider: BrokerOAuthProvider) {
  const config = providerTableConfigs[provider]
  const allowed = authorizationAccountIdentifiers[provider]
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
