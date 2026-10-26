import { isDbscRegistrationEligible } from '@services/jwt-session/dbsc-eligibility'
import type { Context } from '@jongleberry/api-server'
import { COOKIE_OPTIONS, getExpectedOrigin } from '@modules/api-utils'
import { getTrustedClientJa4 } from '@modules/request-client-info/cloudflare-signals'
import { getSiteOrigin } from '@modules/utils/site-origin'
import { decodeDeviceJwt, verifyDeviceJwt } from '@ts-shared/session-jwt'
import { createDbscRegistrationOffer } from '@services/jwt-session/dbsc-registration'
import { isNativeClientTransportRequest } from '@modules/request-client-info'
import onError from '@modules/on-error'
import {
  DBSC_REGISTRATION_PATH,
  DBSC_REFRESH_PATH,
} from '@modules/request-client-info/browser-session-protocol'

// A missing browser key must never block logout, login or credential bootstrap before the
// server sees them. Chrome matches cookie-style path prefixes (no glob suffix); the
// authentication and OAuth prefixes cover only their dynamic challenge/flow descendants.
const RECOVERY_PATHS = [
  '/login',
  '/session-renewal',
  '/api/v1/auth/logout',
  '/api/v1/session',
  DBSC_REGISTRATION_PATH,
  '/api/v1/auth/email-address/tokens',
  '/api/v1/auth/email-address/login',
  '/api/v1/auth/passkeys/authentication/',
  '/api/v1/auth/mfa/totp/verification',
  '/api/v1/auth/mfa/passkeys/authentication/',
  '/api/v1/auth/oauth/',
] as const

export function getDbscOrigin(ctx: Context): string | null {
  try {
    const configured = new URL(getSiteOrigin())
    if (configured.protocol !== 'https:' || configured.username || configured.password) return null
    return getExpectedOrigin(ctx.req) === configured.origin ? configured.origin : null
  } catch {
    return null
  }
}

/** A signed web device identifies its own finite DBSC budget; invalid callers keep the IP cap. */
export async function applyDbscRouteRateLimit(ctx: Context, routeKey: string): Promise<void> {
  const token = ctx.cookies.get('dt')
  const device = token ? await verifyDeviceJwt(token) : null
  if (device?.client === 'web' && device.refresh_uid && device.refresh_sid && device.did) {
    await ctx.applyRouteRateLimit(routeKey, {
      identityMode: 'verified-dbsc',
      verifiedDbscIdentity: {
        deviceId: device.did,
        sessionId: device.refresh_sid,
        userId: device.refresh_uid,
      },
    })
    return
  }
  await ctx.applyRouteRateLimit(routeKey, { identityMode: 'ip-only' })
}

/** Only successful credential completion can offer a new registration. */
export async function advertiseDbscRegistration(
  ctx: Context,
  deviceToken: { token: string },
): Promise<void> {
  if (isNativeClientTransportRequest(ctx.req)) return
  const origin = getDbscOrigin(ctx)
  if (
    !origin ||
    !isDbscRegistrationEligible(deviceToken) ||
    decodeDeviceJwt(deviceToken.token)?.client !== 'web'
  )
    return
  let nonce: string | null
  try {
    nonce = await createDbscRegistrationOffer({
      deviceToken: deviceToken.token,
      userAgent: ctx.req.headers['user-agent'],
      ja4: getTrustedClientJa4(ctx.req),
      origin,
    })
  } catch (err) {
    // The optional offer must not invalidate a credential completion already committed.
    onError(err instanceof Error ? err : new Error(String(err)))
    return
  }
  if (nonce)
    ctx.set(
      'Secure-Session-Registration',
      `(ES256);path="${DBSC_REGISTRATION_PATH}";challenge="${nonce}"`,
    )
}

export function dbscSessionInstructions(sid: string, origin: string) {
  const attributes = [
    `Path=${COOKIE_OPTIONS.path}`,
    ...(COOKIE_OPTIONS.secure ? ['Secure'] : []),
    ...(COOKIE_OPTIONS.httpOnly ? ['HttpOnly'] : []),
    `SameSite=${COOKIE_OPTIONS.sameSite[0]!.toUpperCase()}${COOKIE_OPTIONS.sameSite.slice(1)}`,
  ].join('; ')
  return {
    session_identifier: sid,
    refresh_url: new URL(DBSC_REFRESH_PATH, origin).toString(),
    scope: {
      origin,
      include_site: false,
      scope_specification: RECOVERY_PATHS.map(path => ({ type: 'exclude' as const, path })),
    },
    credentials: [{ type: 'cookie' as const, name: 'st', attributes }],
  }
}
