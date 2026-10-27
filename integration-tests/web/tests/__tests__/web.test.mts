import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { WebIntegrationClient } from '../../helpers/client.mts'

import { PLAYWRIGHT_CHROME_UA, SEEDED_IDS, TEST_USER_ID } from '../../helpers/constants.mts'

import { expectNoServerErrors, expectSecurityHeaders } from '../../helpers/assertions.mts'

import {
  generateTestTotpCode,
  generateTestTotpSecret,
  insertTestTotpAuthenticator,
} from '../../../../backend/test-helpers/entities/totp.mts'

import '../route-baseline.mts'
import '../owner-private-route-redirects.mts'
import '../topic-source-settings-contract.mts'

import '../routes.mts'

import '../seo.mts'

import '../static-seo.mts'

import '../website-spec.mts'

import '../worker-routing.mts'

describe('web', () => {
  const workerOrigin = process.env.WEB_INTEGRATION_WORKER_ORIGIN

  const traceOrigin = process.env.WEB_INTEGRATION_TRACE_ORIGIN

  const artifactsDir = process.env.WEB_INTEGRATION_ARTIFACTS_DIR

  if (!workerOrigin || !traceOrigin || !artifactsDir) {
    throw new Error('Web integration environment is not configured')
  }

  let client: WebIntegrationClient

  beforeEach(() => {
    client = new WebIntegrationClient(workerOrigin, traceOrigin, artifactsDir)
  })

  afterEach(() => {
    client.clearCookies()
  })

  describe('public page loads', () => {
    it('loads /login and verifies HTML security headers and static assets', async () => {
      const result = await client.loadPage('/login', 'login-page')

      expect(result.response.status).toBe(200)
      expect(result.html.toLowerCase()).toContain('continue with email')
      expectSecurityHeaders(result.response, true)
      expectNoServerErrors(result.tracedRequests, '/login')
      expect(result.assets.length).toBeGreaterThan(0)
      expect(result.assets.every(asset => asset.status < 400)).toBe(true)
      expect(result.requestId).toBeTruthy()
    })

    it('loads a seeded discussion page without backend 500s', async () => {
      const result = await client.loadPage(
        `/discussion/${SEEDED_IDS.discussion}`,
        'discussion-page',
      )

      expect(result.response.status).toBe(200)
      expect(result.html).toContain('<h1')
      expectNoServerErrors(result.tracedRequests, 'discussion page')
      expect(result.tracedRequests.some(request => request.path.includes('/api/v1/posts/'))).toBe(
        true,
      )
    })

    it('loads a seeded topic page without backend 500s', async () => {
      const result = await client.loadPage(`/card/${SEEDED_IDS.topic}/discussions`, 'topic-page')

      expect(result.response.status).toBe(200)
      expect(result.html).toContain('<h1')
      expectNoServerErrors(result.tracedRequests, 'topic page')
      expect(result.tracedRequests.some(request => request.path.includes('/api/v1/topics/'))).toBe(
        true,
      )
    })
  })

  describe('authentication', () => {
    it('completes administrator MFA through the worker and refreshes that session', async () => {
      const secret = generateTestTotpSecret()
      await insertTestTotpAuthenticator(TEST_USER_ID, 'web-integration-login', undefined, secret)
      const browserHeaders = { 'Sec-Fetch-Site': 'same-origin' }
      const loginResponse = await client.login({
        userAgent: PLAYWRIGHT_CHROME_UA,
        headers: browserHeaders,
      })
      expect(loginResponse.status).toBe(200)
      expectSecurityHeaders(loginResponse, false)

      const loginBody = (await loginResponse.json()) as {
        mfa_required: boolean
        login_attempt_id: string
      }
      expect(loginBody.mfa_required).toBe(true)
      expect(loginBody.login_attempt_id).toEqual(expect.any(String))

      const verifiedResponse = await client.request('/api/v1/auth/mfa/totp/verification', {
        method: 'POST',
        userAgent: PLAYWRIGHT_CHROME_UA,
        headers: { 'Content-Type': 'application/json', ...browserHeaders },
        body: {
          login_attempt_id: loginBody.login_attempt_id,
          code: generateTestTotpCode(secret),
        },
      })
      expect(verifiedResponse.status).toBe(200)
      const verifiedBody = (await verifiedResponse.json()) as {
        user: { id: string }
        session: { uid: string | null; mfa_at?: number }
      }
      expect(verifiedBody.user.id).toBe(TEST_USER_ID)
      expect(verifiedBody.session.uid).toBe(TEST_USER_ID)
      expect(verifiedBody.session.mfa_at).toEqual(expect.any(Number))
      expect(verifiedResponse.headers.get('set-cookie')).toBeTruthy()

      const dt = client.getCookie('dt')
      const st = client.getCookie('st')
      expect(dt).toBeTruthy()
      expect(st).toBeTruthy()

      const sessionResponse = await client.request('/api/v1/session', {
        method: 'PATCH',
        userAgent: PLAYWRIGHT_CHROME_UA,
        headers: {
          'Content-Type': 'application/json',
          ...browserHeaders,
        },
        body: {},
      })
      const sessionTrace = await client.getTraceRequests(
        sessionResponse.headers.get('x-request-id'),
      )
      const patchTrace = sessionTrace.find(
        request => request.method === 'PATCH' && request.path === '/api/v1/session',
      )
      expect(patchTrace).toBeDefined()
      expect(patchTrace?.cookieHeader?.includes(`dt=${dt}`)).toBe(true)
      expect(patchTrace?.cookieHeader?.includes(`st=${st}`)).toBe(true)
      expect(sessionResponse.status).toBe(200)
      expectSecurityHeaders(sessionResponse, false)

      const sessionBody = (await sessionResponse.json()) as {
        session: {
          did: string
          session: {
            did: string
            sid: string
            uid: string | null
          }
          sid: string
          uid: string | null
        }
      }
      expect(sessionBody.session.uid).toBe(TEST_USER_ID)
      expect(sessionBody.session.session.uid).toBe(TEST_USER_ID)
      expect(sessionBody.session).not.toHaveProperty('dt')
      expect(sessionBody.session).not.toHaveProperty('st')
      expect(sessionResponse.headers.getSetCookie()).toEqual(
        expect.arrayContaining([expect.stringMatching(/^dt=/), expect.stringMatching(/^st=/)]),
      )
    })

    it('redirects unauthenticated users from /my/identity and clears access again after logout', async () => {
      const anonymousResponse = await client.request('/my/identity', { redirect: 'manual' })
      expect(anonymousResponse.status).toBeGreaterThanOrEqual(300)
      expect(anonymousResponse.headers.get('location')).toContain('/login')

      const logoutResponse = await client.logout()
      expect(logoutResponse.status).toBe(204)
      expect(logoutResponse.headers.get('set-cookie')).toBeTruthy()

      const afterLogout = await client.request('/my/identity', { redirect: 'manual' })
      expect(afterLogout.status).toBeGreaterThanOrEqual(300)
      expect(afterLogout.headers.get('location')).toContain('/login')
    })
  })
})
