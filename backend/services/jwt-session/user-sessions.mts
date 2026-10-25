import { upsertUserAgentString } from '@data-stores/psql/upsert-user-agent-string'
import { beginTransaction } from '@data-stores/psql'
import { sessionExpirySecondsFor } from '@ts-shared/session-jwt'
import {
  getRequestUserAgentStringId,
  hasRequestContext,
  setRequestUserAgentStringId,
} from '@modules/utils/request-context'
import sql from 'sql-template-strings'
import type { QueryExecutor, QueryOptions } from '@data-stores/psql/types'
import type { DeviceClass, DeviceContext } from './types.mts'
import { normalizeDeviceName, normalizeIpAddress, normalizeText } from './session-device-name.mts'
import type { UserSessionRow } from './user-session-types.mts'

export async function upsertAuthenticatedSession(
  currentUserId: string,
  options: AuthenticatedSessionOptions,
  queryOptions?: QueryOptions,
): Promise<UserSessionRow | null> {
  if (queryOptions?.query)
    return writeAuthenticatedSession(queryOptions.query, currentUserId, options)
  await using transaction = await beginTransaction()
  const session = await writeAuthenticatedSession(transaction, currentUserId, options)
  await transaction.commit()
  return session
}

type AuthenticatedSessionOptions = {
  sid: string
  deviceId: string
  expiresAt: Date
  deviceName?: string | null
  ipAddress?: string | null
  userAgent?: string | null
  refreshMetadata?: boolean
  authOrigin?: 'web' | 'native'
}

async function writeAuthenticatedSession(
  query: QueryExecutor,
  currentUserId: string,
  options: AuthenticatedSessionOptions,
  resolvedUserAgentId?: string | null,
): Promise<UserSessionRow | null> {
  await query(
    sql`/* upsertAuthenticatedSession */
        SELECT pg_advisory_xact_lock(hashtextextended(${currentUserId}, 0))`,
  )
  const deviceName = normalizeDeviceName(options.deviceName, options.userAgent)
  const userAgent = normalizeText(options.userAgent, 1024)
  const ipAddress = normalizeIpAddress(options.ipAddress)
  const refreshMetadata = options.refreshMetadata !== false
  const userAgentId =
    resolvedUserAgentId === undefined
      ? await upsertUserAgentString(userAgent, { query })
      : resolvedUserAgentId
  const { rows } = await query(sql`/* upsertAuthenticatedSession */
      INSERT INTO user_sessions (
        id, user_id, device_id, authentication_origin, device_name, user_agent_string_id, ip_address, expires_at, last_seen_at
      )
      SELECT ${options.sid}, ${currentUserId}, ${options.deviceId}, ${options.authOrigin ?? 'web'},
        ${deviceName}, ${userAgentId}, ${ipAddress}, ${options.expiresAt}, CURRENT_TIMESTAMP
      WHERE EXISTS (SELECT 1 FROM users WHERE id = ${currentUserId} AND deleted_at IS NULL)
      ON CONFLICT (id) DO UPDATE SET
        device_name = CASE WHEN ${refreshMetadata} AND ${userAgent} <> ''
          AND EXCLUDED.device_name <> 'Unknown device' THEN EXCLUDED.device_name
          ELSE user_sessions.device_name END,
        user_agent_string_id = CASE WHEN ${refreshMetadata} AND ${userAgent} <> ''
          THEN EXCLUDED.user_agent_string_id ELSE user_sessions.user_agent_string_id END,
        ip_address = CASE WHEN ${refreshMetadata}
          THEN COALESCE(EXCLUDED.ip_address, user_sessions.ip_address)
          ELSE user_sessions.ip_address END,
        expires_at = CASE WHEN user_sessions.device_token_digest IS NULL THEN EXCLUDED.expires_at ELSE user_sessions.expires_at END,
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

export async function registerAuthenticatedSession(
  {
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
  },
  queryOptions?: QueryOptions,
): Promise<void> {
  if (uid === null) return

  if (!queryOptions?.query && hasRequestContext()) {
    const options: AuthenticatedSessionOptions = {
      sid,
      deviceId: did,
      expiresAt: expiresAt ?? new Date(Date.now() + sessionExpirySecondsFor(deviceClass) * 1000),
      ipAddress: deviceContext?.ip_address,
      userAgent: deviceContext?.user_agent,
      refreshMetadata,
      authOrigin,
    }
    const normalizedUserAgent = normalizeText(options.userAgent, 1024)
    let userAgentId: string | null | undefined = getRequestUserAgentStringId(normalizedUserAgent)
    if (userAgentId === undefined) {
      const resolvedUserAgentId = await upsertUserAgentString(normalizedUserAgent)
      userAgentId = resolvedUserAgentId
      if (resolvedUserAgentId !== null)
        setRequestUserAgentStringId(normalizedUserAgent, resolvedUserAgentId)
    }
    await using transaction = await beginTransaction()
    await writeAuthenticatedSession(transaction, uid, options, userAgentId)
    await transaction.commit()
    return
  }

  await upsertAuthenticatedSession(
    uid,
    {
      sid,
      deviceId: did,
      expiresAt: expiresAt ?? new Date(Date.now() + sessionExpirySecondsFor(deviceClass) * 1000),
      ipAddress: deviceContext?.ip_address,
      userAgent: deviceContext?.user_agent,
      refreshMetadata,
      authOrigin,
    },
    queryOptions,
  )
}

export { listActiveUserSessions } from './list-active-user-sessions.mts'
