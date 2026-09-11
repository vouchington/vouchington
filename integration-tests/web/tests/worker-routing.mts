import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import { WebIntegrationClient } from '../helpers/client.mts'
import { createTestAuthCookies } from '../helpers/auth.mts'
import { GOOGLEBOT_UA, PLAYWRIGHT_CHROME_UA, TEST_USER_ID } from '../helpers/constants.mts'
import { expectSecurityHeaders } from '../helpers/assertions.mts'
import './worker-cache-auth-transition.mts'

const workerOrigin = process.env.WEB_INTEGRATION_WORKER_ORIGIN
const traceOrigin = process.env.WEB_INTEGRATION_TRACE_ORIGIN
const artifactsDir = process.env.WEB_INTEGRATION_ARTIFACTS_DIR
const cachePlaceholderNonce = process.env.WEB_INTEGRATION_CACHE_PLACEHOLDER_NONCE

if (!workerOrigin || !traceOrigin || !artifactsDir || !cachePlaceholderNonce) {
  throw new Error('Web integration environment is not configured')
}

// Extracts the real per-request nonce from the gateway's freshly-built CSP
// header (e.g. `script-src 'self' 'nonce-abc123' ...`) — see csp.mts.
const extractCspNonce = (response: Response): string | null =>
  (response.headers.get('content-security-policy') ?? '').match(/'nonce-([0-9a-f]+)'/)?.[1] ?? null

let client: WebIntegrationClient

