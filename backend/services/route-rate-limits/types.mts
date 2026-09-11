import type { DeviceClass } from '@ts-shared/session-jwt'

export type RouteRateLimitCategory = 'read' | 'write' | 'sensitive' | 'oauth_callback'

export type RouteRateLimitEntry = {
  category: RouteRateLimitCategory
  multiplier?: number
  ttlSeconds?: number
}

export type RateLimitIdentities = {
  ip?: string
  deviceId?: string
  sessionId?: string
  userId?: string
  userTrustTier?: number
  apiKeyId?: string
  /** Extra dimension for auth routes: rate-limits per email to prevent per-account brute force */
  email?: string
  /** Attested device class from Apple App Attest — used to apply the attested multiplier */
  deviceClass?: DeviceClass
}

export type RouteRateLimitResult = {
  limited: boolean
  retryAfterSeconds: number
  limit: number
  remaining: number
}
