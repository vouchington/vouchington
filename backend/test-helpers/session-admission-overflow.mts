import { beginTransaction, write } from '@data-stores/psql'
import { upsertUserAgentString } from '@data-stores/psql/upsert-user-agent-string'

/** Model an owned concurrent overshoot without individually admitting or polling each session. */
export async function seedJwtAdmissionOverflow(userId: string, count: number): Promise<string[]> {
  await using query = await beginTransaction()
  const agentId = await upsertUserAgentString(`jwt-admission-overflow-${userId}`, { query })
  const { rows } = await query<{ id: string }>(
    `/* seedJwtAdmissionOverflow */ INSERT INTO user_sessions
      (id, user_id, device_id, authentication_origin, user_agent_string_id, expires_at)
     SELECT uuidv7(), $1::uuid, uuidv7(), 'web', $2::uuid, CURRENT_TIMESTAMP + INTERVAL '1 minute'
     FROM generate_series(1, $3::integer) RETURNING id`,
    [userId, agentId, count],
  )
  await query.commit()
  return rows.map(row => row.id)
}

/** Inspect only the bounded session identities returned by the fixture and its new admission. */
export async function readJwtAdmissionSessionStates(ids: string[]) {
  const { rows } = await write<{ revoked_at: Date | null }>(
    `/* readJwtAdmissionSessionStates */ SELECT revoked_at FROM user_sessions
     WHERE id = ANY($1::uuid[]) LIMIT $2`,
    [ids, ids.length],
  )
  return rows
}
