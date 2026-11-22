import {
  runWithTransaction,
  registerPostCommitAction,
  type TransactionQuery,
} from '@data-stores/psql'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { providerTableConfigs, type OAuthProvider } from '@services/oauth-accounts'
import { assertUserHasSignInMethod } from '@services/oauth-accounts/sign-in-methods'
import { enqueueOnUserUpdated } from '@queues/entity-listeners/enqueues'
import { invalidateVerifiedEmailCache } from '@services/contribution-gating/email-verification'
import onError from '@modules/on-error'

export async function disconnectOAuthAccount(
  userId: string,
  provider: OAuthProvider,
  options: { query?: TransactionQuery } = {},
): Promise<void> {
  await runWithTransaction(options.query, async query => {
    await query(
      sql`/* disconnectOAuthAccount */ SELECT fn_lock_active_user_for_mutation(${userId}, TRUE)`,
    )

    await detachProviderAccount(userId, provider, query)
    await assertUserHasSignInMethod(userId, query)
    registerPostCommitAction(query, async () => {
      void enqueueOnUserUpdated(userId)
      try {
        await invalidateVerifiedEmailCache(userId)
      } catch (err) {
        onError(err instanceof Error ? err : new Error(String(err)))
      }
    })
  })
}

async function detachProviderAccount(
  userId: string,
  provider: OAuthProvider,
  query: TransactionQuery,
): Promise<void> {
  const config = providerTableConfigs[provider]
  const tokenColumns = config.hasTokenColumns
    ? `access_token_ciphertext = NULL, access_token_expires_at = NULL,
       ${config.hasRefreshToken ? 'refresh_token_ciphertext = NULL,' : ''}`
    : ''
  const { rowCount } = await query(
    `/* disconnectOAuthAccount */ UPDATE ${config.table}
     SET user_id = NULL, ${config.emailColumn} = NULL, ${config.dataColumn} = '{}'::jsonb,
       ${provider === 'x' ? '' : 'email_domain_hostname_id = NULL,'}
       ${tokenColumns}
       unlinked_at = CURRENT_TIMESTAMP
     WHERE user_id = $1`,
    [userId],
  )
  assert(rowCount === 1, 404, `No ${provider} account connected`)
  await query(
    sql`/* disconnectOAuthAccount */ UPDATE users SET use_display_name_from = 'username' WHERE id = ${userId} AND use_display_name_from = ${provider}`,
  )
}
