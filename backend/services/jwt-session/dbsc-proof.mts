import { isCanonicalOrigin } from './dbsc-state-schema.mts'
import { DBSC_PROOF_REQUIRED, DBSC_PROOF_INVALID } from '@modules/on-error/error-codes'
import { decodeProtectedHeader, importJWK, jwtVerify, type JWK } from 'jose'
import { parseItem } from 'structured-headers'
import { verifyDeviceJwt } from '@ts-shared/session-jwt'
import { createCodedError } from '@modules/on-error/create-coded-error'
import { assertSessionUserAgent } from './client-binding.mts'
import { isSessionRevoked } from './revocation.mts'
import {
  consumeDbscChallenge,
  readWebSessionAuthority,
  sessionAuthorityRequired,
  type DbscChallenge,
  type WebSessionAuthority,
} from './dbsc-state.mts'
import type { FetchUserForSession, DbscAuthorization } from './types.mts'

const authorizations = new WeakSet<DbscAuthorization>()

export async function getWebRefreshAuthority(deviceToken: string, userAgent?: string) {
  const device = await verifyDeviceJwt(deviceToken)
  if (
    !device ||
    device.client !== 'web' ||
    !device.refresh_uid ||
    !device.refresh_sid ||
    !device.ua_hash ||
    typeof device.exp !== 'number' ||
    typeof device.iat !== 'number'
  )
    throw sessionAuthorityRequired()
  assertSessionUserAgent(device, userAgent)
  if (
    await isSessionRevoked(device.refresh_sid, { userId: device.refresh_uid, issuedAt: device.iat })
  )
    throw sessionAuthorityRequired()
  const state = await readWebSessionAuthority({
    uid: device.refresh_uid,
    did: device.did,
    sid: device.refresh_sid,
    uaHash: device.ua_hash,
    deviceExpiresAt: device.exp,
    deviceIssuedAt: device.iat,
  })
  return { ...state, device }
}

export async function authorizeDbscProof(options: {
  purpose: DbscChallenge['purpose']
  deviceToken: string
  userAgent?: string
  origin: string
  proofHeader: string
  sessionHeader?: string
  fetchUser: FetchUserForSession
}): Promise<DbscAuthorization> {
  if (!isCanonicalOrigin(options.origin, true)) throw invalidProof()
  const { authority, raw, device } = await getWebRefreshAuthority(
    options.deviceToken,
    options.userAgent,
  )
  const registering = options.purpose === 'registration'
  if (
    (registering && authority.kind !== 'unbound') ||
    (!registering && (authority.kind !== 'bound' || authority.origin !== options.origin)) ||
    (!registering && parseDbscString(options.sessionHeader) !== authority.sid)
  )
    throw invalidProof()
  const user = await options.fetchUser(authority.uid)
  if (!user || user.suspended_at) throw sessionAuthorityRequired()
  let publicKey: JWK
  let nonce: string
  try {
    const proof = parseDbscString(options.proofHeader)
    if (!proof) throw invalidProof()
    const header = decodeProtectedHeader(proof)
    if (!registering && header.jwk !== undefined) throw invalidProof()
    publicKey = registering ? registrationPublicKey(header.jwk) : authority.publicKey!
    const verified = await jwtVerify(proof, await importJWK(publicKey, 'ES256'), {
      algorithms: ['ES256'],
      typ: 'dbsc+jwt',
      requiredClaims: ['jti'],
    })
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
  const nextState: WebSessionAuthority | undefined = registering
    ? { ...authority, kind: 'bound', origin: options.origin, publicKey }
    : undefined
  if (
    !(await consumeDbscChallenge({
      nonce,
      challenge,
      expectedState: raw,
      nextState,
      deviceIssuedAt: device.iat!,
    }))
  )
    throw invalidProof()
  const authorization = Object.freeze({ sid: authority.sid })
  authorizations.add(authorization)
  return authorization
}

export async function assertWebSessionRefreshAllowed(
  expected: Parameters<typeof readWebSessionAuthority>[0],
  proof?: DbscAuthorization,
): Promise<boolean> {
  const { authority } = await readWebSessionAuthority(expected)
  if (authority.kind === 'unbound') return false
  if (!proof || !authorizations.has(proof) || proof.sid !== authority.sid)
    throw createCodedError(403, 'Device session proof required', DBSC_PROOF_REQUIRED)
  return true
}

export function parseDbscString(header: string | undefined): string | null {
  if (!header || header.length > 16_384) return null
  try {
    const [value] = parseItem(header)
    return typeof value === 'string' && value.length > 0 ? value : null
  } catch {
    return null
  }
}

function registrationPublicKey(jwk: JWK | undefined): JWK {
  if (
    !jwk ||
    jwk.kty !== 'EC' ||
    jwk.crv !== 'P-256' ||
    jwk.d !== undefined ||
    typeof jwk.x !== 'string' ||
    !/^[A-Za-z0-9_-]{43}$/u.test(jwk.x) ||
    typeof jwk.y !== 'string' ||
    !/^[A-Za-z0-9_-]{43}$/u.test(jwk.y)
  )
    throw invalidProof()
  return { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y }
}
function invalidProof(): Error {
  return createCodedError(400, 'Invalid device session proof', DBSC_PROOF_INVALID)
}
