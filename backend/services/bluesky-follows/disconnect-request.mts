import { createAsyncGeneratorFromCursor, read, write } from '@data-stores/psql'
import createHttpError from 'http-errors'
import sql from 'sql-template-strings'
import { enqueueOnUserUpdated } from '@queues/entity-listeners/enqueues'

const BACKFILL_BATCH_SIZE = 500

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
  void enqueueOnUserUpdated(userId)
  return request
}

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

export async function* streamPendingBlueskyDisconnectBatches(
  batchSize = BACKFILL_BATCH_SIZE,
): AsyncGenerator<BlueskyDisconnectRequest[], void, unknown> {
  let batch: BlueskyDisconnectRequest[] = []
  for await (const row of createAsyncGeneratorFromCursor<{
    user_id: string
    bluesky_did: string
    link_authorization_id: string
  }>(
    sql`/* streamPendingBlueskyDisconnectBatches */
      SELECT account.user_id, account.bluesky_did, account.link_authorization_id
      FROM bluesky_linked_accounts account
      JOIN bluesky_link_authorizations link_auth
        ON link_auth.id = account.link_authorization_id
       AND link_auth.user_id = account.user_id
       AND link_auth.status = 'attached'
      WHERE account.disconnect_requested_at IS NOT NULL
      ORDER BY account.disconnect_requested_at, account.link_authorization_id`,
    { batchSize },
  )) {
    batch.push({
      userId: row.user_id,
      blueskyDid: row.bluesky_did,
      linkAuthorizationId: row.link_authorization_id,
    })
    if (batch.length >= batchSize) {
      yield batch
      batch = []
    }
  }
  if (batch.length > 0) yield batch
}
