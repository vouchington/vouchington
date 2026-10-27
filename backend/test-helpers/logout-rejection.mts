import { expect } from 'vitest'
import { isSessionRevoked } from '../services/jwt-session/index.mts'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestSessionCookies } from '@voucha/test-helpers/services/jwt-session/index'

// A rejected logout still clears browser credentials; request validation must prevent
// push-cleanup side effects. The owning credential still ends its own session.
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
  const cleared = response.headers['set-cookie'] as unknown as string[]
  expect(cleared.findLast(cookie => cookie.startsWith('dt='))).toContain('Max-Age=0')
  expect(cleared.findLast(cookie => cookie.startsWith('st='))).toContain('Max-Age=0')
  await expect(isSessionRevoked(cookies.sid, { userId: cookies.userId })).resolves.toBe(true)
  return cookies
}
