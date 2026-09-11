import type { Context } from '@jongleberry/api-server'
import {
  DEVICE_EXPIRATION_SECONDS,
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
    maxAge: DEVICE_EXPIRATION_SECONDS,
  })
  ctx.cookies.set('st', st, {
    ...COOKIE_OPTIONS,
    maxAge: sessionExpirySecondsFor(deviceClass),
  })
}
