import { assertDeviceBoundRefreshAllowed } from './dbsc-proof.mts'
import type { DbscAuthorization, DeviceTokenPayload } from './types.mts'
import type { DeviceBoundSessionBinding as RegistrationBinding } from './dbsc-state-schema.mts'
import { randomUUID } from 'node:crypto'
import { beginTransaction, registerPostCommitAction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { encryptSecret } from '@modules/token-secrets'
import { signDeviceJwt, verifyDeviceJwt } from '@ts-shared/session-jwt'
import { DBSC_PROOF_REQUIRED, SESSION_REFRESH_REUSED } from '@modules/on-error/error-codes'
import { createCodedError } from '@vouchington/sentry'
import { revokeSessionKey } from './session-revocation-keys.mts'
import {
  assertDeviceCredentialAuthority,
  deviceTokenSecretPurpose,
  hashDeviceToken,
  isPreviousWebDeviceTokenInGrace,
  lockSessionDeviceAuthority,
  readSessionDeviceAuthority,
  sessionReloginRequired,
  verifyStoredDeviceCredentialReplay,
  type SessionDeviceAuthorityRow,
} from './device-authority.mts'

type DeviceRotationOptions = {
  deviceToken: string
  uid: string
  did: string
  sid: string
  dbscProof?: DbscAuthorization
}

export async function rotateAuthenticatedDeviceToken(
  options: DeviceRotationOptions,
): Promise<string> {
  const device = await verifyDeviceJwt(options.deviceToken)
  if (
    !device ||
    !device.jti ||
    device.refresh_uid !== options.uid ||
    device.refresh_sid !== options.sid
  )
    throw sessionReloginRequired()
  return rotateVerifiedDeviceCredential(options, device)
}

async function rotateVerifiedDeviceCredential(
  options: DeviceRotationOptions,
  device: DeviceTokenPayload,
): Promise<string> {
  const presentedDigest = hashDeviceToken(options.deviceToken)
  const authority = await readSessionDeviceAuthority(options.sid)
  assertDeviceCredentialAuthority(authority, device, options)
  if (options.dbscProof?.purpose !== 'registration' && isExactReplay(authority)) {
    const token = await verifyStoredDeviceCredentialReplay(authority, device, options)
    assertDeviceBoundRefreshAllowed(authority, presentedDigest, options.dbscProof)
    return token
  }

  await using query = await beginTransaction()
  await lockSessionDeviceAuthority(query, options.uid, options.sid)
  if (isExactReplay(authority)) {
    const currentToken = await verifyStoredDeviceCredentialReplay(authority, device, options)
    const registrationBinding = assertDeviceBoundRefreshAllowed(
      authority,
      presentedDigest,
      options.dbscProof,
    )
    if (registrationBinding && !(await bindReplay(authority, registrationBinding)))
      return await resolveRotationRace(authority, 'attempted')
    await query.commit()
    return currentToken
  }
  if (authority.device_token_digest !== presentedDigest) return await revokeReusedCredential()
  if (!hasExactDeviceLifetime(authority)) throw sessionReloginRequired()
  const registrationBinding = assertDeviceBoundRefreshAllowed(
    authority,
    presentedDigest,
    options.dbscProof,
  )
  const payload = {
    ...device,
    jti: randomUUID(),
    iss: undefined,
    aud: undefined,
    exp: undefined,
    iat: undefined,
  }
  const rotated = await signDeviceJwt(payload, {
    expiresIn: authority.expires_at,
    issuedAt: Math.floor(authority.device_token_issued_at.getTime() / 1000),
  })
  const { rowCount: rotatedRows } = await query(
    sql`/* rotateAuthenticatedDeviceToken */
    UPDATE user_sessions SET previous_device_token_digest = ${presentedDigest},
      previous_device_token_grace_expires_at = CURRENT_TIMESTAMP + INTERVAL '60 seconds',
      device_token_digest = ${hashDeviceToken(rotated)},
      device_token_encrypted = ${encryptSecret(rotated, deviceTokenSecretPurpose(options.sid))},
      device_bound_session_binding = COALESCE(device_bound_session_binding, ${registrationBinding ? JSON.stringify(registrationBinding) : null}::jsonb),
      last_seen_at = CURRENT_TIMESTAMP
    WHERE `.append(sessionAuthorityGuard(authority)).append(sql`
      AND device_token_digest = ${presentedDigest}
      AND device_bound_session_binding IS NOT DISTINCT FROM ${serializeBinding(authority)}::jsonb`),
  )
  if (rotatedRows !== 1) return await resolveRotationRace(authority, registrationBinding)
  await query.commit()
  return rotated

  async function resolveRotationRace(
    previous: SessionDeviceAuthorityRow,
    registration: RegistrationBinding | 'attempted' | null,
  ): Promise<string> {
    const current = await readSessionDeviceAuthority(options.sid, query)
    assertDeviceCredentialAuthority(current, device, options)
    const exactReplay = isExactReplay(current)
    if (!exactReplay && current.device_token_digest !== presentedDigest)
      return revokeReusedCredential()
    if (serializeBinding(current) !== serializeBinding(previous))
      throw createCodedError(403, 'Device session proof required', DBSC_PROOF_REQUIRED)
    if (!exactReplay) throw sessionReloginRequired()
    if (registration === 'attempted')
      throw createCodedError(403, 'Device session proof required', DBSC_PROOF_REQUIRED)
    const token = await verifyStoredDeviceCredentialReplay(current, device, options)
    if (registration && !(await bindReplay(current, registration)))
      return resolveRotationRace(current, 'attempted')
    await query.commit()
    return token
  }

  async function bindReplay(row: SessionDeviceAuthorityRow, binding: RegistrationBinding) {
    const { rowCount } = await query(
      sql`/* registerReplayedDeviceCredentialBinding */
      UPDATE user_sessions SET device_bound_session_binding = ${JSON.stringify(binding)}::jsonb
      WHERE `.append(sessionAuthorityGuard(row)).append(sql`
        AND device_token_digest = ${row.device_token_digest}
        AND previous_device_token_digest = ${presentedDigest}
        AND device_bound_session_binding IS NULL`),
    )
    return rowCount === 1
  }

  async function revokeReusedCredential(): Promise<never> {
    await query(sql`/* revokeReusedDeviceCredential */
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

  function sessionAuthorityGuard(current: SessionDeviceAuthorityRow) {
    return sql`id = ${options.sid} AND user_id = ${options.uid} AND device_id = ${options.did}
      AND revoked_at IS NULL AND expires_at > clock_timestamp()
      AND device_token_binding->>'client' = ${device.client}
      AND device_token_binding->>'ua_hash' IS NOT DISTINCT FROM ${device.client === 'web' ? device.ua_hash : null}
      AND device_token_binding->>'ja4_hash' IS NOT DISTINCT FROM ${device.client === 'web' ? (device.ja4_hash ?? null) : null}
      AND expires_at = ${current.expires_at}
      AND device_token_issued_at = ${current.device_token_issued_at}
      AND mfa_verified_at IS NOT DISTINCT FROM ${current.mfa_verified_at}`
  }

  function hasExactDeviceLifetime(row: SessionDeviceAuthorityRow): boolean {
    return (
      row.device_token_issued_at !== null &&
      device.iat === Math.floor(row.device_token_issued_at.getTime() / 1000) &&
      device.exp === Math.floor(row.expires_at.getTime() / 1000)
    )
  }

  function isExactReplay(row: SessionDeviceAuthorityRow): boolean {
    return (
      device.client === 'web' &&
      isPreviousWebDeviceTokenInGrace(row, presentedDigest) &&
      hasExactDeviceLifetime(row)
    )
  }
}

function serializeBinding(row: SessionDeviceAuthorityRow): string | null {
  return row.device_bound_session_binding === null
    ? null
    : JSON.stringify(row.device_bound_session_binding)
}
