import type { TransactionQuery } from '@data-stores/psql'
import { assertOAuthAccountConnectionUserActive } from '@services/oauth-accounts'
import {
  lockActiveAccountSession,
  type AccountChangeSession,
} from '@services/mfa/active-account-session'
import {
  readSessionDeviceAuthority,
  sessionReloginRequired,
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
  await assertOAuthAccountConnectionUserActive(query, currentUserId)
  const authorization = await getBlueskyInitiatingAuthorization(
    currentUserId,
    authorizationId,
    query,
  )
  if (!authorization) throw sessionReloginRequired()
  if (authorization.attached) return null
  if (!authorization.initiating_session_id || !authorization.unexpired)
    throw sessionReloginRequired()
  const authority = await readSessionDeviceAuthority(authorization.initiating_session_id, query)
  if (!authority || authority.user_id !== currentUserId) throw sessionReloginRequired()
  await lockActiveAccountSession(
    currentUserId,
    { sid: authority.id, did: authority.device_id },
    query,
  )
  return authority.id
}

/** Require the native handoff to return through the exact session and device that began it. */
export async function lockCurrentBlueskyInitiatingSession(
  currentUserId: string,
  currentSession: AccountChangeSession,
  authorizationId: string,
  query: TransactionQuery,
): Promise<string> {
  await lockActiveAccountSession(currentUserId, currentSession, query)
  const authorization = await getBlueskyInitiatingAuthorization(
    currentUserId,
    authorizationId,
    query,
  )
  if (
    authorization?.attached ||
    !authorization?.unexpired ||
    authorization.initiating_session_id !== currentSession.sid
  ) {
    throw sessionReloginRequired()
  }
  return currentSession.sid
}

async function getBlueskyInitiatingAuthorization(
  currentUserId: string,
  authorizationId: string,
  query: TransactionQuery,
): Promise<InitiatingAuthorization | undefined> {
  const { rows } = await query<InitiatingAuthorization>(
    `/* lockBlueskyInitiatingSession */ SELECT initiating_session_id,
       attached_at IS NOT NULL AS attached, expires_at > clock_timestamp() AS unexpired
     FROM bluesky_link_authorizations WHERE id = $1 AND user_id = $2`,
    [authorizationId, currentUserId],
  )
  return rows[0]
}
