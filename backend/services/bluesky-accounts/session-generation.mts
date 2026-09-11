import { beginTransaction } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import sql, { type SQLStatement } from 'sql-template-strings'
import type { BlueskySessionAuthorizationContext } from './session-lifecycle-context.mts'

export class BlueskySessionLifecycleConflictError extends Error {
  readonly did: string

  constructor(did: string) {
    super(`Bluesky session lifecycle ownership changed for ${did}`)
    this.name = 'BlueskySessionLifecycleConflictError'
    this.did = did
  }
}

export async function deleteBlueskySessionForRejectedAuthorization(
  userId: string,
  did: string,
  authorizationId: string,
): Promise<void> {
  await using query = await beginTransaction()

  await lockBlueskyAuthorizationOwner(userId, did, authorizationId, query)
  await retireRejectedBlueskyGeneration(userId, did, authorizationId, query)

  await query.commit()
}

async function retireRejectedBlueskyGeneration(
  userId: string,
  did: string,
  authorizationId: string,
  query: TransactionQuery,
): Promise<void> {
  await query(sql`/* deleteBlueskySessionForRejectedAuthorization:account */
    DELETE FROM bluesky_linked_accounts
    WHERE bluesky_did = ${did}
      AND user_id IS NULL
      AND link_authorization_id = ${authorizationId}`)
  await query(sql`/* deleteBlueskySessionForRejectedAuthorization:authorization */
    UPDATE bluesky_link_authorizations
    SET status = 'rejected', handle = NULL
    WHERE id = ${authorizationId}
      AND user_id = ${userId}
      AND status IN ('pending', 'callback_claimed', 'handoff_ready')`)
}

export async function lockBlueskySessionOwner(
  userId: string,
  did: string,
  query: TransactionQuery,
): Promise<void> {
  await query(sql`/* lockBlueskySessionOwner:user */
    SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 0))`)
  await query(sql`/* lockBlueskySessionOwner:did */
    SELECT pg_advisory_xact_lock(hashtextextended(${did}, 1))`)
}

export async function lockAuthorization(
  authorizationId: string,
  userId: string,
  query: TransactionQuery,
): Promise<void> {
  await query(sql`/* lockBlueskyLinkAuthorization */
    SELECT id
    FROM bluesky_link_authorizations
    WHERE id = ${authorizationId} AND user_id = ${userId}
    FOR UPDATE`)
}

export async function lockBlueskyAuthorizationOwner(
  userId: string,
  did: string,
  authorizationId: string,
  query: TransactionQuery,
): Promise<void> {
  await lockBlueskySessionOwner(userId, did, query)
  await lockAuthorization(authorizationId, userId, query)
}

export async function revokeExactBlueskySession(
  did: string,
  authorization: BlueskySessionAuthorizationContext,
  query: TransactionQuery,
): Promise<void> {
  await lockAuthorization(authorization.authorizationId, authorization.owner.userId, query)
  const deleteQuery = sql`/* revokeExactBlueskySession:account */
    DELETE FROM bluesky_linked_accounts
    WHERE bluesky_did = ${did}`
  appendExactBlueskySessionOwner(deleteQuery, authorization)
  const { rowCount } = await query(deleteQuery)
  if (!rowCount) throw createBlueskySessionLifecycleConflict(did)
  await query(sql`/* revokeExactBlueskySession:authorization */
    UPDATE bluesky_link_authorizations
    SET status = ${authorization.owner.kind === 'attached' ? 'revoked' : 'rejected'},
        handle = NULL
    WHERE id = ${authorization.authorizationId}
      AND user_id = ${authorization.owner.userId}
      AND status = ${authorization.owner.kind === 'attached' ? 'attached' : 'callback_claimed'}`)
}

export function appendExactBlueskySessionOwner(
  query: SQLStatement,
  authorization: BlueskySessionAuthorizationContext,
): void {
  query.append(sql` AND link_authorization_id = ${authorization.authorizationId}`)
  query.append(
    authorization.owner.kind === 'attached'
      ? sql` AND user_id = ${authorization.owner.userId}`
      : sql` AND user_id IS NULL`,
  )
  query.append(sql` AND EXISTS (
    SELECT 1 FROM bluesky_link_authorizations link_auth
    WHERE link_auth.id = ${authorization.authorizationId}
      AND link_auth.user_id = ${authorization.owner.userId}
      AND link_auth.status = ${authorization.owner.kind === 'attached' ? 'attached' : 'callback_claimed'}
  )`)
}

export function createBlueskySessionLifecycleConflict(did: string): Error {
  return new BlueskySessionLifecycleConflictError(did)
}
