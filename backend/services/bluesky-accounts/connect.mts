import { read, beginTransaction, write, type QueryOptions } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { enqueueOnUserUpdatedBestEffort } from '@queues/entity-listeners/enqueues'
import { connectBlueskyAccountInLockedTransaction } from './connect-locked.mts'
import { lockAuthorization } from './session-generation.mts'

export interface BlueskyLinkedAccount {
  bluesky_did: string
  handle: string | null
  link_authorization_id: string
  created_at: Date
  updated_at: Date
  disconnect_requested_at: Date | null
}

// Links a Bluesky DID to a Voucha user. The row must already exist — created by the OAuth
// callback's SessionStore.set() (session-store.mts) before this ever runs — so this only ever
// attaches user_id/handle to it, mirroring @services/oauth-accounts's connectOAuthAccountToUser
// 409-if-linked-elsewhere shape, plus the reverse-direction guard above (one Bluesky account per
// Voucha user).
export async function connectBlueskyAccountToUser(
  userId: string,
  did: string,
  handle: string,
  options: { linkAuthorizationId: string },
): Promise<void> {
  await using transactionQuery = await beginTransaction()
  await connectBlueskyAccountInTransaction(
    userId,
    did,
    handle,
    options.linkAuthorizationId,
    transactionQuery,
  )
  await transactionQuery.commit()
  await enqueueOnUserUpdatedBestEffort(userId)
}

async function connectBlueskyAccountInTransaction(
  userId: string,
  did: string,
  handle: string,
  linkAuthorizationId: string,
  query: TransactionQuery,
): Promise<void> {
  await lockBlueskyLinkOwner(userId, did, query)
  await lockAuthorization(linkAuthorizationId, userId, query)
  return connectBlueskyAccountInLockedTransaction(userId, did, handle, linkAuthorizationId, query)
}

async function lockBlueskyLinkOwner(
  userId: string,
  did: string,
  query: TransactionQuery,
): Promise<void> {
  await query(sql`/* connectBlueskyAccountToUser:lockUser */
    SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 0))`)
  await query(sql`/* connectBlueskyAccountToUser:lockDid */
    SELECT pg_advisory_xact_lock(hashtextextended(${did}, 1))`)
}

export async function getBlueskyLinkedAccountForUser(
  userId: string,
  options: QueryOptions = {},
  includeDisconnectRequested = false,
): Promise<BlueskyLinkedAccount | null> {
  const { rows } = await read(
    sql`/* getBlueskyLinkedAccountForUser */
      SELECT account.bluesky_did, account.handle, account.link_authorization_id,
             account.created_at, account.updated_at, account.disconnect_requested_at
      FROM bluesky_linked_accounts account
      JOIN bluesky_link_authorizations link_auth
        ON link_auth.id = account.link_authorization_id
       AND link_auth.user_id = account.user_id
       AND link_auth.status = 'attached'
      JOIN users ON users.id = account.user_id AND users.deleted_at IS NULL
      WHERE account.user_id = ${userId}
        AND (${includeDisconnectRequested} OR account.disconnect_requested_at IS NULL)
        AND NOT EXISTS (
          SELECT 1 FROM user_suspensions
          WHERE user_id = users.id AND lifted_at IS NULL
        )`,
    options,
  )
  return (rows[0] as BlueskyLinkedAccount | undefined) ?? null
}

export async function getExactBlueskyAccountForDisconnect(
  userId: string,
  generation: { blueskyDid: string; linkAuthorizationId: string },
  options: QueryOptions = {},
): Promise<BlueskyLinkedAccount | null> {
  const { rows } = await write<BlueskyLinkedAccount>(
    sql`/* getExactBlueskyAccountForDisconnect */
      SELECT account.bluesky_did, account.handle, account.link_authorization_id,
             account.created_at, account.updated_at, account.disconnect_requested_at
      FROM bluesky_linked_accounts account
      JOIN bluesky_link_authorizations link_auth
        ON link_auth.id = account.link_authorization_id
       AND link_auth.user_id = account.user_id
       AND link_auth.status = 'attached'
      WHERE account.user_id = ${userId}
        AND account.bluesky_did = ${generation.blueskyDid}
        AND account.link_authorization_id = ${generation.linkAuthorizationId}
        AND account.disconnect_requested_at IS NOT NULL`,
    options,
  )
  return rows[0] ?? null
}
