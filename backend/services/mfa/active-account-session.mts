import { ACCOUNT_SUSPENDED } from '@modules/on-error/error-codes'
import { createCodedError } from '@vouchington/sentry'
import createHttpError from 'http-errors'
import { runWithTransaction, type TransactionQuery } from '@data-stores/psql'
import {
  lockOAuthAccountConnectionUser,
  assertLockedOAuthAccountConnectionUserActive,
  type LockedOAuthAccountConnectionUser,
} from '@services/oauth-accounts'
import {
  readSessionDeviceAuthority,
  assertActiveDeviceAuthority,
  sessionReloginRequired,
  type SessionDeviceAuthorityRow,
} from '@services/jwt-session/device-authority'

export type AccountChangeSession = { sid: string; did: string }

/** The same user/SID fences are shared by durable renewal, revocation and account mutations. */
export async function lockActiveAccountSession(
  currentUserId: string,
  session: AccountChangeSession,
  query: TransactionQuery,
): Promise<void> {
  const user = await lockLiveAccountSession(currentUserId, session, query)
  await assertLockedOAuthAccountConnectionUserActive(user)
}

/** Ordinary authentication can retain account/appeal access while settings enforce suspension separately. */
export async function lockLiveAccountSession(
  currentUserId: string,
  session: AccountChangeSession,
  query: TransactionQuery,
): Promise<LockedOAuthAccountConnectionUser> {
  const user = await lockOAuthAccountConnectionUser(query, currentUserId)
  const authority = await readSessionDeviceAuthority(session.sid, query)
  assertAccountSessionAuthority(authority, currentUserId, session.did)
  return user
}

/** Checks the current user and durable session for a flow that returns an existing result. */
export async function assertReadableAccountSession(
  currentUserId: string,
  session: AccountChangeSession,
  query: TransactionQuery,
  requireUnsuspended: boolean,
): Promise<void> {
  const { rows } = await query<{ active: boolean; suspended: boolean }>(
    `/* assertReadableAccountSession */
     SELECT EXISTS (SELECT 1 FROM users WHERE id = $1 AND deleted_at IS NULL) AS active,
            EXISTS (SELECT 1 FROM user_suspensions WHERE user_id = $1 AND lifted_at IS NULL) AS suspended`,
    [currentUserId],
  )
  if (!rows[0]?.active) throw createHttpError(404, 'User not found')
  const authority = await readSessionDeviceAuthority(session.sid, query)
  assertAccountSessionAuthority(authority, currentUserId, session.did)
  if (requireUnsuspended && rows[0].suspended)
    throw createCodedError(403, 'Your account has been suspended', ACCOUNT_SUSPENDED)
}

export async function withActiveAccountSession<T>(
  currentUserId: string,
  session: AccountChangeSession,
  work: (query: TransactionQuery) => Promise<T>,
  options?: { serializable?: boolean },
): Promise<T> {
  return runWithTransaction(
    undefined,
    async query => {
      await lockActiveAccountSession(currentUserId, session, query)
      return work(query)
    },
    options,
  )
}

function assertAccountSessionAuthority(
  authority: SessionDeviceAuthorityRow | null,
  currentUserId: string,
  deviceId: string,
): void {
  assertActiveDeviceAuthority(authority, { uid: currentUserId, did: deviceId })
  if (
    !authority.device_token_digest ||
    !authority.device_token_encrypted ||
    !authority.device_token_issued_at ||
    !authority.device_token_binding
  ) {
    throw sessionReloginRequired()
  }
}
