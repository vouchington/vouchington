import { beginTransaction } from '@data-stores/psql'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { providerTableConfigs, type OAuthProvider } from '@services/oauth'
import { hasOtherAuthMethods } from './has-other-auth-methods.mts'
import { enqueueOnUserUpdated } from '@queues/entity-listeners/enqueues'
import { invalidateVerifiedEmailCache } from '@services/contribution-gating/email-verification'
import onError from '@modules/on-error'

export async function disconnectOAuthAccount(
  userId: string,
  provider: OAuthProvider,
): Promise<void> {
  const config = providerTableConfigs[provider]

  await using query = await beginTransaction()
  await query('/* disconnectOAuthAccount */ SELECT fn_lock_active_user_for_mutation($1::uuid)', [
    userId,
  ])
  await query(sql`/* disconnectOAuthAccount */ SELECT 1 FROM users WHERE id = ${userId} FOR UPDATE`)

  const { rows } = await query<{ id: string }>(
    `/* disconnectOAuthAccount */ SELECT id FROM ${config.table} WHERE user_id = $1 FOR UPDATE`,
    [userId],
  )
  assert(rows.length > 0, 404, `No ${provider} account connected`)

  const otherAuth = await hasOtherAuthMethods({ query }, userId, provider)
  assert(otherAuth, 400, 'Cannot remove your last authentication method')

  await query(
    sql`/* disconnectOAuthAccount */ UPDATE users SET use_display_name_from = 'username' WHERE id = ${userId} AND use_display_name_from = ${provider}`,
  )
  const accountId = rows[0]!.id
  const tokenColumns = config.hasTokenColumns
    ? `access_token_ciphertext = NULL, access_token_expires_at = NULL,
       ${config.hasRefreshToken ? 'refresh_token_ciphertext = NULL,' : ''}`
    : ''
  await query(
    `/* disconnectOAuthAccount */ UPDATE ${config.table}
     SET user_id = NULL, ${config.emailColumn} = NULL, ${config.dataColumn} = '{}'::jsonb,
       ${provider === 'x' ? '' : 'email_domain_hostname_id = NULL,'}
       ${tokenColumns}
       unlinked_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND user_id = $2`,
    [accountId, userId],
  )
  await query.commit()

  void enqueueOnUserUpdated(userId)
  try {
    await invalidateVerifiedEmailCache(userId)
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)))
  }
}
