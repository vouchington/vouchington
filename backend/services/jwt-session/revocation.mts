import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { Batch } from '@valkey/valkey-glide'
import { sessionValkeyClient } from '@data-stores/valkey/clients'
import { getJwtRevokedKey, getJwtUserRevokedBeforeKey } from './constants.mts'

export { revokeSession } from './user-session-revocation.mts'

/** Returns true if the session has been revoked. */
export async function isSessionRevoked(
  sid: string,
  options?: {
    userId?: string | null
    deviceId?: string
    issuedAt?: number
    mfaVerifiedAt?: number | null
  },
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
    if (userRevokedBefore === null)
      return isDurablyRevoked(sid, options.userId, options.deviceId, options.mfaVerifiedAt)

    const revokedBeforeSeconds = Number(userRevokedBefore)
    if (Number.isFinite(revokedBeforeSeconds) && options.issuedAt <= revokedBeforeSeconds)
      return true
    return isDurablyRevoked(sid, options.userId, options.deviceId, options.mfaVerifiedAt)
  }

  const result = await sessionValkeyClient.get(sessionRevokedKey)
  if (result !== null) return true
  return options?.userId
    ? isDurablyRevoked(sid, options.userId, options.deviceId, options.mfaVerifiedAt)
    : false
}

async function isDurablyRevoked(
  sid: string,
  userId: string,
  deviceId?: string,
  mfaVerifiedAt?: number | null,
): Promise<boolean> {
  const statement = sql`/* isDurablyRevoked */
    SELECT s.id FROM user_sessions s JOIN users u ON u.id = s.user_id
    WHERE s.id = ${sid} AND s.user_id = ${userId}
      AND s.revoked_at IS NULL AND s.expires_at > CURRENT_TIMESTAMP
      AND s.device_token_digest IS NOT NULL AND u.deleted_at IS NULL`
  if (deviceId) statement.append(sql` AND s.device_id = ${deviceId}`)
  if (mfaVerifiedAt !== undefined)
    statement.append(
      sql` AND s.mfa_verified_at IS NOT DISTINCT FROM ${mfaVerifiedAt === null ? null : new Date(mfaVerifiedAt * 1000)}::timestamptz`,
    )
  const { rows } = await write(statement)
  return rows.length === 0
}
