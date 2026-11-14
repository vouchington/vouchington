import {
  deviceCookieAttributes,
  serializeSessionCookie,
  sessionCookieAttributes,
} from '@ts-shared/session-jwt'
import { appendHeaders, NO_STORE_HEADERS, withHeaders } from '@vouchington/edge'
import type { EnsuredSession } from './session-mint.mts'

export function withEdgeSessionCookies(
  response: Response,
  edgeSession: EnsuredSession,
  secure: boolean,
): Response {
  if (edgeSession.kind !== 'anon-minted') return response
  const setCookies: Array<readonly [string, string]> = []
  if (edgeSession.mintedDt) {
    setCookies.push([
      'set-cookie',
      serializeSessionCookie('dt', edgeSession.dt, deviceCookieAttributes(secure)),
    ])
  }
  if (edgeSession.mintedSt) {
    setCookies.push([
      'set-cookie',
      serializeSessionCookie('st', edgeSession.st, sessionCookieAttributes(secure, edgeSession.dc)),
    ])
  }
  if (setCookies.length === 0) return response
  // The shared cache entry stays public; only this visitor's cookie-bearing response is private.
  return withHeaders(appendHeaders(response, setCookies), NO_STORE_HEADERS)
}
