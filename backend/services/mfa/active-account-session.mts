import { runWithTransaction, type TransactionQuery } from '@data-stores/psql'
import {
  lockOAuthAccountConnectionUser,
  assertLockedOAuthAccountConnectionUserActive,
  type LockedOAuthAccountConnectionUser,
} from '@services/oauth-accounts'
import {
  lockSessionDeviceAuthority,
  readSessionDeviceAuthority,
  assertActiveDeviceAuthority,
  sessionReloginRequired,
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
  const authority = await readLockedAccountSession(currentUserId, session.sid, query)
  assertActiveDeviceAuthority(authority, { uid: currentUserId, did: session.did })
  if (
    !authority.device_token_digest ||
    !authority.device_token_encrypted ||
    !authority.device_token_issued_at ||
    !authority.device_token_binding
  ) {
    throw sessionReloginRequired()
  }
  return user
}

export async function withActiveAccountSession<T>(
  currentUserId: string,
  session: AccountChangeSession,
  work: (query: TransactionQuery) => Promise<T>,
  options: { query?: TransactionQuery } = {},
): Promise<T> {
  return runWithTransaction(options.query, async query => {
    await lockActiveAccountSession(currentUserId, session, query)
    return work(query)
  })
}

async function readLockedAccountSession(
  currentUserId: string,
  sessionId: string,
  query: TransactionQuery,
) {
  await lockSessionDeviceAuthority(query, currentUserId, sessionId)
  return readSessionDeviceAuthority(sessionId, query, true)
}
