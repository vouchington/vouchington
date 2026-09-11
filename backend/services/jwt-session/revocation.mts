import { Batch } from '@valkey/valkey-glide'
import { sessionValkeyClient } from '@data-stores/valkey/clients'
import { getJwtRevokedKey, getJwtUserRevokedBeforeKey } from './constants.mts'
import { revokeSession } from './user-sessions.mts'

export { revokeSession } from './user-sessions.mts'

/**
 * Revoke a session by session ID. Called on logout.
 * Revocation is enforced by request context for uid-bearing sessions and on the warm/cold
 * paths in refreshSessionState (PATCH /api/v1/session) and uid-bearing resetSessionState
 * (DELETE /api/v1/session).
 * The revocation key expires after the longest supported session lifetime.
 */
export async function revokeSessions(sids: readonly string[]): Promise<void> {
  await Promise.all(sids.map(sid => revokeSession(sid)))
}

/** Returns true if the session has been revoked. */
export async function isSessionRevoked(
  sid: string,
  options?: { userId?: string | null; issuedAt?: number },
): Promise<boolean> {
  const sessionRevokedKey = getJwtRevokedKey(sid)
  if (options?.userId && options.issuedAt !== undefined) {
    const batch = new Batch(false)
      .get(sessionRevokedKey)
      .get(getJwtUserRevokedBeforeKey(options.userId))
    const batchResult = await sessionValkeyClient.exec(batch, true)
    // A non-atomic batch (pipeline) only returns null on a WATCH-conflicted atomic
    // transaction, which this batch is not — but the type is shared with that case, and a
    // revocation check must fail closed rather than treat a missing result as "not revoked".
    if (batchResult === null || batchResult.length < 2) {
      throw new Error('isSessionRevoked: valkey batch exec returned no result')
    }
    const [sessionRevoked, userRevokedBefore] = batchResult
    if (sessionRevoked !== null) return true
    if (userRevokedBefore === null) return false

    const revokedBeforeSeconds = Number(userRevokedBefore)
    return Number.isFinite(revokedBeforeSeconds) && options.issuedAt <= revokedBeforeSeconds
  }

  const result = await sessionValkeyClient.get(sessionRevokedKey)
  if (result !== null) return true
  return false
}
