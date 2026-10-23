import { assertDeviceBoundRefreshAllowed } from './dbsc-proof.mts'
import type { DbscAuthorization } from './types.mts'
import { randomUUID } from 'node:crypto'
import { beginTransaction, registerPostCommitAction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { encryptSecret } from '@modules/token-secrets'
import { signDeviceJwt, verifyDeviceJwt } from '@ts-shared/session-jwt'
import { SESSION_REFRESH_REUSED } from '@modules/on-error/error-codes'
import { createCodedError } from '@modules/on-error/create-coded-error'
import { revokeSessionKey } from './session-revocation-keys.mts'
import {
  assertActiveDeviceAuthority,
  deviceTokenSecretPurpose,
  hashDeviceToken,
  lockSessionDeviceAuthority,
  readSessionDeviceAuthority,
  sessionReloginRequired,
} from './device-authority.mts'

export async function rotateAuthenticatedDeviceToken(options: {
  deviceToken: string
  uid: string
  did: string
  sid: string
  dbscProof?: DbscAuthorization
}): Promise<string> {
  const device = await verifyDeviceJwt(options.deviceToken)
  if (
    !device ||
    !device.jti ||
    device.refresh_uid !== options.uid ||
    device.refresh_sid !== options.sid
  )
    throw sessionReloginRequired()
  await using query = await beginTransaction()
  await lockSessionDeviceAuthority(query, options.uid, options.sid)
  const row = await readSessionDeviceAuthority(options.sid, query, true)
  assertActiveDeviceAuthority(row, options)
  if (!row.device_token_digest || !row.device_token_binding || !row.device_token_issued_at)
    throw sessionReloginRequired()
  if (
    device.did !== row.device_id ||
    device.client !== row.device_token_binding.client ||
    (device.client === 'web' &&
      row.device_token_binding.client === 'web' &&
      (device.ua_hash !== row.device_token_binding.ua_hash ||
        device.ja4_hash !== row.device_token_binding.ja4_hash)) ||
    (device.client === 'native' && device.dc !== 'attested')
  )
    throw sessionReloginRequired()
  if (row.device_token_digest !== hashDeviceToken(options.deviceToken)) {
    await query(sql`/* rotateAuthenticatedDeviceToken */
      UPDATE user_sessions SET revoked_at = CURRENT_TIMESTAMP
      WHERE id = ${options.sid} AND user_id = ${options.uid} AND revoked_at IS NULL`)
    registerPostCommitAction(query, () => revokeSessionKey(options.sid))
    await query.commit()
    throw createCodedError(
      401,
      'Device credential was already used for renewal',
      SESSION_REFRESH_REUSED,
    )
  }
  if (
    device.iat !== Math.floor(row.device_token_issued_at.getTime() / 1000) ||
    device.exp !== Math.floor(row.expires_at.getTime() / 1000)
  )
    throw sessionReloginRequired()
  assertDeviceBoundRefreshAllowed(row, options.dbscProof)
  const payload = {
    ...device,
    jti: randomUUID(),
    iss: undefined,
    aud: undefined,
    exp: undefined,
    iat: undefined,
  }
  const token = await signDeviceJwt(payload, {
    expiresIn: row.expires_at,
    issuedAt: Math.floor(row.device_token_issued_at.getTime() / 1000),
  })
  await query(sql`/* rotateAuthenticatedDeviceToken */
    UPDATE user_sessions SET device_token_digest = ${hashDeviceToken(token)},
      device_token_encrypted = ${encryptSecret(token, deviceTokenSecretPurpose(options.sid))},
      last_seen_at = CURRENT_TIMESTAMP
    WHERE id = ${options.sid} AND user_id = ${options.uid} AND revoked_at IS NULL`)
  await query.commit()
  return token
}
