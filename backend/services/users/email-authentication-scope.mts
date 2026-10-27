import type { TransactionQuery } from '@data-stores/psql'
import createHttpError from 'http-errors'
import { assertOAuthAccountConnectionUserActive } from '@services/oauth-accounts'
import {
  lockSessionDeviceAuthority,
  readSessionDeviceAuthority,
  assertActiveDeviceAuthority,
  sessionReloginRequired,
} from '@services/jwt-session/device-authority'

export type EmailAuthenticationScope =
  | { purpose: 'login' }
  | { purpose: 're_auth'; currentUserId: string; session: { sid: string; did: string } }

async function readLockedSessionDeviceAuthority(
  query: TransactionQuery,
  currentUserId: string,
  sessionId: string,
) {
  await lockSessionDeviceAuthority(query, currentUserId, sessionId)
  return readSessionDeviceAuthority(sessionId, query, true)
}

/** Scope reauthentication to the live actor and the current canonical primary under one lock. */
export async function lockEmailAuthenticationScope(
  emailAddress: string,
  scope: EmailAuthenticationScope,
  query: TransactionQuery,
): Promise<void> {
  if (scope.purpose === 'login') return
  await assertOAuthAccountConnectionUserActive(query, scope.currentUserId)
  const session = await readLockedSessionDeviceAuthority(
    query,
    scope.currentUserId,
    scope.session.sid,
  )
  assertActiveDeviceAuthority(session, { uid: scope.currentUserId, did: scope.session.did })
  if (
    !session.device_token_digest ||
    !session.device_token_encrypted ||
    !session.device_token_issued_at ||
    !session.device_token_binding
  ) {
    throw sessionReloginRequired()
  }
  const { rows } = await query(
    `/* lockEmailAuthenticationScope */ SELECT 1 FROM user_email_addresses
     WHERE user_id = $1 AND email_address = $2 AND is_primary = TRUE LIMIT 1`,
    [scope.currentUserId, emailAddress],
  )
  if (!rows[0])
    throw createHttpError(403, 'Reauthentication email is no longer the primary address')
}
