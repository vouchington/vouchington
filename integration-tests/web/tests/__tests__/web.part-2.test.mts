import { randomUUID } from 'node:crypto'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { WebIntegrationClient } from '../../helpers/client.mts'

import {
  GOOGLEBOT_UA,
  PLAYWRIGHT_CHROME_UA,
  SEEDED_IDS,
  TEST_USER_ID,
} from '../../helpers/constants.mts'

import { expectNoServerErrors, expectSecurityHeaders } from '../../helpers/assertions.mts'

import { createTestAuthCookies } from '../../helpers/auth.mts'

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

  describe('Playwright browser simulation', () => {
    it('loads a page with Playwright Chrome UA and receives complete HTML', async () => {
      const result = await client.loadPage('/login', 'playwright-login', {
        userAgent: PLAYWRIGHT_CHROME_UA,
      })

      expect(result.response.status).toBe(200)
      expect(result.html.toLowerCase()).toContain('</html>')
      expect(result.html.toLowerCase()).toContain('continue with email')
      expectSecurityHeaders(result.response, true)
      expectNoServerErrors(result.tracedRequests, 'playwright /login')
    })

    it('Playwright UA is classified as human (no bot tier header)', async () => {
      const response = await client.request('/login', { userAgent: PLAYWRIGHT_CHROME_UA })

      expect(response.headers.get('x-voucha-bot-tier')).toBeNull()
      expect(response.status).toBe(200)
    })

    it('Playwright UA bypasses web page cache', async () => {
      const nonce = randomUUID()
      const response = await client.request(`/login?pw-cache=${nonce}`, {
        userAgent: PLAYWRIGHT_CHROME_UA,
      })

      expect(response.headers.get('x-voucha-cache')).toBe('BYPASS')
      expect(response.headers.get('cache-control')).not.toContain('s-maxage=')
    })

    it('streamed HTML response body matches between default and Playwright UAs', async () => {
      const nonce = randomUUID()
      const defaultResponse = await client.request(`/login?ua-compare=${nonce}`)
      const defaultHtml = await defaultResponse.text()

      const playwrightResponse = await client.request(`/login?ua-compare-pw=${nonce}`, {
        userAgent: PLAYWRIGHT_CHROME_UA,
      })
      const playwrightHtml = await playwrightResponse.text()

      expect(defaultHtml).toContain('</html>')
      expect(playwrightHtml).toContain('</html>')
      const ratio = playwrightHtml.length / defaultHtml.length
      expect(ratio).toBeGreaterThan(0.9)
      expect(ratio).toBeLessThan(1.1)
    })

    it('all discovered assets load with Playwright UA', async () => {
      const result = await client.loadPage(
        `/card/${SEEDED_IDS.topic}/discussions`,
        'playwright-topic',
        {
          userAgent: PLAYWRIGHT_CHROME_UA,
        },
      )

      expect(result.response.status).toBe(200)
      expectNoServerErrors(result.tracedRequests, 'playwright topic page')
      expect(result.assets.length).toBeGreaterThan(0)
      const failedAssets = result.assets.filter(a => a.status >= 400)
      expect(failedAssets).toEqual([])
    })

    it('Playwright UA bypasses cache and still serves complete HTML', async () => {
      const nonce = randomUUID()
      const path = `/login?pw-hit=${nonce}`

      const miss = await client.request(path, { userAgent: PLAYWRIGHT_CHROME_UA })
      expect(miss.headers.get('x-voucha-cache')).toBe('BYPASS')
      const missBody = await miss.text()
      expect(missBody).toContain('</html>')

      const second = await client.request(path, { userAgent: PLAYWRIGHT_CHROME_UA })
      expect(second.headers.get('x-voucha-cache')).toBe('BYPASS')
      const secondBody = await second.text()
      expect(secondBody).toContain('</html>')
    })

    it('web page responses bypass anon and bot caches', async () => {
      const nonce = randomUUID()
      const path = `/login?pw-bot-warm=${nonce}`

      const anonResponse = await client.request(path, { userAgent: PLAYWRIGHT_CHROME_UA })
      const anonBody = await anonResponse.text()
      expect(anonBody).toContain('</html>')
      expect(anonResponse.headers.get('x-voucha-cache')).toBe('BYPASS')

      const botResponse = await client.request(path, { userAgent: GOOGLEBOT_UA })
      const botBody = await botResponse.text()
      expect(botBody).toContain('</html>')
      expect(botResponse.headers.get('x-voucha-cache')).toBe('BYPASS')
    })

    it('content-heavy page streams completely with Playwright UA', async () => {
      const nonce = randomUUID()
      const result = await client.loadPage(
        `/discussion/${SEEDED_IDS.discussion}?pw-stream=${nonce}`,
        'playwright-discussion',
        { userAgent: PLAYWRIGHT_CHROME_UA },
      )

      expect(result.response.status).toBe(200)
      expect(result.html).toContain('</html>')
      expect(result.html).toContain('<h1')
      expectNoServerErrors(result.tracedRequests, 'playwright discussion page')
    })

    it('concurrent Playwright requests do not deadlock each other', async () => {
      const nonce = randomUUID()

      // Warm up the Next.js SSR module graph and worker isolate so cold-start
      // latency does not inflate the concurrent burst and cause false timeouts.
      // Use the same generous timeout as the burst: the warmup is the very
      // first request and most susceptible to cold-start latency. Drain the
      // response body so the SSR stream is fully complete and the connection
      // is returned to the pool before the concurrent burst starts.
      const warmup = await client.request(`/login?pw-concurrent-warmup=${nonce}`, {
        userAgent: PLAYWRIGHT_CHROME_UA,
        timeoutMs: 45_000,
      })
      await warmup.text()

      const paths = [
        `/login?pw-concurrent-a=${nonce}`,
        `/login?pw-concurrent-b=${nonce}`,
        `/login?pw-concurrent-c=${nonce}`,
      ]

      // Use a generous per-request timeout: a real deadlock hangs forever and
      // fails every run; this limit only catches genuine infinite hangs while
      // tolerating transient slowness on a loaded runner.
      const results = await Promise.all(
        paths.map(async path => {
          const response = await client.request(path, {
            userAgent: PLAYWRIGHT_CHROME_UA,
            timeoutMs: 45_000,
          })
          const body = await response.text()
          return { body, response }
        }),
      )

      for (const { body, response } of results) {
        expect(response.status).toBe(200)
        expect(response.headers.get('x-voucha-cache')).toBe('BYPASS')
        expect(body).toContain('</html>')
      }
    })

    it('Playwright UA preserves session cookies (not stripped like bots)', async () => {
      const authCookies = await createTestAuthCookies(TEST_USER_ID)
      client.setCookie('dt', authCookies.dt)
      client.setCookie('st', authCookies.st)

      const nonce = randomUUID()
      const cookieTestResponse = await client.request(`/api/v1/posts?pw-cookies=${nonce}`, {
        userAgent: PLAYWRIGHT_CHROME_UA,
      })
      const cookieRequestId = cookieTestResponse.headers.get('x-request-id')
      const tracedRequests = await client.getTraceRequests(cookieRequestId ?? undefined)
      expect(tracedRequests.some(r => r.cookieHeader?.includes('st='))).toBe(true)
      expect(tracedRequests.some(r => r.cookieHeader?.includes('dt='))).toBe(true)
    })
  })

  describe('owned static routes', () => {
    it('serves robots.txt and favicon.ico without 5xx responses', async () => {
      const robotsResponse = await client.request('/robots.txt')
      expect(robotsResponse.status).toBe(200)
      expectSecurityHeaders(robotsResponse, true)

      const faviconResponse = await client.request('/favicon.ico')
      expect(faviconResponse.status).toBe(200)
      expectSecurityHeaders(faviconResponse, true)
    })
  })
})
