import { decodeProtectedHeader, importJWK, jwtVerify, type JWK } from 'jose'
import { isUuidv7 } from '@vouchington/session-jwt'
import { verifyDeviceJwt } from '@ts-shared/session-jwt'
import { DBSC_PROOF_REQUIRED, DBSC_PROOF_INVALID } from '@modules/on-error/error-codes'
import { createCodedError } from '@modules/on-error/create-coded-error'
import { assertSessionClientBinding } from './client-binding.mts'
import { hashDeviceToken, type SessionDeviceAuthorityRow } from './device-authority.mts'
import {
  consumeDbscChallenge,
  readWebSessionAuthority,
  sessionAuthorityRequired,
  type DbscChallenge,
} from './dbsc-state.mts'
import {
  isCanonicalOrigin,
  parseDbscPublicKey,
  type DeviceBoundSessionBinding,
} from './dbsc-state-schema.mts'
import type { FetchUserForSession, DbscAuthorization } from './types.mts'

const authorizations = new WeakSet<DbscAuthorization>()

export async function getWebRefreshAuthority(
  deviceToken: string,
  userAgent?: string,
  ja4?: string,
) {
  const device = await verifyDeviceJwt(deviceToken)
  if (
    !device ||
    device.client !== 'web' ||
    !device.jti ||
    !device.refresh_uid ||
    !device.refresh_sid ||
    !device.ua_hash ||
    typeof device.exp !== 'number' ||
    typeof device.iat !== 'number'
  )
    throw sessionAuthorityRequired()
  assertSessionClientBinding(device, userAgent, ja4)
  const expected = {
    uid: device.refresh_uid,
    did: device.did,
    sid: device.refresh_sid,
    uaHash: device.ua_hash,
    ja4Hash: device.ja4_hash,
    deviceExpiresAt: device.exp,
    deviceIssuedAt: device.iat,
    deviceTokenDigest: hashDeviceToken(deviceToken),
  }
  return { ...(await readWebSessionAuthority(expected)), device, expected }
}

export async function authorizeDbscProof(options: {
  purpose: DbscChallenge['purpose']
  deviceToken: string
  userAgent?: string
  ja4?: string
  origin: string
  requestUrl: string
  proofHeader: string
  sessionHeader?: string
  fetchUser: FetchUserForSession
}): Promise<DbscAuthorization> {
  if (
    !isCanonicalOrigin(options.origin, true) ||
    new URL(options.requestUrl).origin !== options.origin
  )
    throw invalidProof()
  const { authority, raw, expected } = await getWebRefreshAuthority(
    options.deviceToken,
    options.userAgent,
    options.ja4,
  )
  const registering = options.purpose === 'registration'
  if (
    (registering && authority.kind !== 'unbound') ||
    (!registering &&
      (authority.kind !== 'bound' ||
        authority.origin !== options.origin ||
        parseDbscSessionId(options.sessionHeader) !== authority.sid))
  )
    throw invalidProof()
  // Suspension constrains mutations, not renewal; suspended users retain appeal and account access.
  const user = await options.fetchUser(authority.uid)
  if (!user) throw sessionAuthorityRequired()
  let publicKey: JWK
  let nonce: string
  try {
    const proof = options.proofHeader
    if (proof.length > 16_384 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(proof))
      throw invalidProof()
    const header = decodeProtectedHeader(proof)
    if (!registering && header.jwk !== undefined) throw invalidProof()
    // Current Chrome puts the registration JWK in the protected header and omits iat/sub.
    publicKey = registering ? parseDbscPublicKey(header.jwk) : authority.publicKey!
    const verified = await jwtVerify(proof, await importJWK(publicKey, 'ES256'), {
      algorithms: ['ES256'],
      typ: 'dbsc+jwt',
      requiredClaims: ['jti'],
    })
    // Chrome's optional audience feature is not enabled for every client yet.
    if (verified.payload.aud !== undefined) {
      const audiences = Array.isArray(verified.payload.aud)
        ? verified.payload.aud
        : [verified.payload.aud]
      if (!audiences.includes(options.requestUrl)) throw invalidProof()
    }
    nonce = verified.payload.jti!
  } catch {
    throw invalidProof()
  }
  const challenge: DbscChallenge = {
    purpose: options.purpose,
    uid: authority.uid,
    did: authority.did,
    sid: authority.sid,
    origin: options.origin,
  }
  const nextBinding: DeviceBoundSessionBinding | undefined = registering
    ? { origin: options.origin, publicKey, boundAt: new Date().toISOString() }
    : undefined
  const consumed = await consumeDbscChallenge({
    nonce,
    challenge,
    expectedState: raw,
    expected,
    nextBinding,
  })
  if (consumed === 'changed') throw invalidProof()
  if (consumed === 'missing') {
    if (registering) throw invalidProof()
    // A browser can cache its previous challenge. Eviction or one-time consumption asks for
    // a new proof without discarding durable authority or rotating credentials.
    throw proofRequired()
  }
  const authorization = Object.freeze({
    sid: authority.sid,
    deviceTokenDigest: expected.deviceTokenDigest,
  })
  authorizations.add(authorization)
  return authorization
}

/** Call while holding the same authority row lock used for device credential rotation. */
export function assertDeviceBoundRefreshAllowed(
  row: SessionDeviceAuthorityRow,
  proof?: DbscAuthorization,
): boolean {
  if (row.device_bound_session_binding === null) return false
  if (row.device_token_binding?.client !== 'web') throw sessionAuthorityRequired()
  if (
    !proof ||
    !authorizations.has(proof) ||
    proof.sid !== row.id ||
    proof.deviceTokenDigest !== row.device_token_digest
  )
    throw proofRequired()
  authorizations.delete(proof)
  return true
}

/** Chrome sends a raw opaque session ID here, not an RFC structured string. */
export function parseDbscSessionId(header: string | undefined): string | null {
  return header && isUuidv7(header) ? header : null
}

function proofRequired(): Error {
  return createCodedError(403, 'Device session proof required', DBSC_PROOF_REQUIRED)
}

function invalidProof(): Error {
  return createCodedError(400, 'Invalid device session proof', DBSC_PROOF_INVALID)
}