describe('web worker routing tests', () => {
  beforeEach(() => {
    client = new WebIntegrationClient(workerOrigin, traceOrigin, artifactsDir)
  })

  describe('Cloudflare Worker routing and headers', () => {
    it('routes /infra/ping to backend with standard headers', async () => {
      const response = await client.request('/infra/ping')

      expect(response.status).toBe(200)
      expect(await response.text()).toBe('pong')
      // Backend-target routes are never gated by CACHE_PLACEHOLDER_NONCE (see
      // request-handler.mts's canUseCachedOriginForWeb) — always dispatched.
      expect(response.headers.get('x-voucha-cache')).toBe('DISPATCHED')
      expectSecurityHeaders(response, false)
    })

    it('routes /login to Next.js with CSP and cache headers', async () => {
      const response = await client.request('/login')
      const html = await response.text()

      expect(response.status).toBe(200)
      // /login is unconditionally BYPASS_POLICY (isLoginRoute) regardless of
      // dispatch-gate config — Turnstile freshness requires a live origin hit.
      expect(response.headers.get('x-voucha-cache')).toBe('BYPASS')
      expect(html.toLowerCase()).toContain('email')
      expectSecurityHeaders(response, true)
    })

    it('adds unique request IDs to every response', async () => {
      const first = await client.request('/infra/ping')
      const second = await client.request('/infra/ping')

      const requestIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      expect(first.headers.get('x-request-id')).toMatch(requestIdPattern)
      expect(second.headers.get('x-request-id')).toMatch(requestIdPattern)
      expect(first.headers.get('x-request-id')).not.toBe(second.headers.get('x-request-id'))
    })

    it('serves inline robots.txt and llms.txt responses', async () => {
      const robots = await client.request('/robots.txt')
      expect(robots.status).toBe(200)
      expect(robots.headers.get('content-type')).toContain('text/plain')
      expect(await robots.text()).toContain('User-agent: *')

      const llms = await client.request('/llms.txt')
      expect(llms.status).toBe(200)
      expect(llms.headers.get('content-type')).toContain('text/markdown')
      const llmsText = await llms.text()
      expect(llmsText).toContain('# Voucha')
      expect(llmsText).toContain('/md/')
    })
  })

  describe('edge caching and bot classification', () => {
    it('signed-out pages dispatch through CachedOrigin and signed-out APIs are publicly cacheable', async () => {
      const pageResponse = await client.request('/')
      expect(pageResponse.status).toBe(200)
      expect(pageResponse.headers.get('x-voucha-cache')).toBe('DISPATCHED')

      const cacheKey = randomUUID()
      const apiResponse = await client.request(`/api/v1/posts?anonymous-cache=${cacheKey}`)
      expect(apiResponse.status).toBe(200)
      expect(apiResponse.headers.get('x-voucha-cache')).toBe('DISPATCHED')
      expect(apiResponse.headers.get('cache-control')).toContain('public')

      // A real platform HIT is not observable via local `wrangler dev`: Workers
      // Cache sits in front of the named CachedOrigin entrypoint at Cloudflare's
      // network edge, which local simulation does not reproduce (confirmed
      // empirically — the origin is re-hit on every dispatched request in this
      // harness). Repeat-request HIT verification is staging-only; see
      // docs/overview/architecture/anon-html-edge-caching-csp.md.
      const repeated = await client.request(`/api/v1/posts?anonymous-cache=${cacheKey}`)
      expect(repeated.status).toBe(200)
      expect(repeated.headers.get('x-voucha-cache')).toBe('DISPATCHED')
    })

    it('anon HTML never leaks the cache placeholder nonce and gets a fresh, working nonce per request', async () => {
      const first = await client.request('/')
      const second = await client.request('/')

      expect(first.headers.get('x-voucha-cache')).toBe('DISPATCHED')
      expect(second.headers.get('x-voucha-cache')).toBe('DISPATCHED')

      const firstHtml = await first.text()
      const secondHtml = await second.text()

      // Fail-open-on-secrecy property (see the CSP nonce decision record): the
      // placeholder baked into the cached body must never reach a client.
      expect(firstHtml).not.toContain(cachePlaceholderNonce)
      expect(secondHtml).not.toContain(cachePlaceholderNonce)

      const firstNonce = extractCspNonce(first)
      const secondNonce = extractCspNonce(second)
      expect(firstNonce).toBeTruthy()
      expect(secondNonce).toBeTruthy()
      // Fail-closed-on-execution property: a fresh nonce per request, and the
      // body's inline scripts are rewritten to match the response CSP header.
      expect(firstNonce).not.toBe(secondNonce)
      expect(firstHtml).toContain(`nonce="${firstNonce}"`)
      expect(secondHtml).toContain(`nonce="${secondNonce}"`)
    })

    it('bot pages dispatch through CachedOrigin and API responses stay fetchable with bot cache policy', async () => {
      const pageResponse = await client.request('/', { userAgent: GOOGLEBOT_UA })
      expect(pageResponse.status).toBe(200)
      expect(await pageResponse.text()).toContain('<h1')
      expect(pageResponse.headers.get('x-voucha-cache')).toBe('DISPATCHED')

      const apiResponse = await client.request('/api/v1/posts', { userAgent: GOOGLEBOT_UA })
      expect(apiResponse.status).toBe(200)
      const json = (await apiResponse.json()) as { results?: unknown[] }
      expect(Array.isArray(json.results)).toBe(true)
    })

    it('bot API requests strip session cookies and dispatch through CachedOrigin on repeated requests', async () => {
      const authCookies = await createTestAuthCookies(TEST_USER_ID)
      client.setCookie('dt', authCookies.dt)
      client.setCookie('st', authCookies.st)

      const nonce = randomUUID()
      const first = await client.request(`/api/v1/posts?bot-cache=${nonce}`, {
        userAgent: GOOGLEBOT_UA,
      })
      expect(first.status).toBe(200)
      expect(first.headers.get('x-voucha-cache')).toBe('DISPATCHED')

      const requestId1 = first.headers.get('x-request-id')
      const tracedRequests = await client.getTraceRequests(requestId1 ?? undefined)
      expect(tracedRequests.every(request => !request.cookieHeader?.includes('st='))).toBe(true)
      expect(tracedRequests.every(request => !request.cookieHeader?.includes('dt='))).toBe(true)

      // See the staging-only-HIT note above — repeated dispatch, not a real HIT.
      const repeated = await client.request(`/api/v1/posts?bot-cache=${nonce}`, {
        userAgent: GOOGLEBOT_UA,
      })
      expect(repeated.status).toBe(200)
      expect(repeated.headers.get('x-voucha-cache')).toBe('DISPATCHED')
    })

    it('Playwright user agent is treated as human and preserves session cookies', async () => {
      const authCookies = await createTestAuthCookies(TEST_USER_ID)
      client.setCookie('dt', authCookies.dt)
      client.setCookie('st', authCookies.st)

      const pageResponse = await client.request('/login', { userAgent: PLAYWRIGHT_CHROME_UA })
      expect(pageResponse.status).toBe(200)
      expect(pageResponse.headers.get('x-voucha-bot-tier')).toBeNull()
      expect(pageResponse.headers.get('x-voucha-cache')).toBe('BYPASS')
      expect(await pageResponse.text()).toContain('</html>')

      const pwCookieResponse = await client.request(`/api/v1/posts?pw-cookies=${randomUUID()}`, {
        userAgent: PLAYWRIGHT_CHROME_UA,
      })
      const pwRequestId = pwCookieResponse.headers.get('x-request-id')
      const tracedRequests = await client.getTraceRequests(pwRequestId ?? undefined)
      expect(tracedRequests.some(request => request.cookieHeader?.includes('st='))).toBe(true)
      expect(tracedRequests.some(request => request.cookieHeader?.includes('dt='))).toBe(true)
    })
  })
})
