import { createPublicKey, verify } from 'node:crypto'
import type { GoogleOidcTrustMaterial } from './types.mts'

const MAX_JWT_BYTES = 16_384

export type GoogleOidcVerificationResult = 'valid' | 'invalid' | 'key_unavailable'

export function verifyGooglePubSubOidcJwt(
  token: string,
  trust: GoogleOidcTrustMaterial,
): GoogleOidcVerificationResult {
  if (Buffer.byteLength(token) > MAX_JWT_BYTES) return 'invalid'
  const [encodedHeader, encodedClaims, encodedSignature, ...extra] = token.split('.')
  if (!encodedHeader || !encodedClaims || !encodedSignature || extra.length) return 'invalid'
  const header = parsePart(encodedHeader)
  const claims = parsePart(encodedClaims)
  if (
    !isRecord(header) ||
    !isRecord(claims) ||
    header.alg !== 'RS256' ||
    typeof header.kid !== 'string'
  )
    return 'invalid'
  const key = trust.keysById[header.kid]
  if (!key) return 'key_unavailable'
  if (claims.iss !== trust.issuer || !audienceMatches(claims.aud, trust.audience)) return 'invalid'
  if (claims.email !== trust.serviceAccountEmail || claims.email_verified !== true) return 'invalid'
  if (
    !isFutureUnixTimestamp(claims.exp) ||
    !isPastUnixTimestamp(claims.iat) ||
    !hasBoundedLifetime(claims.iat, claims.exp)
  )
    return 'invalid'
  try {
    return verify(
      'RSA-SHA256',
      Buffer.from(`${encodedHeader}.${encodedClaims}`),
      createPublicKey({ key: key as never, format: 'jwk' }),
      Buffer.from(encodedSignature, 'base64url'),
    )
      ? 'valid'
      : 'invalid'
  } catch {
    return 'invalid'
  }
}
function hasBoundedLifetime(iat: unknown, exp: unknown): boolean {
  return typeof iat === 'number' && typeof exp === 'number' && exp - iat <= 3600
}

function parsePart(part: string): unknown {
  try {
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'))
  } catch {
    return null
  }
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
function audienceMatches(value: unknown, expected: string): boolean {
  return value === expected || (Array.isArray(value) && value.includes(expected))
}
function isFutureUnixTimestamp(value: unknown): boolean {
  return (
    typeof value === 'number' && Number.isSafeInteger(value) && value * 1000 > Date.now() - 60_000
  )
}
function isPastUnixTimestamp(value: unknown): boolean {
  return (
    typeof value === 'number' && Number.isSafeInteger(value) && value * 1000 <= Date.now() + 60_000
  )
}
