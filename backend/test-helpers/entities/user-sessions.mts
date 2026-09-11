import { beginTransaction, read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { v7 } from 'uuid'

export async function insertTestUserSession(options: {
  userId: string
  sessionId?: string
  deviceId?: string
  deviceName?: string
  userAgent?: string
  ipAddress?: string | null
  expiresAt?: Date
  revokedAt?: Date | null
}): Promise<{
  id: string
  user_id: string
  device_id: string
  device_name: string
  user_agent: string
  ip_address: string | null
  created_at: Date
  last_seen_at: Date
  expires_at: Date
  revoked_at: Date | null
}> {
  const sessionId = options.sessionId ?? v7()
  const deviceId = options.deviceId ?? v7()
  const deviceName = options.deviceName ?? 'Test device'
  const userAgent = options.userAgent ?? ''
  const expiresAt = options.expiresAt ?? new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)
  const ipAddress = options.ipAddress === undefined ? null : options.ipAddress
  const revokedAt = options.revokedAt === undefined ? null : options.revokedAt

  await using transaction = await beginTransaction()
  await transaction(sql`/* insertTestUserSession.userAgent */
    INSERT INTO web_user_agents (user_agent)
    VALUES (${userAgent})
    ON CONFLICT (user_agent) DO NOTHING
  `)
  const { rows } = await transaction(sql`/* insertTestUserSession */
    INSERT INTO user_sessions (
      id, user_id, device_id, device_name, user_agent_id, ip_address, expires_at, revoked_at
    )
    SELECT ${sessionId}, ${options.userId}, ${deviceId}, ${deviceName}, user_agent.id,
      ${ipAddress}, ${expiresAt}, ${revokedAt}
    FROM web_user_agents user_agent
    WHERE user_agent.user_agent = ${userAgent}
    RETURNING id, user_id, device_id, device_name,
      (SELECT user_agent FROM web_user_agents WHERE id = user_sessions.user_agent_id) AS user_agent,
      ip_address, created_at,
      last_seen_at, expires_at, revoked_at
  `)
  await transaction.commit()

  return rows[0] as {
    id: string
    user_id: string
    device_id: string
    device_name: string
    user_agent: string
    ip_address: string | null
    created_at: Date
    last_seen_at: Date
    expires_at: Date
    revoked_at: Date | null
  }
}

export async function getTestUserSessionById(sessionId: string): Promise<{
  id: string
  user_id: string
  device_id: string
  device_name: string
  user_agent: string
  ip_address: string | null
  created_at: Date
  last_seen_at: Date
  expires_at: Date
  revoked_at: Date | null
} | null> {
  const { rows } = await read(sql`
    SELECT s.id, s.user_id, s.device_id, s.device_name, ua.user_agent, s.ip_address,
      s.created_at, s.last_seen_at, s.expires_at, s.revoked_at
    FROM user_sessions s
    JOIN web_user_agents ua ON ua.id = s.user_agent_id
    WHERE s.id = ${sessionId}
    LIMIT 1
  `)
  return (
    (rows[0] as
      | {
          id: string
          user_id: string
          device_id: string
          device_name: string
          user_agent: string
          ip_address: string | null
          created_at: Date
          last_seen_at: Date
          expires_at: Date
          revoked_at: Date | null
        }
      | undefined) ?? null
  )
}

export async function getActiveTestUserSessions(userId: string): Promise<
  Array<{
    id: string
    user_id: string
    device_id: string
    device_name: string
    user_agent: string
    ip_address: string | null
    created_at: Date
    last_seen_at: Date
    expires_at: Date
    revoked_at: Date | null
  }>
> {
  const { rows } = await read(sql`
    SELECT s.id, s.user_id, s.device_id, s.device_name, ua.user_agent, s.ip_address,
      s.created_at, s.last_seen_at, s.expires_at, s.revoked_at
    FROM user_sessions s
    JOIN web_user_agents ua ON ua.id = s.user_agent_id
    WHERE s.user_id = ${userId}
      AND s.revoked_at IS NULL
    ORDER BY s.last_seen_at DESC, s.id DESC
  `)
  return rows as Array<{
    id: string
    user_id: string
    device_id: string
    device_name: string
    user_agent: string
    ip_address: string | null
    created_at: Date
    last_seen_at: Date
    expires_at: Date
    revoked_at: Date | null
  }>
}

export async function deleteTestUserSession(sessionId: string): Promise<void> {
  await write(sql`DELETE FROM user_sessions WHERE id = ${sessionId}`)
}

export async function countTestWebUserAgents(userAgent: string): Promise<number> {
  const { rows } = await read(sql`
    SELECT COUNT(*)::int AS count
    FROM web_user_agents
    WHERE user_agent = ${userAgent}
  `)
  return (rows[0] as { count: number }).count
}
