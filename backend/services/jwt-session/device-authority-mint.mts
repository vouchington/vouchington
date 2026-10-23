import { randomUUID } from 'node:crypto'
import { runWithTransaction, type TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { decryptSecret, encryptSecret } from '@modules/token-secrets'
import {
  signDeviceJwt,
  verifyDeviceJwt,
  DEVICE_EXPIRATION_SECONDS,
  type DeviceTokenPayload,
} from '@ts-shared/session-jwt'
import { sessionValkeyClient } from '@data-stores/valkey/clients'
import { getJwtRevokedKey, getJwtUserRevokedBeforeKey } from './constants.mts'
import { assertSessionClientBinding } from './client-binding.mts'
import type { DeviceContext, DeviceClass, SessionClientBinding } from './types.mts'
import { registerAuthenticatedSession } from './user-sessions.mts'
import {
  assertActiveDeviceAuthority,
  deviceTokenSecretPurpose,
  hashDeviceToken,
  lockSessionDeviceAuthority,
  readSessionDeviceAuthority,
  sessionReloginRequired,
} from './device-authority.mts'

export async function mintAuthenticatedDeviceAuthority(options: {
  query?: TransactionQuery
  uid: string
  did: string
  sid: string
  binding: SessionClientBinding
  deviceClass?: DeviceClass
  deviceContext?: DeviceContext
  issuedAt: number
  credentialReplay?: boolean
  deviceRenewal?: 'verified-native-attestation'
}) {
  return runWithTransaction(options.query, async query => {
    await lockSessionDeviceAuthority(query, options.uid, options.sid)
    const [revoked, cutoff] = await sessionValkeyClient.mget([
      getJwtRevokedKey(options.sid),
      getJwtUserRevokedBeforeKey(options.uid),
    ])
    if (revoked !== null || (cutoff !== null && options.issuedAt <= Number(cutoff)))
      throw sessionReloginRequired()
    await registerAuthenticatedSession(
      {
        uid: options.uid,
        sid: options.sid,
        did: options.did,
        deviceContext: options.deviceContext,
        deviceClass: options.deviceClass,
        expiresAt: new Date((options.issuedAt + DEVICE_EXPIRATION_SECONDS) * 1000),
      },
      { query },
    )
    const row = await readSessionDeviceAuthority(options.sid, query, true)
    assertActiveDeviceAuthority(row, options)
    if (row.device_token_encrypted) {
      if (!options.credentialReplay && !options.deviceRenewal) throw sessionReloginRequired()
      const token = decryptSecret(row.device_token_encrypted, deviceTokenSecretPurpose(options.sid))
      const device = await verifyDeviceJwt(token)
      if (
        !device ||
        device.did !== options.did ||
        device.client !== row.device_token_binding?.client ||
        device.ua_hash !==
          (row.device_token_binding?.client === 'web'
            ? row.device_token_binding.ua_hash
            : undefined) ||
        device.ja4_hash !==
          (row.device_token_binding?.client === 'web'
            ? row.device_token_binding.ja4_hash
            : undefined) ||
        (device.client === 'native' && device.dc !== 'attested') ||
        hashDeviceToken(token) !== row.device_token_digest ||
        device.refresh_uid !== options.uid ||
        device.refresh_sid !== options.sid ||
        !row.device_token_binding ||
        !row.device_token_issued_at ||
        device.iat !== Math.floor(row.device_token_issued_at.getTime() / 1000) ||
        device.exp !== Math.floor(row.expires_at.getTime() / 1000)
      )
        throw sessionReloginRequired()
      if (cutoff !== null && device.iat! <= Number(cutoff)) throw sessionReloginRequired()
      assertSessionClientBinding(
        device,
        options.deviceContext?.user_agent,
        options.deviceContext?.ja4,
      )
      if (options.deviceRenewal) {
        if (
          options.credentialReplay ||
          row.device_token_binding.client !== 'native' ||
          options.deviceClass !== 'attested'
        )
          throw sessionReloginRequired()
      } else {
        return { token, payload: device, binding: row.device_token_binding, created: false }
      }
    }
    const binding = row.device_token_binding ?? options.binding
    const payload: DeviceTokenPayload = {
      did: options.did,
      jti: randomUUID(),
      ...binding,
      ...(options.deviceClass && { dc: options.deviceClass }),
      refresh_uid: options.uid,
      refresh_sid: options.sid,
    }
    const expiresAt = new Date((options.issuedAt + DEVICE_EXPIRATION_SECONDS) * 1000)
    const token = await signDeviceJwt(payload, { expiresIn: expiresAt, issuedAt: options.issuedAt })
    await query(sql`/* mintAuthenticatedDeviceAuthority */
    UPDATE user_sessions SET device_token_digest = ${hashDeviceToken(token)},
      device_token_encrypted = ${encryptSecret(token, deviceTokenSecretPurpose(options.sid))},
      device_token_issued_at = ${new Date(options.issuedAt * 1000)},
      device_token_binding = ${JSON.stringify(binding)}::jsonb, expires_at = ${expiresAt}
    WHERE id = ${options.sid} AND user_id = ${options.uid} AND revoked_at IS NULL`)
    return {
      token,
      payload: { ...payload, iat: options.issuedAt, exp: Math.floor(expiresAt.getTime() / 1000) },
      binding,
      created: row.device_token_digest === null,
    }
  })
}
