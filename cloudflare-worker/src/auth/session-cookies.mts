import {
  deviceCookieAttributes,
  serializeSessionCookie,
  sessionCookieAttributes,
} from '@ts-shared/session-jwt'
import { appendHeaders } from '../proxy.mts'
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
  return appendHeaders(response, setCookies)
}
