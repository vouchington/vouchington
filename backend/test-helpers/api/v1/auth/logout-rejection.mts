import { expect } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestSessionCookies } from '@voucha/test-helpers/services/jwt-session/index'

// Issues a logout POST expected to be rejected (4xx) before any cookie-clearing or
// session-revocation side effect runs, and asserts the response carries no Set-Cookie header --
// the shared proof, across every "logout rejects a malformed/invalid request" scenario, that the
// route's manual or contract validation short-circuits ahead of its cookie-clearing logic.
// Returns the request's own cookies/identity so a caller can layer on a scenario-specific
// assertion (e.g. that the session was never revoked, or that the tokens still verify).
export async function postLogoutExpectingRejection(params: {
  body: string | Record<string, unknown>
  expectedStatus: number
  contentType?: string
}): Promise<{ dtCookie: string; stCookie: string; userId: string; sid: string }> {
  const cookies = await createTestSessionCookies()
  let req = createRequest()
    .post('/api/v1/auth/logout')
    .set('Cookie', [cookies.dtCookie, cookies.stCookie])
    .set('Sec-Fetch-Site', 'same-origin')
  if (params.contentType !== undefined) {
    req = req.set('Content-Type', params.contentType)
  }
  const response = await req.send(params.body).expect(params.expectedStatus)
  expect(response.headers['set-cookie']).toBeUndefined()
  return cookies
}
