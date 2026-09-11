import {
  EDGE_ANON_SESSION_JWT_ISSUER,
  ensureAnonymousSession as defaultEnsureAnonymousSession,
  verifyDeviceJwt,
  type DeviceClass,
  type DeviceTokenPayload,
  type SessionTokenPayload,
} from '@ts-shared/session-jwt'
import type { SessionCachePayload } from './jwt.mts'
import { isProductionMode } from '../production-mode.mts'
import type { Env } from '../types.mts'

export type EnsuredSession =
  | { kind: 'authenticated'; uid: string }
  | { kind: 'anon-passthrough' }
  | {
      kind: 'anon-minted'
      dt: string
      st: string
      mintedDt: boolean
      mintedSt: boolean
      dc?: DeviceClass
    }
  | { kind: 'unavailable' }

let privateKeyMissingLogged = false
let backendIssuedAnonSessionVerificationErrorLogged = false

type EnsureAnonymousSession = typeof defaultEnsureAnonymousSession

function isLocalWorkerDevelopment(env: Env): boolean {
  return isLocalOrigin(env.WEB_ORIGIN) || isLocalOrigin(env.BACKEND_ORIGIN)
}

function isLocalOrigin(origin: string | undefined): boolean {
  if (!origin) return false
  try {
    const hostname = new URL(origin).hostname
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
  } catch {
    return false
  }
}

// A dt/st pair minted by the backend under its default issuer — e.g. an attested
// device's dc-bearing 30-day session — must pass through unchanged. The edge-anon
// mint path below only recognizes tokens signed with EDGE_ANON_SESSION_JWT_ISSUER,
// so without this check it would treat every backend-issued anon session as invalid
// and silently replace it (dropping `dc` and truncating the session back to the
// default expiry) on the very next unauthenticated request.
//
// A backend-issued dt also survives on its own when st is missing, expired, or
// otherwise fails to verify — verifyBackendSessionTokens resolves sessionPayload to
// null for any missing/malformed/expired/wrong-issuer token rather than throwing, so
// `sessionPayload === null` here means "st absent or unusable," not "st irrelevant to
// this call." The backend's own refreshSessionState() already re-mints st from a valid
// dt in that case while preserving dc (see jwt-session/flows.mts), so the edge must not
// race ahead and replace the dt with a fresh, unattested one first. A *present but
// did-mismatched* st (sessionPayload !== null but does not pair with dt) still falls
// through to the edge-anon mint path below, since that combination indicates a
// confused/tampered cookie jar rather than an st that simply hasn't been (re)issued yet.
//
// When `sessionToken` is present, `devicePayload`/`sessionPayload` are already-verified — see
// jwt.mts's verifyBackendSessionTokens, which runs the crypto once per request for both this
// decision and cache classification, and reusing them here avoids re-running it. But
// verifyBackendSessionTokens only verifies when BOTH cookies are present, so a lone dt (no st)
// arrives here unverified; that case independently verifies dt on its own, deferred to this call
// (post-rate-limit, and skipped entirely for bot/federation paths that never reach ensureSession)
// rather than unconditionally on every request.
export async function isBackendIssuedAnonSession(
  deviceToken: string | null,
  sessionToken: string | null,
  devicePayload: DeviceTokenPayload | null,
  sessionPayload: SessionTokenPayload | null,
  env: Env,
): Promise<boolean> {
  if (!deviceToken) return false

  if (sessionToken) {
    if (devicePayload === null) return false
    if (sessionPayload === null) return true
    return devicePayload.did === sessionPayload.did && sessionPayload.uid === null
  }

  try {
    const jwtOptions = { env, mode: isProductionMode(env) ? 'production' : 'development' } as const
    const soloDevicePayload = await verifyDeviceJwt(deviceToken, jwtOptions)
    return soloDevicePayload !== null
  } catch (error) {
    if (!backendIssuedAnonSessionVerificationErrorLogged) {
      console.error(
        `Backend-issued-anon-session verification failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
      backendIssuedAnonSessionVerificationErrorLogged = true
    }
    return false
  }
}

export async function ensureSession(
  cookies: Map<string, string>,
  cachePayload: SessionCachePayload | null,
  devicePayload: DeviceTokenPayload | null,
  sessionPayload: SessionTokenPayload | null,
  env: Env,
  dependencies: { ensureAnonymousSession?: EnsureAnonymousSession } = {},
): Promise<EnsuredSession> {
  // Authenticated: backend handles session refresh via warm/cold path
  if (cachePayload) {
    return { kind: 'authenticated', uid: cachePayload.uid }
  }

  const deviceToken = cookies.get('dt') ?? null
  const sessionToken = cookies.get('st') ?? null

  if (
    await isBackendIssuedAnonSession(deviceToken, sessionToken, devicePayload, sessionPayload, env)
  ) {
    return { kind: 'anon-passthrough' }
  }

  const isProduction = isProductionMode(env)
  const requiresConfiguredEdgeKeys = !isLocalWorkerDevelopment(env) && env.PRODUCTION !== undefined
  const edgePrivateKeys = env.VOUCHA_EDGE_ANON_SESSION_JWT_PRIVATE_KEYS_B64
  const edgePublicKeys = env.VOUCHA_EDGE_ANON_SESSION_JWT_PUBLIC_KEYS_B64
  if (requiresConfiguredEdgeKeys && (!edgePrivateKeys || !edgePublicKeys)) {
    if (!privateKeyMissingLogged) {
      console.warn(
        'VOUCHA_EDGE_ANON_SESSION_JWT_PRIVATE_KEYS_B64 and VOUCHA_EDGE_ANON_SESSION_JWT_PUBLIC_KEYS_B64 are required in deployed Worker environments — anonymous visitors will not receive dt/st cookies.',
      )
      privateKeyMissingLogged = true
    }
    return { kind: 'unavailable' }
  }
  const privateKeys = edgePrivateKeys
  const publicKeys = edgePublicKeys

  const mode = isProduction ? 'production' : 'development'

  const ensureAnonymousSession =
    dependencies.ensureAnonymousSession ?? defaultEnsureAnonymousSession
  const result = await ensureAnonymousSession({
    deviceToken,
    sessionToken,
    env: {
      VOUCHA_SESSION_JWT_PRIVATE_KEYS_B64: privateKeys,
      VOUCHA_SESSION_JWT_PUBLIC_KEYS_B64: publicKeys,
    },
    issuer: EDGE_ANON_SESSION_JWT_ISSUER,
    mode,
  })

  if (!result.mintedDt && !result.mintedSt) {
    return { kind: 'anon-passthrough' }
  }

  return {
    kind: 'anon-minted',
    dt: result.dt,
    st: result.st,
    mintedDt: result.mintedDt,
    mintedSt: result.mintedSt,
    dc: result.dc,
  }
}
