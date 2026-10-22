import type { Context } from '@jongleberry/api-server'
import { getExpectedOrigin } from '@modules/api-utils'
import { getSiteOrigin } from '@modules/utils/site-origin'
import { decodeDeviceJwt } from '@ts-shared/session-jwt'
import { createDbscRegistrationOffer } from '@services/jwt-session/dbsc-registration'

export const DBSC_REGISTRATION_PATH = '/api/v1/auth/device-bound-sessions'
export const DBSC_REFRESH_PATH = '/api/v1/auth/device-bound-sessions/refreshes'

export function getDbscOrigin(ctx: Context): string | null {
  try {
    const configured = new URL(getSiteOrigin())
    if (configured.protocol !== 'https:' || configured.username || configured.password) return null
    return getExpectedOrigin(ctx.req) === configured.origin ? configured.origin : null
  } catch {
    return null
  }
}

/** This helper is used only by successful credential-completion routes. */
export async function advertiseDbscRegistration(
  ctx: Context,
  deviceToken: { token: string; registrationEligible?: boolean },
): Promise<void> {
  const origin = getDbscOrigin(ctx)
  if (
    !origin ||
    !deviceToken.registrationEligible ||
    decodeDeviceJwt(deviceToken.token)?.client !== 'web'
  )
    return
  const nonce = await createDbscRegistrationOffer({
    deviceToken: deviceToken.token,
    userAgent: ctx.req.headers['user-agent'],
    origin,
  })
  if (nonce)
    ctx.set(
      'Secure-Session-Registration',
      `(ES256);path="${DBSC_REGISTRATION_PATH}";challenge="${nonce}"`,
    )
}

export function dbscSessionInstructions(sid: string, origin: string) {
  return {
    session_identifier: sid,
    refresh_url: new URL(DBSC_REFRESH_PATH, origin).toString(),
    scope: { origin, include_site: false },
    credentials: [
      { type: 'cookie' as const, name: 'st', attributes: 'Path=/; Secure; HttpOnly; SameSite=Lax' },
    ],
  }
}
