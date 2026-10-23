import {
  decodeJwt,
  signJwt,
  verifyJwt,
  type JwtKeySet,
  isUuidv7 as isUUIDv7,
  validateUuidv7 as validateUUIDv7,
} from '@vouchington/session-jwt'
import { decodeProtectedHeader, type JWTPayload } from 'jose'
import { validate as isUUID } from 'uuid'
import { getResolvedKeySet } from './keys.mts'
import {
  SESSION_JWT_ISSUER,
  SESSION_JWT_PRIVATE_KEYS_ENV,
  DEVICE_TOKEN_AUDIENCE,
  SESSION_TOKEN_AUDIENCE,
  isOptionalDeviceClass,
  type JwtSignOptions,
  type JwtRuntimeOptions,
  type DeviceTokenPayload,
  type SessionTokenPayload,
} from './types.mts'
async function verificationKeySet(
  keySet: JwtKeySet,
  kid: string | undefined,
): Promise<JwtKeySet | null> {
  const candidates =
    typeof kid === 'string' && kid.length > 0
      ? keySet.publicKeys.filter(key => key.jwk.kid === kid)
      : keySet.publicKeys
  if (candidates.length === 0) return null
  const publicKeys = candidates.map(key => ({
    ...key,
    // Empty legacy kid values used every configured key before key rotation gained kids.
    jwk: kid === '' ? { ...key.jwk, kid: '' } : key.jwk,
  }))
  if (publicKeys.length === 0) return null
  return {
    privateKeys: [],
    publicKeys,
  }
}
export function decodeSessionJwt(token: string): SessionTokenPayload | null {
  const payload = decodeJwt(token)
  return payload && isValidSessionPayload(payload) ? payload : null
}
function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}
function isOptionalFiniteNumber(value: unknown): value is number | undefined {
  return value === undefined || (typeof value === 'number' && Number.isFinite(value))
}
function isValidDevicePayload(payload: JWTPayload): payload is DeviceTokenPayload {
  return isNonEmptyString(payload.did) && isUUIDv7(payload.did) && isOptionalDeviceClass(payload.dc)
}

function isValidSessionPayload(payload: JWTPayload): payload is SessionTokenPayload {
  return (
    isNonEmptyString(payload.did) &&
    isUUIDv7(payload.did) &&
    isNonEmptyString(payload.sid) &&
    isUUIDv7(payload.sid) &&
    (payload.uid === null || (isNonEmptyString(payload.uid) && isUUID(payload.uid))) &&
    (payload.rol === undefined ||
      (Array.isArray(payload.rol) && payload.rol.every(role => typeof role === 'string'))) &&
    (payload.mpl === undefined || payload.mpl === null || typeof payload.mpl === 'string') &&
    isOptionalFiniteNumber(payload.mpe) &&
    isOptionalFiniteNumber(payload.tt) &&
    isOptionalFiniteNumber(payload.rca) &&
    isOptionalFiniteNumber(payload.sca) &&
    (payload.uil === undefined || payload.uil === null || typeof payload.uil === 'string')
  )
}
export async function signDeviceJwt(
  payload: DeviceTokenPayload,
  options: JwtSignOptions,
): Promise<string> {
  validateUUIDv7(payload.did)
  const keySet = await getResolvedKeySet(options)
  const signingKey = keySet.privateKeys[0]
  if (!signingKey) throw new Error(`${SESSION_JWT_PRIVATE_KEYS_ENV} must be configured for signing`)
  return signJwt(payload, {
    keySet,
    issuer: options.issuer ?? SESSION_JWT_ISSUER,
    audience: DEVICE_TOKEN_AUDIENCE,
    expiresIn: options.expiresIn,
    ...(options.issuedAt === undefined ? {} : { issuedAt: options.issuedAt }),
  })
}

export async function signSessionJwt(
  payload: SessionTokenPayload,
  options: JwtSignOptions,
): Promise<string> {
  validateUUIDv7(payload.did)
  validateUUIDv7(payload.sid)
  if (payload.uid !== null && !isUUID(payload.uid)) throw new Error('Invalid UUIDv7')
  const keySet = await getResolvedKeySet(options)
  const signingKey = keySet.privateKeys[0]
  if (!signingKey) throw new Error(`${SESSION_JWT_PRIVATE_KEYS_ENV} must be configured for signing`)
  return signJwt(payload, {
    keySet,
    issuer: options.issuer ?? SESSION_JWT_ISSUER,
    audience: SESSION_TOKEN_AUDIENCE,
    expiresIn: options.expiresIn,
    ...(options.issuedAt === undefined ? {} : { issuedAt: options.issuedAt }),
  })
}

export async function verifyDeviceJwt(
  token: string,
  options?: JwtRuntimeOptions,
): Promise<DeviceTokenPayload | null> {
  let header
  try {
    header = decodeProtectedHeader(token)
  } catch {
    return null
  }
  const keySet = await getResolvedKeySet(options)
  const adapted = await verificationKeySet(keySet, header.kid)
  if (!adapted) return null
  try {
    return await verifyJwt(token, {
      keySet: adapted,
      issuer: options?.issuer ?? SESSION_JWT_ISSUER,
      audience: DEVICE_TOKEN_AUDIENCE,
      validatePayload: isValidDevicePayload,
    })
  } catch {
    return null
  }
}

export async function verifySessionJwt(
  token: string,
  options?: JwtRuntimeOptions,
): Promise<SessionTokenPayload | null> {
  let header
  try {
    header = decodeProtectedHeader(token)
  } catch {
    return null
  }
  const keySet = await getResolvedKeySet(options)
  const adapted = await verificationKeySet(keySet, header.kid)
  if (!adapted) return null
  try {
    return await verifyJwt(token, {
      keySet: adapted,
      issuer: options?.issuer ?? SESSION_JWT_ISSUER,
      audience: SESSION_TOKEN_AUDIENCE,
      validatePayload: isValidSessionPayload,
    })
  } catch {
    return null
  }
}
