import type { TransactionQuery } from '@data-stores/psql'
import type { OAuthAccount } from '@services/oauth-accounts/providers'
import { getAuthorizationAccountIdentifiers } from './authorization-account-identifiers.mts'
import type { CompletionRow } from './authorization-completion-types.mts'

export async function getAuthorizationAccount(
  authorization: CompletionRow,
  query: TransactionQuery,
): Promise<OAuthAccount> {
  const config = getAuthorizationAccountIdentifiers(authorization.provider)
  const accountId = authorization[config.authorizationAccountColumn as keyof CompletionRow]
  if (typeof accountId !== 'string') {
    throw new Error('Completed OAuth exchange has no provider account')
  }
  const { rows } = await query(
    `/* getAuthorizationAccount */ SELECT
       user_id,
       ${config.providerUserIdColumn} AS provider_user_id,
       ${config.emailColumn} AS provider_user_email_address,
       ${config.dataColumn} AS provider_user_data
     FROM ${config.table}
     WHERE ${config.accountIdColumn} = $1`,
    [accountId],
  )
  const account = rows[0] as OAuthAccount | undefined
  if (!account) throw new Error('Completed OAuth provider account is missing')
  return account
}
