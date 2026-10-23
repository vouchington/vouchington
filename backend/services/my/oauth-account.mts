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
  const config = providerTableConfigs[provider]

  await runWithTransaction(options.query, async query => {
    await query(
      sql`/* disconnectOAuthAccount */ SELECT fn_lock_active_user_for_mutation(${userId})`,
    )

    const { rows } = await query<{ id: string }>(
      `/* disconnectOAuthAccount */ SELECT id FROM ${config.table} WHERE user_id = $1 FOR UPDATE`,
      [userId],
    )
    assert(rows.length > 0, 404, `No ${provider} account connected`)

    await detachProviderAccount(userId, provider, rows[0]!.id, query)
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
  accountId: string,
  query: TransactionQuery,
): Promise<void> {
  const config = providerTableConfigs[provider]
  await query(
    sql`/* disconnectOAuthAccount */ UPDATE users SET use_display_name_from = 'username' WHERE id = ${userId} AND use_display_name_from = ${provider}`,
  )
  if (provider === 'facebook' || provider === 'github' || provider === 'x') {
    const friendTable = `${provider}_friends`
    await query(
      `/* disconnectOAuthAccount:friends */ DELETE FROM ${friendTable}
       WHERE ${provider}_account_id = $1 OR friend_${provider}_account_id = $1`,
      [accountId],
    )
  }
  const tokenColumns = config.hasTokenColumns
    ? `access_token_ciphertext = NULL, access_token_expires_at = NULL,
       ${config.hasRefreshToken ? 'refresh_token_ciphertext = NULL,' : ''}`
    : ''
  await query(
    `/* disconnectOAuthAccount */ UPDATE ${config.table}
     SET user_id = NULL, ${config.emailColumn} = NULL, ${config.dataColumn} = '{}'::jsonb,
       ${provider === 'x' ? '' : 'email_domain_hostname_id = NULL,'}
       ${tokenColumns}
       ${provider === 'facebook' || provider === 'github' || provider === 'x' ? 'friends_synced_at = NULL,' : ''}
       unlinked_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND user_id = $2`,
    [accountId, userId],
  )
}
