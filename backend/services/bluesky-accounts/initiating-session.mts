import type { TransactionQuery } from '@data-stores/psql'
import createHttpError from 'http-errors'
import sql from 'sql-template-strings'
import type { AccountChangeSession } from '@services/mfa/active-account-session'
import { ACCOUNT_SUSPENDED } from '@modules/on-error/error-codes'
import { createCodedError } from '@vouchington/sentry'
import {
  assertActiveDeviceAuthority,
  readSessionDeviceAuthority,
  sessionReloginRequired,
  type SessionDeviceAuthorityRow,
} from '@services/jwt-session/device-authority'

type InitiatingAuthorization = {
  initiating_session_id: string | null
  attached: boolean
  unexpired: boolean
}

/** Admit first attachment under the original live actor; historical attached replay grants nothing. */
export async function lockBlueskyInitiatingSession(
  currentUserId: string,
  authorizationId: string,
  query: TransactionQuery,
): Promise<string | null> {
  const authorization = await getBlueskyInitiatingAuthorization(
    currentUserId,
    authorizationId,
    query,
  )
  if (!authorization) throw sessionReloginRequired()
  if (authorization.attached) return null
  if (!authorization.initiating_session_id || !authorization.unexpired)
    throw sessionReloginRequired()
  const authority = await readBlueskySessionAuthority(
    currentUserId,
    authorization.initiating_session_id,
    query,
  )
  if (!authority || authority.user_id !== currentUserId) throw sessionReloginRequired()
  assertBlueskySessionAuthority(currentUserId, authority.device_id, authority)
  return authority.id
}

/** Require the native handoff to return through the exact session and device that began it. */
export async function lockCurrentBlueskyInitiatingSession(
  currentUserId: string,
  currentSession: AccountChangeSession,
  authorizationId: string,
  query: TransactionQuery,
): Promise<string> {
  const authorization = await getBlueskyInitiatingAuthorization(
    currentUserId,
    authorizationId,
    query,
  )
  await assertBlueskySession(currentUserId, currentSession, query)
  if (!authorization?.unexpired || authorization.initiating_session_id !== currentSession.sid) {
    throw sessionReloginRequired()
  }
  if (authorization.attached) {
    // A competing consumer can finish between our authority snapshots.
    // Only its consumed, exact completion becomes 404; attached flows never authorize a retry.
    const { rows } = await query(sql`/* lockCurrentBlueskyInitiatingSession:completion */
      SELECT account_link_authorization_id FROM bluesky_link_completions
      WHERE account_link_authorization_id = ${authorizationId} AND user_id = ${currentUserId}`)
    if (rows.length === 0)
      throw createHttpError(404, 'Bluesky link completion not found or expired')
    throw sessionReloginRequired()
  }
  return currentSession.sid
}

function assertActiveBlueskyUser(state: { suspended: boolean } | undefined): void {
  if (!state) throw createHttpError(404, 'User not found')
  if (state.suspended)
    throw createCodedError(403, 'Your account has been suspended', ACCOUNT_SUSPENDED)
}

async function assertBlueskySession(
  userId: string,
  session: AccountChangeSession,
  query: TransactionQuery,
): Promise<void> {
  const authority = await readBlueskySessionAuthority(userId, session.sid, query)
  assertBlueskySessionAuthority(userId, session.did, authority)
}

async function readBlueskySessionAuthority(
  userId: string,
  sessionId: string,
  query: TransactionQuery,
): Promise<SessionDeviceAuthorityRow | null> {
  const authority = await readSessionDeviceAuthority(sessionId, query)
  if (!authority) {
    // A deletion between the actor snapshot and the session read remains a missing-user error.
    const { rows } = await query<{ suspended: boolean }>(sql`/* readBlueskyMissingSessionUser */
      SELECT EXISTS (SELECT 1 FROM user_suspensions WHERE user_id = ${userId} AND lifted_at IS NULL) AS suspended
      FROM users WHERE id = ${userId} AND deleted_at IS NULL`)
    assertActiveBlueskyUser(rows[0])
  }
  return authority
}

function assertBlueskySessionAuthority(
  userId: string,
  did: string,
  authority: SessionDeviceAuthorityRow | null,
): void {
  assertActiveDeviceAuthority(authority, { uid: userId, did })
  if (
    !authority.device_token_digest ||
    !authority.device_token_encrypted ||
    !authority.device_token_issued_at ||
    !authority.device_token_binding
  )
    throw sessionReloginRequired()
}

async function getBlueskyInitiatingAuthorization(
  currentUserId: string,
  authorizationId: string,
  query: TransactionQuery,
): Promise<InitiatingAuthorization | undefined> {
  const { rows } = await query<
    InitiatingAuthorization & {
      authorization_id: string | null
      suspended: boolean
    }
  >(
    `/* lockBlueskyInitiatingSession */ SELECT link.id AS authorization_id,
       link.initiating_session_id, link.attached_at IS NOT NULL AS attached,
       link.expires_at > clock_timestamp() AS unexpired,
       EXISTS (SELECT 1 FROM user_suspensions
         WHERE user_id = actor.id AND lifted_at IS NULL) AS suspended
     FROM users AS actor
     LEFT JOIN bluesky_link_authorizations AS link
       ON link.id = $1 AND link.user_id = actor.id
     WHERE actor.id = $2 AND actor.deleted_at IS NULL`,
    [authorizationId, currentUserId],
  )
  const row = rows[0]
  assertActiveBlueskyUser(row)
  return row?.authorization_id ? row : undefined
}
