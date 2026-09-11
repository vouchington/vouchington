import { read, beginTransaction, write, type QueryOptions } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import createHttpError from 'http-errors'
import { enqueueOnUserUpdated } from '@queues/entity-listeners/enqueues'
import { throwBlueskySessionPersistenceError } from './session-persistence-error.mts'
import { lockAuthorization } from './session-generation.mts'

export interface BlueskyLinkedAccount {
  bluesky_did: string
  handle: string | null
  link_authorization_id: string
  created_at: Date
  updated_at: Date
  disconnect_requested_at: Date | null
}

type PostgresError = { code?: string; constraint?: string }

// idx_bluesky_linked_accounts__user_id enforces one Bluesky link per Voucha user; a concurrent
// second link attempt for a different DID surfaces here as a unique-violation, not as the
// row-not-updated branch below (that branch only covers the DID side of the relationship).
function isUserAlreadyLinkedViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const pgError = error as PostgresError
  return pgError.code === '23505' && pgError.constraint === 'idx_bluesky_linked_accounts__user_id'
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
  options: Omit<QueryOptions, 'query'> & {
    query?: TransactionQuery
    linkAuthorizationId: string
    enqueueUserUpdate?: boolean
  },
): Promise<void> {
  const { enqueueUserUpdate = true, linkAuthorizationId, query } = options
  try {
    if (query) {
      await connectBlueskyAccountInTransaction(userId, did, handle, linkAuthorizationId, query)
    } else {
      await using transactionQuery = await beginTransaction()
      await connectBlueskyAccountInTransaction(
        userId,
        did,
        handle,
        linkAuthorizationId,
        transactionQuery,
      )
      await transactionQuery.commit()
    }
  } catch (err) {
    if (isUserAlreadyLinkedViolation(err)) {
      throw createHttpError(409, 'You already have a Bluesky account linked — unlink it first')
    }
    throw err
  }
  if (enqueueUserUpdate) void enqueueOnUserUpdated(userId)
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
  const connectQuery = sql`/* connectBlueskyAccountToUser */
        UPDATE bluesky_linked_accounts
        SET user_id = ${userId},
            handle = ${handle}
        WHERE bluesky_did = ${did}
          AND link_authorization_id = ${linkAuthorizationId}
          AND (user_id IS NULL OR user_id = ${userId})
          AND EXISTS (
            SELECT 1 FROM bluesky_link_authorizations link_auth
            WHERE link_auth.id = ${linkAuthorizationId}
              AND link_auth.user_id = ${userId}
              AND link_auth.claimed_did = ${did}
              AND link_auth.status IN ('callback_claimed', 'handoff_ready', 'attached')
          )
          AND EXISTS (
            SELECT 1 FROM users
            WHERE id = ${userId}
              AND deleted_at IS NULL
              AND NOT EXISTS (
                SELECT 1 FROM user_suspensions
                WHERE user_id = users.id AND lifted_at IS NULL
              )
          )
          RETURNING bluesky_did`
  const { rows, rowCount } = await write(connectQuery, { query })
  if (!rowCount || !rows[0]) {
    const existing = await read<{
      user_id: string | null
      link_authorization_id: string
    }>(
      sql`/* connectBlueskyAccountToUser:diagnose */
          SELECT user_id, link_authorization_id
          FROM bluesky_linked_accounts
          WHERE bluesky_did = ${did}`,
      { query },
    )
    const existingRow = existing.rows[0]
    if (!existingRow) {
      throw createHttpError(
        404,
        'Bluesky account not found — complete the Bluesky sign-in step first',
      )
    }
    if (existingRow.user_id && existingRow.user_id !== userId) {
      throw createHttpError(409, 'This Bluesky account is already linked to another user')
    }
    if (existingRow.link_authorization_id !== linkAuthorizationId) {
      throw createHttpError(409, 'This Bluesky session belongs to another link lifecycle')
    }
    await throwBlueskySessionPersistenceError(userId, did, query)
  }
  const { rowCount: authorizationUpdates } =
    await query(sql`/* connectBlueskyAccountToUser:attach */
    UPDATE bluesky_link_authorizations
    SET status = 'attached'
    WHERE id = ${linkAuthorizationId}
      AND user_id = ${userId}
      AND claimed_did = ${did}
      AND status IN ('callback_claimed', 'handoff_ready', 'attached')`)
  if (!authorizationUpdates) throw createHttpError(409, 'Bluesky authorization is no longer active')
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
