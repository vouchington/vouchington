import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { UserSessionRow } from './user-session-types.mts'

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
        SELECT oauth_grant.id, client.client_name, oauth_grant.attestation_status, oauth_grant.last_used_at
        FROM oauth_grants AS oauth_grant
        JOIN oauth_clients AS client ON client.id = oauth_grant.client_id AND client.revoked_at IS NULL
        WHERE oauth_grant.session_id = s.id
          AND oauth_grant.revoked_at IS NULL
        ORDER BY oauth_grant.id DESC
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
