import { registerPostCommitAction } from '@data-stores/psql'
import type { QueryExecutor } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { getActiveUserSessionLimit, sessionLimitsMaxValues } from './session-limits-config.mts'
import { revokeSessionKeys } from './session-revocation-keys.mts'

export async function revokeSessionsAboveLimit(
  query: QueryExecutor,
  currentUserId: string,
  newSessionId: string,
): Promise<void> {
  const limit = getActiveUserSessionLimit()
  const hardMaximum = sessionLimitsMaxValues.active_sessions_per_user
  // The admission cap is best effort: concurrent admissions can overshoot it. One bounded read
  // evicts the oldest excess; any remainder beyond the page drains on the next admission.
  const { rows } = await query<{ id: string }>(sql`/* findActiveSessionsForLimit */
    WITH active AS MATERIALIZED (
      SELECT id
      -- no-mistakes-disable-next-line postgres-required-predicates: a SID can be minted before its owning user, so the exact per-user active cap must include every session-ID partition
      FROM user_sessions
      WHERE user_id = ${currentUserId} AND revoked_at IS NULL
        AND expires_at > CURRENT_TIMESTAMP
      ORDER BY expires_at, id LIMIT ${hardMaximum + 2}
    )
    SELECT id FROM active ORDER BY id DESC`)
  // A SID can be minted during an anonymous handshake before newer sessions.
  // Admission keeps the just-created session and the newest other sessions.
  const oldestSessionIds = rows
    .filter(row => row.id !== newSessionId)
    .slice(limit - 1)
    .map(row => row.id)
  if (oldestSessionIds.length === 0) return

  await query(sql`/* revokeOldestAuthenticatedSessions */
    WITH selected AS MATERIALIZED (SELECT unnest(${oldestSessionIds}::uuid[]) AS id)
    UPDATE user_sessions
    SET revoked_at = CURRENT_TIMESTAMP, last_seen_at = CURRENT_TIMESTAMP
    WHERE id = ANY(ARRAY(SELECT id FROM selected)) AND user_id = ${currentUserId}
      AND revoked_at IS NULL
    RETURNING id`)
  // A concurrent SID-specific revocation can already have changed a selected row.
  // Writing its key again is harmless and keeps every selected SID invalidated.
  registerPostCommitAction(query, () => revokeSessionKeys(oldestSessionIds))
}
