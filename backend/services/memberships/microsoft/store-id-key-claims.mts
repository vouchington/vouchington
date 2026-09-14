const CLAIM_SCHEMES = ['http', 'https'] as const
const MAX_KEY_LIFETIME_SECONDS = 30 * 86_400
const CLOCK_SKEW_SECONDS = 5 * 60

export type MicrosoftStoreIdKeyKind = 'collections' | 'purchase'

/**
 * Decodes the non-authoritative claims that bind a Store ID key to this service and user.
 * Microsoft Store APIs, not this decoder, validate the key signature.
 */
export function validateMicrosoftStoreIdKeyClaims(options: {
  key: string
  kind: MicrosoftStoreIdKeyKind
  clientId: string
  userId: string
  now?: Date
}): { issuedAt: Date; expiresAt: Date } | null {
  const decoded = decodeJwt(options.key)
  const now = options.now ?? new Date()
  if (!decoded || !validHeader(decoded.header) || !validDate(now)) return null

  const { payload } = decoded
  const expectedAudience = `https://${options.kind}.mp.microsoft.com/v6.0/keys`
  if (payload.iss !== expectedAudience || payload.aud !== expectedAudience) return null
  if (
    claim(payload, 'clientId') !== options.clientId ||
    claim(payload, 'userId') !== options.userId ||
    !nonEmptyString(claim(payload, 'payload'))
  )
    return null

  const iat = payload.iat
  const nbf = payload.nbf
  const exp = payload.exp
  if (!epochSeconds(iat) || !epochSeconds(nbf) || !epochSeconds(exp)) return null

  const nowSeconds = Math.floor(now.getTime() / 1000)
  if (
    iat > nowSeconds + CLOCK_SKEW_SECONDS ||
    nbf > nowSeconds + CLOCK_SKEW_SECONDS ||
    exp <= nowSeconds ||
    iat > exp ||
    nbf > exp ||
    exp - iat > MAX_KEY_LIFETIME_SECONDS
  )
    return null

  return { issuedAt: new Date(iat * 1000), expiresAt: new Date(exp * 1000) }
}

function decodeJwt(
  value: string,
): { header: Record<string, unknown>; payload: Record<string, unknown> } | null {
  const parts = value.split('.')
  if (parts.length !== 3 || !parts.every(base64url)) return null
  const header = decodePart(parts[0]!)
  const payload = decodePart(parts[1]!)
  return record(header) && record(payload) ? { header, payload } : null
}

function decodePart(value: string): unknown {
  try {
    return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))
  } catch {
    return null
  }
}

function validHeader(header: Record<string, unknown>): boolean {
  return (
    header.typ === 'JWT' &&
    header.alg === 'RS256' &&
    (nonEmptyString(header.kid) || nonEmptyString(header.x5t))
  )
}

function claim(payload: Record<string, unknown>, name: 'clientId' | 'userId' | 'payload'): unknown {
  const values = CLAIM_SCHEMES.map(
    scheme => payload[`${scheme}://schemas.microsoft.com/marketplace/2015/08/claims/key/${name}`],
  ).filter(value => value !== undefined)
  return values.length === 1 ? values[0] : undefined
}

function base64url(value: string | undefined): boolean {
  return typeof value === 'string' && /^[A-Za-z0-9_-]+$/.test(value)
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function epochSeconds(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function validDate(value: Date): boolean {
  return Number.isFinite(value.getTime())
}
