import { beginTransaction } from '@data-stores/psql'
import { upsertUserAgentString } from '@data-stores/psql/upsert-user-agent-string'
import { sessionValkeyClient } from '@data-stores/valkey/clients'
import { getJwtRevokedKey } from '../services/jwt-session/constants.mts'

/** Seed an owned overflow page of older sessions with one bounded insert. */
export async function seedSessionRevocationCutoffOverflow(
  userId: string,
  count: number,
): Promise<string[]> {
  await using query = await beginTransaction()
  const userAgentId = await upsertUserAgentString(`session-cutoff-overflow-${userId}`, { query })
  const { rows } = await query<{ id: string }>(
    `/* seedSessionRevocationCutoffOverflow */ INSERT INTO user_sessions (
       id, user_id, device_id, authentication_origin, user_agent_string_id, expires_at
     )
     SELECT uuidv7(), $1::uuid, uuidv7(), 'web', $2::uuid,
       CURRENT_TIMESTAMP + INTERVAL '1 minute'
     FROM generate_series(1, $3::integer)
     RETURNING id`,
    [userId, userAgentId, count],
  )
  await query.commit()
  return rows.map(row => row.id)
}

/** Insert an owned session at the exact durable boundary to cover inclusive comparison semantics. */
export async function insertTestSessionAtUserRevocationCutoff(userId: string): Promise<string> {
  await using query = await beginTransaction()
  const userAgentId = await upsertUserAgentString(`session-cutoff-equality-${userId}`, { query })
  const { rows } = await query<{ id: string }>(
    `/* insertTestSessionAtUserRevocationCutoff */ INSERT INTO user_sessions (
       id, user_id, device_id, authentication_origin, authenticated_at, user_agent_string_id, expires_at
     )
     SELECT uuidv7(), cutoff.user_id, uuidv7(), 'web', cutoff.cutoff_at, $2::uuid,
       CURRENT_TIMESTAMP + INTERVAL '1 day'
     FROM user_session_revocation_cutoffs AS cutoff
     WHERE cutoff.user_id = $1
     RETURNING id`,
    [userId, userAgentId],
  )
  await query.commit()
  const sessionId = rows[0]?.id
  if (!sessionId) throw new Error('User session revocation cutoff was not present')
  return sessionId
}

/** Remove only the exact SID revocation marker owned by the caller's fixture. */
export async function clearSessionRevokedCacheForTest(sessionId: string): Promise<void> {
  await sessionValkeyClient.del([getJwtRevokedKey(sessionId)])
}
