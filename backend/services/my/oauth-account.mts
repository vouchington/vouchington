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

    const { rows } = await query(
      `/* disconnectOAuthAccount */ SELECT ${config.providerUserIdColumn} FROM ${config.table} WHERE user_id = $1 FOR UPDATE`,
      [userId],
    )
    assert(rows.length > 0, 404, `No ${provider} account connected`)

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
  await query(
    sql`/* disconnectOAuthAccount */ UPDATE users SET use_display_name_from = 'username' WHERE id = ${userId} AND use_display_name_from = ${provider}`,
  )
  await query(
    `/* disconnectOAuthAccount */ UPDATE ${config.table} SET user_id = NULL WHERE user_id = $1`,
    [userId],
  )
}
