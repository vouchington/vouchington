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
  // Snapshot admission can leave a small concurrent overshoot. Bound this eviction page;
  // later new sessions continue draining any excess beyond the page instead of rejecting login.
  const { rows } = await query<{
    id: string
    authorized: boolean
  }>(sql`/* findActiveSessionsForLimit */
    WITH active AS MATERIALIZED (
      SELECT id, user_id, authenticated_at
      -- no-mistakes-disable-next-line postgres-required-predicates: a SID can be minted before its owning user, so the per-user admission snapshot must include every session-ID partition
      FROM user_sessions
      WHERE user_id = ${currentUserId} AND revoked_at IS NULL
        AND expires_at > CURRENT_TIMESTAMP
      ORDER BY expires_at, id LIMIT ${hardMaximum + 2}
    )
    SELECT active.id, NOT EXISTS (
      SELECT 1 FROM user_session_revocation_cutoffs cutoff
      WHERE cutoff.user_id = active.user_id AND active.authenticated_at <= cutoff.cutoff_at
        AND active.id IS DISTINCT FROM cutoff.preserved_session_id
    ) AS authorized FROM active ORDER BY active.id DESC`)
  // Keep the new session while draining invalid rows and any excess authorized sessions.
  const oldestSessionIds: string[] = []
  let retained = 0
  for (const row of rows) {
    if (row.id === newSessionId) continue
    if (row.authorized && retained < limit - 1) retained++
    else oldestSessionIds.push(row.id)
  }
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
