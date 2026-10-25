import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { BlueskyDisconnectRequest } from '../services/bluesky-follows/disconnect-request.mts'

export async function hasTestPendingBlueskyDisconnect(
  request: BlueskyDisconnectRequest,
): Promise<boolean> {
  const { rows } = await read<{ present: boolean }>(sql`/* hasPendingBlueskyDisconnect */
    SELECT EXISTS (
      SELECT 1
      FROM bluesky_linked_accounts account
      JOIN bluesky_link_authorizations link_auth
        ON link_auth.id = account.link_authorization_id
       AND link_auth.user_id = account.user_id
       AND link_auth.status = 'attached'
      WHERE account.user_id = ${request.userId}
        AND account.bluesky_did = ${request.blueskyDid}
        AND account.link_authorization_id = ${request.linkAuthorizationId}
        AND account.disconnect_requested_at IS NOT NULL
    ) AS present`)
  return rows[0]?.present ?? false
}
