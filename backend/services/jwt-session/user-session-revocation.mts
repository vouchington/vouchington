import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { QueryExecutor } from '@data-stores/psql/types'
import {
  revokeSessionKey,
  revokeSessionKeys,
  revokeUserSessionsBefore,
} from './session-revocation-keys.mts'

export async function revokeAuthenticatedSession(
  currentUserId: string,
  sessionId: string,
): Promise<boolean> {
  await using query = await beginTransaction()
  await query(
    sql`/* revokeAuthenticatedSession:userFence */ SELECT fn_lock_active_user_for_mutation(${currentUserId})`,
  )
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
  await query(
    sql`/* revokeAllAuthenticatedSessions */ SELECT fn_lock_active_user_for_mutation(${currentUserId})`,
  )
  const result = await query(sql`/* revokeAllAuthenticatedSessions */
      -- no-mistakes-disable-next-line postgres-required-predicates: user-wide revocation must update sessions across all session-ID partitions
      UPDATE user_sessions
      SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP),
          last_seen_at = CURRENT_TIMESTAMP
      WHERE user_id = ${currentUserId}
        AND expires_at > CURRENT_TIMESTAMP
      RETURNING id
    `)
  await query.commit()
  const rows = result.rows

  const sessionIds = rows.map(row => (row as { id: string }).id)
  await Promise.all([revokeSessionKeys(sessionIds), revokeUserSessionsBefore(currentUserId)])
  return sessionIds
}

export async function revokeSession(
  sessionId: string,
  options?: {
    query?: QueryExecutor
  },
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
  options?: {
    query?: QueryExecutor
  },
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
