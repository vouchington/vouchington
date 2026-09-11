import { createHash } from 'node:crypto'
import type { DeviceClass } from '@ts-shared/session-jwt'
import type { RateLimitIdentities } from './types.mts'

/** Minimal request interface needed for identity resolution. */
export interface RateLimitRequest {
  ip: string
  validatedApiKeyId?: string
  deviceClass?: DeviceClass
  getSessionTokenData(): Promise<{ did?: string; sid?: string; uid?: string; tt?: number }>
}

/**
 * Sanitize a route key for use as a Valkey key segment.
 * Replaces characters unsafe for Valkey keys with underscores.
 */
function sanitizeRouteKeySegment(routeKey: string): string {
  // Replace characters that could cause issues in Valkey keys
  return routeKey.replace(/[{}\s]/g, '_')
}

function isValidTrustTier(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 5
}

/**
 * Resolve rate limit identities from the request.
 *
 * Validated API key auth uses only IP + apiKeyId. Raw Authorization headers are
 * intentionally ignored here; callers must pass validatedApiKeyId only after an
 * upstream API-key verifier accepts the credential.
 *
 * Otherwise: IP + device/session from JWT cookies + userId if authenticated.
 */
export async function resolveRateLimitIdentities(
  req: RateLimitRequest,
): Promise<RateLimitIdentities> {
  const { ip, validatedApiKeyId } = req

  if (validatedApiKeyId) {
    return { ip, apiKeyId: validatedApiKeyId }
  }

  // Browser session path: extract device/session/user from cookies
  const sessionData = await req.getSessionTokenData()
  const deviceId = sessionData.did
  const sessionId = sessionData.sid
  const userId = sessionData.uid ?? undefined
  const userTrustTier = isValidTrustTier(sessionData.tt) ? sessionData.tt : undefined

  return {
    ip,
    deviceId,
    sessionId,
    userId: userId ?? undefined,
    userTrustTier,
    deviceClass: req.deviceClass,
  }
}

/**
 * Build Valkey rate limit keys for all identity dimensions.
 * Key format: `{dimension}:{id}:{routePrefix}`
 *
 * For API key auth: ip + apikey keys only.
 * For browser auth: ip + device + session + user (if authenticated).
 */
export function buildRateLimitKeys(routeKey: string, identities: RateLimitIdentities): string[] {
  const routePrefix = sanitizeRouteKeySegment(routeKey)
  const keys: string[] = []

  if (identities.apiKeyId) {
    // API key path: only IP + apikey dimensions
    if (identities.ip) keys.push(`ip:${identities.ip}:${routePrefix}`)
    keys.push(`apikey:${identities.apiKeyId}:${routePrefix}`)
    return keys
  }

  // Browser session path
  if (identities.ip) keys.push(`ip:${identities.ip}:${routePrefix}`)
  if (identities.deviceId) keys.push(`did:${identities.deviceId}:${routePrefix}`)
  if (identities.sessionId) keys.push(`sid:${identities.sessionId}:${routePrefix}`)
  if (identities.userId) keys.push(`uid:${identities.userId}:${routePrefix}`)
  if (identities.email) {
    // Hash email to avoid storing PII in Valkey keys
    const emailHash = createHash('sha256').update(identities.email).digest('hex').slice(0, 16)
    keys.push(`email:${emailHash}:${routePrefix}`)
  }

  return keys
}
