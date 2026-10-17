import { read, write } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import createHttpError from 'http-errors'
import { throwBlueskySessionPersistenceError } from './session-persistence-error.mts'

type PostgresError = { code?: string; constraint?: string }

// idx_bluesky_linked_accounts__user_id enforces one Bluesky link per Voucha user; a concurrent
// second link attempt for a different DID surfaces here as a unique-violation, not as the
// row-not-updated branch below (that branch only covers the DID side of the relationship).
function isUserAlreadyLinkedViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const pgError = error as PostgresError
  return pgError.code === '23505' && pgError.constraint === 'idx_bluesky_linked_accounts__user_id'
}

/** Caller holds the user/DID lifecycle locks and the exact authorization row lock. */
export async function connectBlueskyAccountInLockedTransaction(
  userId: string,
  did: string,
  handle: string,
  linkAuthorizationId: string,
  query: TransactionQuery,
): Promise<void> {
  try {
    await attachBlueskyAccountRows(userId, did, handle, linkAuthorizationId, query)
  } catch (err) {
    if (isUserAlreadyLinkedViolation(err)) {
      throw createHttpError(409, 'You already have a Bluesky account linked — unlink it first')
    }
    throw err
  }
}

async function attachBlueskyAccountRows(
  userId: string,
  did: string,
  handle: string,
  linkAuthorizationId: string,
  query: TransactionQuery,
): Promise<void> {
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
    SET attached_at = COALESCE(attached_at, clock_timestamp())
    WHERE id = ${linkAuthorizationId}
      AND user_id = ${userId}
      AND claimed_did = ${did}
      AND status IN ('callback_claimed', 'handoff_ready', 'attached')`)
  if (!authorizationUpdates) throw createHttpError(409, 'Bluesky authorization is no longer active')
}
