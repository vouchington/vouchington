import { getBlueskyFollowsWorkLimit } from './work-limits.mts'
import { read, write } from '@data-stores/psql'
import createHttpError from 'http-errors'
import sql from 'sql-template-strings'
import { enqueueOnUserUpdatedBestEffort } from '@queues/entity-listeners/enqueues'

export type BlueskyDisconnectRequest = {
  userId: string
  blueskyDid: string
  linkAuthorizationId: string
}

export async function requestBlueskyDisconnect(userId: string): Promise<BlueskyDisconnectRequest> {
  const { rows } = await write<{
    user_id: string
    bluesky_did: string
    link_authorization_id: string
  }>(sql`/* requestBlueskyDisconnect */
    UPDATE bluesky_linked_accounts account
    SET disconnect_requested_at = COALESCE(account.disconnect_requested_at, CURRENT_TIMESTAMP)
    FROM bluesky_link_authorizations link_auth
    WHERE account.user_id = ${userId}
      AND link_auth.id = account.link_authorization_id
      AND link_auth.user_id = account.user_id
      AND link_auth.status = 'attached'
    RETURNING account.user_id, account.bluesky_did, account.link_authorization_id`)
  const row = rows[0]
  if (!row) throw createHttpError(404, 'No Bluesky account linked')
  const request = {
    userId: row.user_id,
    blueskyDid: row.bluesky_did,
    linkAuthorizationId: row.link_authorization_id,
  }
  await enqueueOnUserUpdatedBestEffort(userId)
  return request
}

/**
 * @public Retained provisionally under issue #1360; external production use is unconfirmed and this
 * export may be made private or removed after intended-use review. Evidence: `docs/overview/architecture/services/README.md`.
 */
export async function hasPendingBlueskyDisconnect(
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

export type BlueskyDisconnectRequestPage = {
  requests: BlueskyDisconnectRequest[]
  hasMore: boolean
}

// Sorts before every UUID, so the first page needs no separate "no cursor" predicate.
const START_OF_IDS = '00000000-0000-0000-0000-000000000000'

/**
 * One page of pending disconnect requests whose link authorization id is after `afterId`, in
 * authorization id order (unique per linked account). `hasMore` is true when the page is full, so
 * the caller continues from the last request's authorization id.
 */
export async function listPendingBlueskyDisconnectPage(
  afterId?: string,
): Promise<BlueskyDisconnectRequestPage> {
  const limit = getBlueskyFollowsWorkLimit('backfill_batch_size')
  const { rows } = await read<{
    user_id: string
    bluesky_did: string
    link_authorization_id: string
  }>(sql`/* listPendingBlueskyDisconnectPage */
      SELECT account.user_id, account.bluesky_did, account.link_authorization_id
      FROM bluesky_linked_accounts account
      JOIN bluesky_link_authorizations link_auth
        ON link_auth.id = account.link_authorization_id
       AND link_auth.user_id = account.user_id
       AND link_auth.status = 'attached'
      WHERE account.disconnect_requested_at IS NOT NULL
        AND account.link_authorization_id > ${afterId ?? START_OF_IDS}::uuid
      ORDER BY account.link_authorization_id
      LIMIT ${limit}`)
  return {
    requests: rows.map(row => ({
      userId: row.user_id,
      blueskyDid: row.bluesky_did,
      linkAuthorizationId: row.link_authorization_id,
    })),
    hasMore: rows.length === limit,
  }
}
