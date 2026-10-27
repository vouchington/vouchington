import { beginBoundedTransaction } from '@data-stores/psql'
import createHttpError from 'http-errors'
import { completeOAuthAuthorizationExchange } from './authorization-exchange-completion.mts'
import { providerTableConfigs, type OAuthAccount, type OAuthProvider } from './providers.mts'
import type { OAuthAccountUpsertOptions, OAuthProviderReAuthContext } from './reauthentication.mts'

/** A fresh linked-provider proof persists its flow result without upserting account data or tokens. */
export async function completeProviderReAuthExchange(
  provider: OAuthProvider,
  providerUserId: string,
  options: OAuthAccountUpsertOptions & { reAuth: OAuthProviderReAuthContext },
): Promise<OAuthAccount> {
  const context = options.reAuth
  if (context.provider !== provider || context.providerUserId !== providerUserId) {
    throw createHttpError(403, 'Provider account does not match the linked account')
  }
  if (options.authorizationId !== context.flowId || !options.authorizationClaimId) {
    throw new Error('Provider reauthentication requires its own claimed authorization')
  }
  await using query = await beginBoundedTransaction({
    connectionTimeoutMs: 10_000,
    statementTimeoutMs: 2_000,
  })
  const config = providerTableConfigs[provider]
  const { rows } = await query<OAuthAccount>(
    `/* completeProviderReAuthExchange */ SELECT
       ${config.accountIdColumn ? `account.${config.accountIdColumn} AS account_id,` : ''}
       account.user_id, account.${config.providerUserIdColumn} AS provider_user_id,
       account.${config.emailColumn} AS provider_user_email_address,
       account.${config.dataColumn} AS provider_user_data
     FROM ${config.table} account INNER JOIN users ON users.id = account.user_id
     WHERE account.${config.providerUserIdColumn} = $1 AND account.user_id = $2 AND users.deleted_at IS NULL`,
    [providerUserId, context.userId],
  )
  const account = rows[0]
  if (!account)
    throw createHttpError(403, 'Linked provider account changed during reauthentication')
  // This stage never grants a proof. Completion rechecks live ownership under user/provider locks.
  await completeOAuthAuthorizationExchange(
    provider,
    context.flowId,
    options.authorizationClaimId,
    account.account_id ?? account.provider_user_id,
    query,
  )
  await query.commit()
  return account
}
