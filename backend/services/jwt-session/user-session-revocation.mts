import { beginTransaction, write } from '@data-stores/psql'
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
    sql`/* revokeAuthenticatedSession */ SELECT fn_lock_active_user_for_mutation(${currentUserId})`,
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
    registryFailureMode?: 'throw' | 'ignore'
    query?: QueryExecutor
  },
): Promise<void> {
  await revokeSessionKey(sessionId)
  await updateSessionRevocationRegistry(sessionId, options)
}

async function updateSessionRevocationRegistry(
  sessionId: string,
  options?: {
    registryFailureMode?: 'throw' | 'ignore'
    query?: QueryExecutor
  },
): Promise<void> {
  try {
    await (options?.query ?? write)(sql`/* revokeSession */
      UPDATE user_sessions
      SET revoked_at = CURRENT_TIMESTAMP,
          last_seen_at = CURRENT_TIMESTAMP
      WHERE id = ${sessionId}
        AND revoked_at IS NULL
    `)
  } catch (error) {
    if (options?.registryFailureMode === 'ignore') return
    throw error
  }
}
