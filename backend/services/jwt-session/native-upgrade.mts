import {
  registerPostCommitAction,
  runWithTransaction,
  type TransactionQuery,
} from '@data-stores/psql'
import sql from 'sql-template-strings'
import { verifyDeviceJwt } from '@ts-shared/session-jwt'
import type { PrivateUser } from '@voucha/types/entities/user'
import { createDeviceAndSessionTokens } from './create.mts'
import { getEnrichedSessionClaims } from './enrich.mts'
import { revokeSessionKey } from './session-revocation-keys.mts'
import {
  assertActiveDeviceAuthority,
  hashDeviceToken,
  lockSessionDeviceAuthority,
  readSessionDeviceAuthority,
  sessionReloginRequired,
} from './device-authority.mts'

/** Hardware verification must finish before entering this atomic authenticated upgrade. */
export async function upgradeVerifiedNativeSession(options: {
  deviceToken: string
  uid: string
  did: string
  sid: string
  fetchUser: (uid: string, query: TransactionQuery) => Promise<PrivateUser | null>
}) {
  const device = await verifyDeviceJwt(options.deviceToken)
  if (
    !device ||
    device.client !== 'web' ||
    device.refresh_uid !== options.uid ||
    device.refresh_sid !== options.sid ||
    device.did !== options.did
  )
    throw sessionReloginRequired()
  return runWithTransaction(undefined, async query => {
    await lockSessionDeviceAuthority(query, options.uid, options.sid)
    const row = await readSessionDeviceAuthority(options.sid, query, true)
    assertActiveDeviceAuthority(row, options)
    if (
      row.device_token_digest !== hashDeviceToken(options.deviceToken) ||
      !row.device_token_issued_at ||
      row.device_token_binding?.client !== 'web' ||
      device.mfa_at !== row.device_token_binding.mfa_at ||
      device.ua_hash !== row.device_token_binding.ua_hash ||
      device.ja4_hash !== row.device_token_binding.ja4_hash ||
      device.iat !== Math.floor(row.device_token_issued_at.getTime() / 1000) ||
      device.exp !== Math.floor(row.expires_at.getTime() / 1000)
    )
      throw sessionReloginRequired()
    const user = await options.fetchUser(options.uid, query)
    if (!user || user.id !== options.uid) throw sessionReloginRequired()
    const claims = await getEnrichedSessionClaims(user, { mfaVerifiedAt: device.mfa_at })
    await query(sql`/* upgradeVerifiedNativeSession */
      UPDATE user_sessions SET revoked_at = CURRENT_TIMESTAMP, last_seen_at = CURRENT_TIMESTAMP
      WHERE id = ${options.sid} AND user_id = ${options.uid} AND revoked_at IS NULL`)
    registerPostCommitAction(query, () => revokeSessionKey(options.sid))
    return createDeviceAndSessionTokens({
      query,
      did: options.did,
      uid: options.uid,
      mfaVerifiedAt: device.mfa_at,
      ...claims,
      authOrigin: row.authentication_origin,
      deviceClass: 'attested',
    })
  })
}
