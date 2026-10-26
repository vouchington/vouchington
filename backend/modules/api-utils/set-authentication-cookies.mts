import type { Context } from '@jongleberry/api-server'
import {
  DEVICE_EXPIRATION_SECONDS,
  decodeSessionJwt,
  decodeDeviceJwt,
  assertSafeSessionCookieValue,
  sessionExpirySecondsFor,
  type DeviceClass,
} from '@ts-shared/session-jwt'
import { isDeployedEnvironment } from '@ts-shared/deploy-environment'

// Shared base cookie options — import this anywhere dt/st cookies are set or cleared
// so all cookie attributes stay in sync.
export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: isDeployedEnvironment(),
  sameSite: 'lax' as const,
  path: '/',
}

export function setAuthenticationCookies(
  ctx: Context,
  { dt, st, deviceClass }: { dt: string; st: string; deviceClass?: DeviceClass },
): void {
  assertSafeSessionCookieValue('dt', dt)
  assertSafeSessionCookieValue('st', st)

  ctx.cookies.set('dt', dt, {
    ...COOKIE_OPTIONS,
    maxAge: getDeviceTokenCookieMaxAge(dt),
  })
  ctx.cookies.set('st', st, {
    ...COOKIE_OPTIONS,
    maxAge: getSessionTokenCookieMaxAge(st, deviceClass),
  })
}

export function clearAuthenticationCookies(ctx: Context): void {
  ctx.cookies.set('dt', '', { ...COOKIE_OPTIONS, maxAge: 0 })
  ctx.cookies.set('st', '', { ...COOKIE_OPTIONS, maxAge: 0 })
}

/** The cookie and response metadata must retain the signed credential's original expiry. */
export function getDeviceTokenCookieMaxAge(deviceToken: string): number {
  return Math.max(
    0,
    Math.min(
      DEVICE_EXPIRATION_SECONDS,
      (decodeDeviceJwt(deviceToken)?.exp ?? 0) - Math.floor(Date.now() / 1000),
    ),
  )
}

function getSessionTokenCookieMaxAge(sessionToken: string, deviceClass?: DeviceClass): number {
  const session = decodeSessionJwt(sessionToken)
  const signedExpiryMs = (session?.exp ?? 0) * 1000
  return Math.max(
    0,
    Math.min(
      sessionExpirySecondsFor(deviceClass, session?.client),
      Math.floor((signedExpiryMs - Date.now()) / 1000),
    ),
  )
}
