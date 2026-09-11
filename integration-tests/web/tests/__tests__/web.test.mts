import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { WebIntegrationClient } from '../../helpers/client.mts'

import { SEEDED_IDS, TEST_USER_EMAIL, TEST_USER_ID } from '../../helpers/constants.mts'

import { expectNoServerErrors, expectSecurityHeaders } from '../../helpers/assertions.mts'

import { createTestAuthCookies } from '../../helpers/auth.mts'

import '../route-baseline.mts'

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
    it('logs in through the worker and refreshes an authenticated session payload', async () => {
      const loginResponse = await client.login()
      expect(loginResponse.status).toBe(200)
      expectSecurityHeaders(loginResponse, false)

      const loginBody = (await loginResponse.json()) as {
        user: {
          email_address: string
          id: string
        }
      }
      expect(loginBody.user.id).toBe(TEST_USER_ID)
      expect(loginBody.user.email_address).toBe(TEST_USER_EMAIL)
      expect(loginResponse.headers.get('set-cookie')).toBeTruthy()

      const authCookies = await createTestAuthCookies(TEST_USER_ID)
      const sessionResponse = await client.request('/api/v1/session', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: authCookies,
      })
      expect(sessionResponse.status).toBe(200)
      expectSecurityHeaders(sessionResponse, false)

      const sessionBody = (await sessionResponse.json()) as {
        session: {
          did: string
          dt: string
          session: {
            did: string
            sid: string
            uid: string | null
          }
          sid: string
          st: string
          uid: string | null
        }
      }
      expect(sessionBody.session.uid).toBe(TEST_USER_ID)
      expect(sessionBody.session.session.uid).toBe(TEST_USER_ID)
      expect(sessionBody.session.dt).toBeTruthy()
      expect(sessionBody.session.st).toBeTruthy()
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
