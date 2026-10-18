import type { DeviceClass } from '@ts-shared/session-jwt'
import type { RateLimitIdentities } from './types.mts'

/** Minimal request interface needed for identity resolution. */
export interface RateLimitRequest {
  ip: string
  validatedApiKeyId?: string
  deviceClass?: DeviceClass
  getSessionTokenData(): Promise<{ did?: string; sid?: string; uid?: string; tt?: number }>
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

/** Selects Voucha's rate-limit identity dimensions; API keys exclude browser session keys. */
export function getRateLimitKeyDimensions(
  identities: RateLimitIdentities,
): Record<string, string | undefined> {
  if (identities.apiKeyId) {
    return { ip: identities.ip, apikey: identities.apiKeyId }
  }
  return {
    ip: identities.ip,
    did: identities.deviceId,
    sid: identities.sessionId,
    uid: identities.userId,
    email: identities.email,
  }
}
