import type { Context } from '@jongleberry/api-server'
import type { RefreshedSessionState } from '@services/jwt-session/types'
import { getDeviceTokenCookieMaxAge, COOKIE_OPTIONS } from '@modules/api-utils'
import { isNativeClientTransportRequest } from '@modules/request-client-info'
import { sessionExpirySecondsFor } from '@ts-shared/session-jwt'

interface SessionBody {
  dte: number
  ste: number
  secure: boolean
  did?: string
  dt?: string
  st?: string
  sid?: string
  uid?: string | null
  session?: {
    did: string
    sid: string
    uid: string | null
  }
}

export function buildSessionResponse(
  ctx: Context,
  sessionState: RefreshedSessionState,
): SessionBody {
  return {
    dte: getDeviceTokenCookieMaxAge(sessionState.dt),
    ste: sessionExpirySecondsFor(sessionState.deviceClass, sessionState.session.client),
    secure: COOKIE_OPTIONS.secure,
    did: sessionState.did,
    ...(isNativeClientTransportRequest(ctx.req) && { dt: sessionState.dt, st: sessionState.st }),
    sid: sessionState.sid,
    uid: sessionState.uid,
    session: sessionState.session,
  }
}
