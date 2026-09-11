import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { getActiveNativeLinkUserState } from './native-user-state.mts'

const COMPLETION_TTL_MS = 10 * 60 * 1000

export async function resolveNativeBlueskyCallbackFailure(
  flowId: string,
  tokenHash: string,
  options: {
    afterAuthorizationLock?: () => Promise<void>
  } = {},
): Promise<'completed' | 'nonmatching' | 'rejected'> {
  await using query = await beginTransaction()
  const { rows } = await query<{
    user_id: string
    claimed_did: string | null
    handle: string | null
    status: string
    expires_at: Date
  }>(sql`/* resolveNativeBlueskyCallbackFailure:lock */
    SELECT user_id, claimed_did, handle, status, expires_at
    FROM bluesky_link_authorizations
    WHERE id = ${flowId} AND callback_mode = 'native'
    FOR UPDATE`)
  const authorization = rows[0]
  let result: 'completed' | 'nonmatching' | 'rejected' = 'rejected'
  if (authorization) {
    await options.afterAuthorizationLock?.()

    const completion = await query<{
      valid_present: boolean
      matching_present: boolean
      account_present: boolean
    }>(sql`/* resolveNativeBlueskyCallbackFailure:completion */
      SELECT
        EXISTS (
          SELECT 1 FROM bluesky_link_completions
          WHERE authorization_id = ${flowId}
            AND expires_at > CURRENT_TIMESTAMP
        ) AS valid_present,
        EXISTS (
          SELECT 1 FROM bluesky_link_completions
          WHERE authorization_id = ${flowId}
            AND token_hash = ${tokenHash}
            AND expires_at > CURRENT_TIMESTAMP
        ) AS matching_present,
        EXISTS (
          SELECT 1 FROM bluesky_linked_accounts
          WHERE bluesky_did = ${authorization.claimed_did}
            AND link_authorization_id = ${flowId}
            AND user_id IS NULL
        ) AS account_present`)
    const validWinner =
      authorization.expires_at > new Date() &&
      completion.rows[0]?.valid_present &&
      completion.rows[0].account_present
    if (authorization.status === 'handoff_ready' && validWinner) {
      result = completion.rows[0].matching_present ? 'completed' : 'nonmatching'
    } else if (
      authorization.status === 'callback_claimed' &&
      authorization.claimed_did &&
      authorization.handle &&
      authorization.expires_at > new Date() &&
      (await getActiveNativeLinkUserState(authorization.user_id, query)) === 'active'
    ) {
      const expiresAt = new Date(Date.now() + COMPLETION_TTL_MS)
      const { rowCount } = await query(sql`/* resolveNativeBlueskyCallbackFailure:persist */
        INSERT INTO bluesky_link_completions (
          authorization_id, user_id, bluesky_did, handle, token_hash, expires_at
        )
        SELECT ${flowId}, ${authorization.user_id}, ${authorization.claimed_did},
               ${authorization.handle}, ${tokenHash}, ${expiresAt}
        WHERE EXISTS (
          SELECT 1 FROM bluesky_linked_accounts account
          WHERE account.bluesky_did = ${authorization.claimed_did}
            AND account.link_authorization_id = ${flowId}
            AND account.user_id IS NULL
        )
        ON CONFLICT (authorization_id) DO UPDATE
        SET token_hash = EXCLUDED.token_hash
        WHERE bluesky_link_completions.token_hash = EXCLUDED.token_hash`)
      if (rowCount) {
        await query(sql`/* resolveNativeBlueskyCallbackFailure:handoffReady */
          UPDATE bluesky_link_authorizations
          SET status = 'handoff_ready'
          WHERE id = ${flowId} AND status = 'callback_claimed'`)
        result = 'completed'
      }
    }

    if (result === 'rejected') {
      await query(sql`/* resolveNativeBlueskyCallbackFailure:completionDelete */
        DELETE FROM bluesky_link_completions WHERE authorization_id = ${flowId}`)
      if (authorization.claimed_did) {
        await query(sql`/* resolveNativeBlueskyCallbackFailure:accountDelete */
          DELETE FROM bluesky_linked_accounts
          WHERE bluesky_did = ${authorization.claimed_did}
            AND link_authorization_id = ${flowId}
            AND user_id IS NULL`)
      }
      await query(sql`/* resolveNativeBlueskyCallbackFailure:reject */
        UPDATE bluesky_link_authorizations
        SET status = 'rejected', handle = NULL
        WHERE id = ${flowId}
          AND status IN ('pending', 'callback_claimed', 'handoff_ready')`)
    }
  }

  await query.commit()
  return result
}
