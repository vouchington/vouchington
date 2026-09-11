import {
  decodeSessionJwt,
  verifyDeviceJwt,
  verifySessionJwt,
  type DeviceTokenPayload,
  type SessionTokenPayload,
} from '@ts-shared/session-jwt'
import { isProductionMode } from '../production-mode.mts'
import type { Env } from '../types.mts'

let sessionJwtVerificationErrorLogged = false

export type SessionCachePayload = {
  uid: string
  tt?: number
  rol?: readonly string[]
  mpl?: string | null
  /**
   * Preferred UI locale claim (see ts-shared/session-jwt's SessionTokenPayload).
   * Currently only ever set on authenticated (uid !== null) sessions (see
   * backend/services/jwt-session/create.mts) — the same population this
   * function already restricts itself to below — so this is populated
   * whenever it exists on the underlying JWT, not gated further here.
   */
  uil?: string | null
}

export type BackendSessionTokenPayloads = {
  devicePayload: DeviceTokenPayload | null
  sessionPayload: SessionTokenPayload | null
  sessionCachePayload: SessionCachePayload | null
}

// Pure classification of an already-verified payload pair. Split out from
// verifyBackendSessionTokens so it can be reused (and unit-tested) without re-running crypto.
export const deriveSessionCachePayload = (
  devicePayload: DeviceTokenPayload | null,
  sessionPayload: SessionTokenPayload | null,
): SessionCachePayload | null => {
  if (!devicePayload) {
    return null
  }
  if (!sessionPayload) {
    return null
  }

  if (devicePayload.did !== sessionPayload.did) {
    return null
  }

  if (typeof sessionPayload.uid !== 'string' || sessionPayload.uid.length === 0) {
    return null
  }

  if (typeof sessionPayload.sid !== 'string' || sessionPayload.sid.length === 0) {
    return null
  }

  return {
    uid: sessionPayload.uid,
    tt: sessionPayload.tt,
    rol: sessionPayload.rol,
    mpl: sessionPayload.mpl,
    uil: sessionPayload.uil,
  }
}

// Verifies the backend-signed dt/st pair exactly once per request and folds in the derived
// cache-classification payload, so callers needing both never re-run crypto for the second one.
// Only runs when BOTH cookies are present — a lone dt is checked independently, and only after
// rate-limiting, by session-mint.mts's isBackendIssuedAnonSession (see its doc comment); verifying
// it here too would spend an RSA verify on every rate-limited/bot/federation dt-only request
// before any decision needs it. See docs/overview/architecture/anon-html-edge-caching-csp.md for
// why the dt+st pair is verified at all.
//
// Verifies the backend-signed dt/st pair once per request. Returns all three derived
// payloads — the cache-classification payload (authenticated-only) and the raw device/session
// payloads for callers that need the anon-passthrough decision without re-running crypto.
// Cache classification only: this does NOT authenticate the user. The backend
// remains authoritative for real session validity and revocation.
export const verifyBackendSessionTokens = async (
  deviceToken: string | null,
  sessionToken: string | null,
  env: Env,
): Promise<BackendSessionTokenPayloads> => {
  if (!deviceToken || !sessionToken) {
    return { devicePayload: null, sessionPayload: null, sessionCachePayload: null }
  }

  try {
    const jwtOptions = {
      env,
      mode: isProductionMode(env) ? 'production' : 'development',
    } as const
    const [devicePayload, sessionPayload] = await Promise.all([
      verifyDeviceJwt(deviceToken, jwtOptions),
      verifySessionJwt(sessionToken, jwtOptions),
    ])
    return {
      devicePayload,
      sessionPayload,
      sessionCachePayload: deriveSessionCachePayload(devicePayload, sessionPayload),
    }
  } catch (error) {
    if (!sessionJwtVerificationErrorLogged) {
      console.error(
        `Session JWT verification failed: ${error instanceof Error ? error.message : String(error)}`,
      )
      sessionJwtVerificationErrorLogged = true
    }
    return { devicePayload: null, sessionPayload: null, sessionCachePayload: null }
  }
}

// True when `sessionToken` decodes (WITHOUT signature/expiry verification) to a payload
// claiming a real user (`uid` non-null). A validly-signed `st` with `uid: null` is the normal
// state for a returning anonymous visitor (see session-mint.mts's isBackendIssuedAnonSession,
// which treats it as an ordinary passthrough, not an error) and must not be flagged here —
// only a token that once claimed authentication indicates a real auth attempt worth forcing a
// cache bypass for. Undecodable/garbage tokens also return false: they carry no auth claim to
// lose, so they're indistinguishable from "no session cookie" for this purpose. Decoding
// without verifying is safe here because the result only ever widens a cache *bypass* decision
// (never grants access) — see verifyBackendSessionTokens's doc comment.
export const isAuthShapedSessionToken = (sessionToken: string | null): boolean => {
  if (!sessionToken) return false
  const decoded = decodeSessionJwt(sessionToken)
  return decoded !== null && decoded.uid !== null
}
