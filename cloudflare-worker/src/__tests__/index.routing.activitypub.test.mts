import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import worker from '../index.mts'
import {
  createContext,
  restoreGlobals,
  setupMemoryCaches,
} from '../../test-helpers/src/mock-env.mts'
import type { Env } from '../types.mts'

// Phase C5: routing.test.mts only unit-tests the pure getRouteTarget() function — it never
// exercises a real request through worker.fetch(), so it can't catch a forwarding bug (e.g. an
// origin misconfiguration, or a route intercepted by an earlier pipeline stage). These tests
// prove ActivityPub federation paths actually reach BACKEND_ORIGIN end-to-end, and that the
// broad /.well-known/ prefix added to routing.mts does not swallow the worker-owned static
// discovery documents that inline-responses.mts serves before getRouteTarget ever runs.
describe('worker fetch handler — ActivityPub federation routing (Phase C5)', () => {
  beforeEach(() => {
    setupMemoryCaches()
  })

  afterEach(() => {
    restoreGlobals()
    vi.restoreAllMocks()
  })

  const env: Env = {
    BACKEND_ORIGIN: 'https://backend.example.com',
    WEB_ORIGIN: 'https://web.example.com',
    SITE_ORIGIN: 'https://voucha.ai',
    ANON_CACHE_TTL_SECONDS: '30',
    BOT_CACHE_TTL_SECONDS: '86400',
    SITEMAP_CACHE_TTL_SECONDS: '86400',
  }

  it.each([
    ['/.well-known/webfinger?resource=acct:jong@voucha.ai', '/.well-known/webfinger'],
    ['/.well-known/nodeinfo', '/.well-known/nodeinfo'],
    ['/nodeinfo/2.0', '/nodeinfo/2.0'],
    ['/ap/users/abc-123', '/ap/users/abc-123'],
    ['/client-metadata.json', '/client-metadata.json'],
  ])('forwards GET %s to BACKEND_ORIGIN', async (requestPath, expectedPath) => {
    let capturedRequest: Request | undefined
    const fetchSpy = vi.fn<VitestLooseMock>((request: Request): Promise<Response> => {
      capturedRequest = request
      return Promise.resolve(new Response('from-backend'))
    })
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    const response = await worker.fetch(
      new Request(`https://voucha.ai${requestPath}`),
      env,
      createContext(env),
    )

    expect(await response.text()).toBe('from-backend')
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const capturedUrl = new URL(capturedRequest!.url)
    expect(capturedUrl.origin).toBe('https://backend.example.com')
    expect(capturedUrl.pathname).toBe(expectedPath)
  })

  it('forwards POST /ap/inbox to BACKEND_ORIGIN with the request body intact', async () => {
    let capturedRequest: Request | undefined
    let capturedBody: string | undefined
    const fetchSpy = vi.fn<VitestLooseMock>((request: Request): Promise<Response> => {
      capturedRequest = request
      return request.text().then(body => {
        capturedBody = body
        return new Response('accepted', { status: 202 })
      })
    })
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    const activity = JSON.stringify({ type: 'Follow', id: 'https://remote.example/activities/1' })
    const response = await worker.fetch(
      new Request('https://voucha.ai/ap/inbox', {
        method: 'POST',
        headers: { 'content-type': 'application/activity+json' },
        body: activity,
      }),
      env,
      createContext(env),
    )

    expect(response.status).toBe(202)
    expect(await response.text()).toBe('accepted')
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const capturedUrl = new URL(capturedRequest!.url)
    expect(capturedUrl.origin).toBe('https://backend.example.com')
    expect(capturedUrl.pathname).toBe('/ap/inbox')
    expect(capturedRequest?.method).toBe('POST')
    expect(capturedBody).toBe(activity)
  })

  // Codex round-3 fix: AP/WebFinger/NodeInfo requests are server-to-server and never carry a
  // browser session, but botTier stays null for them (no user-agent classifies as a known bot),
  // so ensureSession() would otherwise mint a fresh anon dt/st and inject it into the outgoing
  // cookie header (origin-request.mts's `anon-minted` branch). The backend's cross-site-mutation
  // guard then sees a mutating POST with a session cookie but no Origin/Sec-Fetch-Site header and
  // rejects it as cross-site — before /ap/inbox's own signature verification ever runs. Confirms
  // request-handler.mts's isExternalServerToServerIngress() short-circuit keeps these requests
  // cookie-free.
  it('does not mint or forward anon session cookies for POST /ap/inbox', async () => {
    let capturedRequest: Request | undefined
    const fetchSpy = vi.fn<VitestLooseMock>((request: Request): Promise<Response> => {
      capturedRequest = request
      return Promise.resolve(new Response('accepted', { status: 202 }))
    })
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    const response = await worker.fetch(
      new Request('https://voucha.ai/ap/inbox', {
        method: 'POST',
        headers: { 'content-type': 'application/activity+json' },
        body: JSON.stringify({ type: 'Follow' }),
      }),
      env,
      createContext(env),
    )

    expect(response.status).toBe(202)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(capturedRequest?.headers.get('cookie')).toBeNull()
    expect(response.headers.get('set-cookie')).toBeNull()
  })

  // Round-6 re-review fix: a caller can still attach a stale dt/st cookie pair from a previous
  // browser session (e.g. a signed delivery replayed from a client that once held browser
  // cookies) even though federation surfaces never mint one. The external-ingress classifier
  // short-circuit above only stops *minting*; without origin-bypass.mts's forceStripAllCookies,
  // an *existing* dt/st pair on the incoming request would still be forwarded to origin, tripping
  // the same cross-site-mutation guard this whole file guards against.
  it('strips a pre-existing dt/st session cookie from POST /ap/inbox before forwarding', async () => {
    let capturedRequest: Request | undefined
    const fetchSpy = vi.fn<VitestLooseMock>((request: Request): Promise<Response> => {
      capturedRequest = request
      return Promise.resolve(new Response('accepted', { status: 202 }))
    })
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    const response = await worker.fetch(
      new Request('https://voucha.ai/ap/inbox', {
        method: 'POST',
        headers: {
          'content-type': 'application/activity+json',
          cookie: 'dt=stale-device-token; st=stale-session-token',
        },
        body: JSON.stringify({ type: 'Follow' }),
      }),
      env,
      createContext(env),
    )

    expect(response.status).toBe(202)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(capturedRequest?.headers.get('cookie')).toBeNull()
  })

  // "Does not swallow" requirement: the broad WELL_KNOWN_ROUTE_RE prefix added for webfinger/
  // nodeinfo forwarding must not override the worker-owned static /.well-known/* documents.
  // inline-responses.mts's getStaticInlineResponse() runs before getRouteTarget() inside
  // fetchInner (see request-handler.mts), so these must still be served inline with the
  // backend fetch spy never invoked.
  it.each([
    '/.well-known/security.txt',
    '/.well-known/api-catalog',
    '/.well-known/traffic-advice',
    '/.well-known/agent-card.json',
    '/.well-known/agent-skills.json',
  ])('still serves the static inline document %s without forwarding to backend', async path => {
    const fetchSpy = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(new Response('should not be called')),
    )
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    const response = await worker.fetch(
      new Request(`https://voucha.ai${path}`),
      env,
      createContext(env),
    )

    expect(response.status).toBe(200)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
