import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { QueryExecutor, TransactionQuery } from '@data-stores/psql/types'
import {
  revokeSessionKey,
  revokeSessionKeys,
  revokeUserSessionsBefore,
} from './session-revocation-keys.mts'
import { sessionLimitsMaxValues } from './session-limits-config.mts'

export async function revokeAuthenticatedSession(
  currentUserId: string,
  sessionId: string,
): Promise<boolean> {
  await using query = await beginTransaction()
  const result = await query(sql`/* revokeAuthenticatedSession */
      UPDATE user_sessions
      SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP),
          last_seen_at = CURRENT_TIMESTAMP
      WHERE user_id = ${currentUserId}
        AND id = ${sessionId}
      RETURNING id
    `)
  await query.commit()
  const rows = result.rows

  if (rows.length === 0) return false
  await revokeSessionKey(sessionId)
  return true
}

export async function revokeAllAuthenticatedSessions(currentUserId: string): Promise<string[]> {
  await using query = await beginTransaction()
  const sessionIds = await revokeAllAuthenticatedSessionsInTransaction(currentUserId, query)
  await query.commit()
  await Promise.all([revokeSessionKeys(sessionIds), revokeUserSessionsBefore(currentUserId)])
  return sessionIds
}

/** Revoke active sessions while the caller owns the transaction. */
export async function revokeAllAuthenticatedSessionsInTransaction(
  currentUserId: string,
  query: TransactionQuery,
): Promise<string[]> {
  const result = await query(sql`/* revokeAllAuthenticatedSessions */
      WITH active AS MATERIALIZED (
        SELECT id
        -- no-mistakes-disable-next-line postgres-required-predicates: a SID may be minted before its owning user, so every session-ID partition can hold an active session for this user
        FROM user_sessions
        WHERE user_id = ${currentUserId} AND revoked_at IS NULL
          AND expires_at > CURRENT_TIMESTAMP
        ORDER BY expires_at, id LIMIT ${sessionLimitsMaxValues.active_sessions_per_user}
      )
      UPDATE user_sessions
      SET revoked_at = CURRENT_TIMESTAMP,
          last_seen_at = CURRENT_TIMESTAMP
      WHERE id = ANY(ARRAY(SELECT id FROM active))
        AND user_id = ${currentUserId}
        AND revoked_at IS NULL
        AND expires_at > CURRENT_TIMESTAMP
      RETURNING id
    `)
  return result.rows.map(row => (row as { id: string }).id)
}

export async function revokeSession(
  sessionId: string,
  options?: { query?: QueryExecutor },
): Promise<void> {
  let registryFailed = false
  let registryError: unknown
  try {
    await updateSessionRevocationRegistry(sessionId, options)
  } catch (err) {
    registryFailed = true
    registryError = err
  }
  try {
    await revokeSessionKey(sessionId)
  } catch (err) {
    if (registryFailed)
      throw new AggregateError([registryError, err], 'Session revocation failed', { cause: err })
    throw err
  }
  if (registryFailed) throw registryError
}

async function updateSessionRevocationRegistry(
  sessionId: string,
  options?: { query?: QueryExecutor },
): Promise<void> {
  const revokeInTransaction = async (query: QueryExecutor) => {
    await query(sql`/* updateSessionRevocationRegistry:sessionFence */
      SELECT pg_advisory_xact_lock(hashtextextended(${sessionId}, 1))`)
    await query(sql`/* updateSessionRevocationRegistry */
      UPDATE user_sessions SET revoked_at = CURRENT_TIMESTAMP, last_seen_at = CURRENT_TIMESTAMP
      WHERE id = ${sessionId} AND revoked_at IS NULL`)
  }
  if (options?.query) return revokeInTransaction(options.query)
  await using query = await beginTransaction()
  await revokeInTransaction(query)
  await query.commit()
}

/** Bounded best-effort revocation of the user's other active sessions in the caller's transaction. */
export async function revokeOtherAuthenticatedSessions(
  currentUserId: string,
  actorSessionId: string,
  options: { query: TransactionQuery },
): Promise<void> {
  await options.query(
    `/* revokeOtherAuthenticatedSessions */
     WITH active AS MATERIALIZED (
       SELECT id
       -- no-mistakes-disable-next-line postgres-required-predicates: a SID may be minted before its owning user, so every session-ID partition can hold an active session for this user
       FROM user_sessions
       WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP
       ORDER BY expires_at, id LIMIT $3
     )
     UPDATE user_sessions
     SET revoked_at = clock_timestamp(), account_change_proof_hash = NULL,
         account_change_proof_expires_at = NULL
     WHERE id = ANY(ARRAY(SELECT id FROM active))
       AND user_id = $1 AND id <> $2 AND revoked_at IS NULL
       AND expires_at > CURRENT_TIMESTAMP`,
    [currentUserId, actorSessionId, sessionLimitsMaxValues.active_sessions_per_user],
  )
}
