/* eslint-disable max-lines */
import { beginTransaction, write } from '@data-stores/psql'
import { sessionExpirySecondsFor } from '@ts-shared/session-jwt'
import sql from 'sql-template-strings'
import type { QueryExecutor, QueryOptions } from '@data-stores/psql/types'
import type { DeviceClass, DeviceContext } from './types.mts'
import { normalizeDeviceName, normalizeIpAddress, normalizeText } from './session-device-name.mts'
import {
  revokeSessionKey,
  revokeSessionKeys,
  revokeUserSessionsBefore,
} from './session-revocation-keys.mts'
import type { UserSessionRow } from './user-session-types.mts'

export async function upsertAuthenticatedSession(
  currentUserId: string,
  options: {
    sid: string
    deviceId: string
    expiresAt: Date
    deviceName?: string | null
    ipAddress?: string | null
    userAgent?: string | null
    refreshMetadata?: boolean
  },
  queryOptions?: QueryOptions,
): Promise<UserSessionRow | null> {
  const run = async (query: QueryExecutor): Promise<UserSessionRow | null> => {
    await query(
      sql`/* upsertAuthenticatedSession */
        SELECT pg_advisory_xact_lock(hashtextextended(${currentUserId}, 0))`,
    )
    const deviceName = normalizeDeviceName(options.deviceName, options.userAgent)
    const userAgent = normalizeText(options.userAgent, 1024)
    const ipAddress = normalizeIpAddress(options.ipAddress)
    const refreshMetadata = options.refreshMetadata !== false
    await query(sql`/* upsertAuthenticatedSession.userAgent */
      INSERT INTO web_user_agents (user_agent)
      VALUES (${userAgent})
      ON CONFLICT (user_agent) DO NOTHING
    `)
    const { rows } = await query(sql`/* upsertAuthenticatedSession */
      INSERT INTO user_sessions (
        id, user_id, device_id, device_name, user_agent_id, ip_address, expires_at, last_seen_at
      )
      SELECT ${options.sid}, ${currentUserId}, ${options.deviceId},
        ${deviceName}, user_agent.id, ${ipAddress}, ${options.expiresAt}, CURRENT_TIMESTAMP
      FROM web_user_agents user_agent
      WHERE user_agent.user_agent = ${userAgent}
        AND EXISTS (SELECT 1 FROM users WHERE id = ${currentUserId} AND deleted_at IS NULL)
      ON CONFLICT (id) DO UPDATE SET
        user_id = EXCLUDED.user_id,
        device_id = EXCLUDED.device_id,
        device_name = CASE WHEN ${refreshMetadata} AND ${userAgent} <> ''
          AND EXCLUDED.device_name <> 'Unknown device' THEN EXCLUDED.device_name
          ELSE user_sessions.device_name END,
        user_agent_id = CASE WHEN ${refreshMetadata} AND ${userAgent} <> ''
          THEN EXCLUDED.user_agent_id ELSE user_sessions.user_agent_id END,
        ip_address = CASE WHEN ${refreshMetadata}
          THEN COALESCE(EXCLUDED.ip_address, user_sessions.ip_address)
          ELSE user_sessions.ip_address END,
        expires_at = EXCLUDED.expires_at,
        last_seen_at = CURRENT_TIMESTAMP
      WHERE user_sessions.revoked_at IS NULL
      RETURNING id, user_id, device_id, device_name,
        (SELECT user_agent FROM web_user_agents
          WHERE id = user_sessions.user_agent_id) AS user_agent,
        ip_address, created_at, last_seen_at, expires_at, revoked_at
    `)
    return (rows[0] as UserSessionRow | undefined) ?? null
  }

  if (queryOptions?.query) return run(queryOptions.query)
  await using transaction = await beginTransaction()
  const session = await run(transaction)
  await transaction.commit()
  return session
}

export async function registerAuthenticatedSession({
  sid,
  uid,
  did,
  deviceClass,
  deviceContext,
  expiresAt,
  refreshMetadata,
}: {
  sid: string
  uid: string | null
  did: string
  deviceClass?: DeviceClass
  deviceContext?: DeviceContext
  expiresAt?: Date
  refreshMetadata?: boolean
}): Promise<void> {
  if (uid === null) return

  await upsertAuthenticatedSession(uid, {
    sid,
    deviceId: did,
    expiresAt: expiresAt ?? new Date(Date.now() + sessionExpirySecondsFor(deviceClass) * 1000),
    ipAddress: deviceContext?.ip_address,
    userAgent: deviceContext?.user_agent,
    refreshMetadata,
  })
}

export async function touchAuthenticatedSession(sessionId: string): Promise<void> {
  await write(sql`/* touchAuthenticatedSession */
    UPDATE user_sessions
    SET last_seen_at = CURRENT_TIMESTAMP
    WHERE id = ${sessionId}
      AND revoked_at IS NULL
  `)
}

export async function listActiveUserSessions(
  currentUserId: string,
  currentSessionId: string,
  options: { limit?: number; after?: { timestamp: string; id: string } } = {},
) {
  const limit = options.limit ?? 25
  const query = sql`/* listActiveUserSessions */
    SELECT s.id, s.device_id, s.device_name, ua.user_agent, s.ip_address, s.created_at,
      s.last_seen_at, s.expires_at,
      to_char(s.last_seen_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS last_seen_cursor
    FROM user_sessions s
    JOIN web_user_agents ua ON ua.id = s.user_agent_id
    WHERE s.user_id = ${currentUserId}
      AND s.revoked_at IS NULL
      AND s.expires_at > CURRENT_TIMESTAMP
  `
  if (options.after) {
    query.append(sql` AND (s.last_seen_at < ${options.after.timestamp}::timestamptz
      OR (s.last_seen_at = ${options.after.timestamp}::timestamptz AND s.id < ${options.after.id}))`)
  }
  query.append(sql` ORDER BY s.last_seen_at DESC, s.id DESC LIMIT ${limit + 1}`)
  const { rows } = await write(query)

  const hasNextPage = rows.length > limit
  const results = (rows.slice(0, limit) as (UserSessionRow & { last_seen_cursor: string })[]).map(
    row => ({
      id: row.id,
      device_id: row.device_id,
      device_name: row.device_name,
      user_agent: row.user_agent,
      ip_address: row.ip_address,
      created_at: row.created_at,
      last_seen_at: row.last_seen_at,
      expires_at: row.expires_at,
      is_current: row.id === currentSessionId,
      cursor_timestamp: row.last_seen_cursor,
    }),
  )
  return { results, hasNextPage }
}

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
