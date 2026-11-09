import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { QueryExecutor, TransactionQuery } from '@data-stores/psql/types'
import { revokeSessionKey, revokeSessionKeys } from './session-revocation-keys.mts'
import { sessionLimitsMaxValues } from './session-limits-config.mts'

export async function revokeAuthenticatedSession(
  currentUserId: string,
  sessionId: string,
): Promise<boolean> {
  await using query = await beginTransaction()
  const { rows } = await query<{ user_exists: boolean; user_active: boolean; revoked: boolean }>(
    sql`/* revokeAuthenticatedSession */
      WITH target_user AS MATERIALIZED (
        SELECT deleted_at IS NULL AS active FROM users WHERE id = ${currentUserId}
      ), revoked AS (
        UPDATE user_sessions
        SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP),
            last_seen_at = CURRENT_TIMESTAMP
        WHERE user_id = ${currentUserId}
          AND id = ${sessionId}
          AND EXISTS (SELECT 1 FROM target_user WHERE active)
        RETURNING id
      )
      SELECT EXISTS (SELECT 1 FROM target_user) AS user_exists,
        EXISTS (SELECT 1 FROM target_user WHERE active) AS user_active,
        EXISTS (SELECT 1 FROM revoked) AS revoked
    `,
  )
  const result = rows[0]!
  assertRevocationUserActive(currentUserId, result)
  await query.commit()

  if (!result.revoked) return false
  await revokeSessionKey(sessionId)
  return true
}

export async function revokeAllAuthenticatedSessions(currentUserId: string): Promise<string[]> {
  await using query = await beginTransaction()
  const sessionIds = await revokeAllAuthenticatedSessionsInTransaction(currentUserId, query)
  await query.commit()
  await revokeSessionKeys(sessionIds)
  return sessionIds
}

/** Publish the exact security cutoff, then mark one bounded raw page of old sessions. */
export async function revokeAllAuthenticatedSessionsInTransaction(
  currentUserId: string,
  query: TransactionQuery,
): Promise<string[]> {
  // Mark sessions before writing the cutoff so row order matches account changes, which hold the
  // actor session before they write the cutoff; the later cutoff still covers every older session.
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
        AND authenticated_at <= clock_timestamp()
      RETURNING id
    `)
  await recordUserSessionRevocationCutoff(currentUserId, null, query)
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

/** Caller holds its live-user/actor fences. The durable cutoff authorizes revocation;
 * cleanup touches at most one raw candidate page and can leave older overflow unmarked.
 */
export async function revokeOtherAuthenticatedSessions(
  currentUserId: string,
  actorSessionId: string,
  options: { query: TransactionQuery },
): Promise<void> {
  const cutoffAt = await recordUserSessionRevocationCutoff(
    currentUserId,
    actorSessionId,
    options.query,
  )
  await options.query(
    `/* revokeOtherAuthenticatedSessions */
     WITH active AS MATERIALIZED (
       SELECT id
       -- no-mistakes-disable-next-line postgres-required-predicates: a SID may be minted before its owning user, so every session-ID partition can hold an active session for this user
       FROM user_sessions
       WHERE user_id = $1 AND id <> $2 AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP
       ORDER BY expires_at, id LIMIT $3
     )
     UPDATE user_sessions
     SET revoked_at = clock_timestamp(), account_change_proof_hash = NULL,
         account_change_proof_expires_at = NULL
     WHERE id = ANY(ARRAY(SELECT id FROM active))
       AND user_id = $1 AND id <> $2 AND revoked_at IS NULL
       AND expires_at > CURRENT_TIMESTAMP AND authenticated_at <= $4::timestamptz`,
    [currentUserId, actorSessionId, sessionLimitsMaxValues.active_sessions_per_user, cutoffAt],
  )
}

/** The cutoff row is written security state; no user or session read-set lock is added. */
async function recordUserSessionRevocationCutoff(
  currentUserId: string,
  preservedSessionId: string | null,
  query: TransactionQuery,
): Promise<string> {
  const { rows } = await query<{
    cutoff_at: string | null
    user_exists: boolean
    user_active: boolean
  }>(sql`/* recordUserSessionRevocationCutoff */
    WITH target_user AS MATERIALIZED (
      SELECT deleted_at IS NULL AS active FROM users WHERE id = ${currentUserId}
    ), recorded AS (
      INSERT INTO user_session_revocation_cutoffs AS cutoff (user_id, cutoff_at, preserved_session_id)
      SELECT ${currentUserId}, clock_timestamp(), ${preservedSessionId}
      FROM target_user WHERE active
      ON CONFLICT (user_id) DO UPDATE SET
        cutoff_at = GREATEST(cutoff.cutoff_at, clock_timestamp()),
        preserved_session_id = EXCLUDED.preserved_session_id
      RETURNING cutoff_at::text
    )
    SELECT (SELECT cutoff_at FROM recorded) AS cutoff_at,
      EXISTS (SELECT 1 FROM target_user) AS user_exists,
      EXISTS (SELECT 1 FROM target_user WHERE active) AS user_active
  `)
  const result = rows[0]!
  assertRevocationUserActive(currentUserId, result)
  const cutoffAt = result.cutoff_at
  if (!cutoffAt) throw new Error('Session revocation cutoff was not recorded')
  return cutoffAt
}

class RevocationUserStateError extends Error {
  code: 'P0002' | '23514'

  constructor(message: string, code: 'P0002' | '23514') {
    super(message)
    this.code = code
  }
}

function assertRevocationUserActive(
  userId: string,
  status: { user_exists: boolean; user_active: boolean },
): void {
  if (!status.user_exists)
    throw new RevocationUserStateError(`user ${userId} does not exist`, 'P0002')
  if (!status.user_active)
    throw new RevocationUserStateError(`user ${userId} cannot own new data after deletion`, '23514')
}
