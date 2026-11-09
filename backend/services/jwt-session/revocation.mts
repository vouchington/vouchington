import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { sessionValkeyClient } from '@data-stores/valkey/clients'
import { getJwtRevokedKey } from './constants.mts'

export { revokeSession } from './user-session-revocation.mts'

/** Returns true if the session has been revoked. */
export async function isSessionRevoked(
  sid: string,
  options?: {
    userId?: string | null
    deviceId?: string
    mfaVerifiedAt?: number | null
  },
): Promise<boolean> {
  const sessionRevokedKey = getJwtRevokedKey(sid)
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
      AND s.device_token_digest IS NOT NULL AND u.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM user_session_revocation_cutoffs cutoff
        WHERE cutoff.user_id = s.user_id AND s.authenticated_at <= cutoff.cutoff_at
          AND s.id IS DISTINCT FROM cutoff.preserved_session_id
      )`
  if (deviceId) statement.append(sql` AND s.device_id = ${deviceId}`)
  if (mfaVerifiedAt !== undefined)
    statement.append(
      sql` AND s.mfa_verified_at IS NOT DISTINCT FROM ${mfaVerifiedAt === null ? null : new Date(mfaVerifiedAt * 1000)}::timestamptz`,
    )
  const { rows } = await write(statement)
  return rows.length === 0
}
