import { upsertUserAgentString } from '@data-stores/psql/upsert-user-agent-string'
import { beginTransaction, write } from '@data-stores/psql'
import { sessionExpirySecondsFor } from '@ts-shared/session-jwt'
import sql from 'sql-template-strings'
import type { QueryExecutor, QueryOptions } from '@data-stores/psql/types'
import type { DeviceClass, DeviceContext } from './types.mts'
import { normalizeDeviceName, normalizeIpAddress, normalizeText } from './session-device-name.mts'
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
    authOrigin?: 'web' | 'native'
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
    const userAgentId = await upsertUserAgentString(userAgent, { query })
    const { rows } = await query(sql`/* upsertAuthenticatedSession */
      INSERT INTO user_sessions (
        id, user_id, device_id, authentication_origin, device_name, user_agent_string_id, ip_address, expires_at, last_seen_at
      )
      SELECT ${options.sid}, ${currentUserId}, ${options.deviceId}, ${options.authOrigin ?? 'web'},
        ${deviceName}, ${userAgentId}, ${ipAddress}, ${options.expiresAt}, CURRENT_TIMESTAMP
      WHERE EXISTS (SELECT 1 FROM users WHERE id = ${currentUserId} AND deleted_at IS NULL)
      ON CONFLICT (id) DO UPDATE SET
        user_id = EXCLUDED.user_id,
        device_id = EXCLUDED.device_id,
        device_name = CASE WHEN ${refreshMetadata} AND ${userAgent} <> ''
          AND EXCLUDED.device_name <> 'Unknown device' THEN EXCLUDED.device_name
          ELSE user_sessions.device_name END,
        user_agent_string_id = CASE WHEN ${refreshMetadata} AND ${userAgent} <> ''
          THEN EXCLUDED.user_agent_string_id ELSE user_sessions.user_agent_string_id END,
        ip_address = CASE WHEN ${refreshMetadata}
          THEN COALESCE(EXCLUDED.ip_address, user_sessions.ip_address)
          ELSE user_sessions.ip_address END,
        expires_at = EXCLUDED.expires_at,
        last_seen_at = CURRENT_TIMESTAMP
      WHERE user_sessions.revoked_at IS NULL
        AND user_sessions.user_id = EXCLUDED.user_id
        AND user_sessions.device_id = EXCLUDED.device_id
      RETURNING id, user_id, device_id, authentication_origin, device_name,
        (SELECT user_agent FROM user_agent_strings
          WHERE id = user_sessions.user_agent_string_id) AS user_agent,
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
  authOrigin,
}: {
  sid: string
  uid: string | null
  did: string
  deviceClass?: DeviceClass
  deviceContext?: DeviceContext
  expiresAt?: Date
  refreshMetadata?: boolean
  authOrigin?: 'web' | 'native'
}): Promise<void> {
  if (uid === null) return

  await upsertAuthenticatedSession(uid, {
    sid,
    deviceId: did,
    expiresAt: expiresAt ?? new Date(Date.now() + sessionExpirySecondsFor(deviceClass) * 1000),
    ipAddress: deviceContext?.ip_address,
    userAgent: deviceContext?.user_agent,
    refreshMetadata,
    authOrigin,
  })
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
      COALESCE(native_connections.connections, '[]'::json) AS mcp_connections,
      to_char(s.last_seen_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS last_seen_cursor
    -- no-mistakes-disable-next-line postgres-required-predicates: a session ID can be minted before its owning user and refreshed later, so active-session pagination must search all ID partitions
    FROM user_sessions s
    JOIN user_agent_strings ua ON ua.id = s.user_agent_string_id
    LEFT JOIN LATERAL (
      SELECT json_agg(json_build_object(
        'grant_id', connection.id,
        'client_name', connection.client_name,
        'attestation_status', connection.attestation_status,
        'last_minted_at', connection.last_used_at
      ) ORDER BY connection.id DESC) AS connections
      FROM (
        SELECT grant.id, client.client_name, grant.attestation_status, grant.last_used_at
        FROM oauth_grants AS grant
        JOIN oauth_clients AS client ON client.id = grant.client_id AND client.revoked_at IS NULL
        WHERE grant.session_id = s.id
          AND grant.revoked_at IS NULL
        ORDER BY grant.id DESC
        LIMIT 1
      ) AS connection
    ) AS native_connections ON TRUE
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
      mcp_connections: row.mcp_connections,
      is_current: row.id === currentSessionId,
      cursor_timestamp: row.last_seen_cursor,
    }),
  )
  return { results, hasNextPage }
}
