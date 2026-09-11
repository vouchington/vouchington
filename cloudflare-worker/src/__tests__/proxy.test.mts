import { describe, expect, it } from 'vitest'
import { buildOriginRequest, CLIENT_SUPPLIED_PROXY_HEADERS_TO_STRIP } from '../proxy.mts'

describe('buildOriginRequest', () => {
  it('forwards Accept-Encoding as-is for remote origins', () => {
    const request = new Request('https://voucha.ai/api/v1/posts', {
      headers: {
        'accept-encoding': 'gzip, deflate, br',
        accept: 'application/json',
      },
    })

    const originRequest = buildOriginRequest(request, 'https://backend.example.com', new Set())

    expect(originRequest.headers.get('accept')).toBe('application/json')
    expect(originRequest.headers.get('accept-encoding')).toBe('gzip, deflate, br')
  })

  it('sets Accept-Encoding: identity for localhost origins to prevent miniflare double-compression', () => {
    const request = new Request('https://voucha.ai/', {
      headers: { 'accept-encoding': 'gzip, deflate, br' },
    })

    const originRequest = buildOriginRequest(request, 'http://localhost:3000', new Set())

    expect(originRequest.headers.get('accept-encoding')).toBe('identity')
  })

  it('sets Accept-Encoding: identity for loopback origins used by integration tests', () => {
    const request = new Request('https://voucha.ai/', {
      headers: { 'accept-encoding': 'gzip, deflate, br' },
    })

    const originRequest = buildOriginRequest(request, 'http://127.0.0.1:3000', new Set())

    expect(originRequest.headers.get('accept-encoding')).toBe('identity')
  })

  it('sets Accept-Encoding: identity for a remote origin when forceIdentityEncoding is true', () => {
    const request = new Request('https://voucha.ai/', {
      headers: { 'accept-encoding': 'gzip, deflate, br' },
    })

    const originRequest = buildOriginRequest(
      request,
      'https://backend.example.com',
      new Set(),
      undefined,
      undefined,
      false,
      undefined,
      true,
    )

    expect(originRequest.headers.get('accept-encoding')).toBe('identity')
  })

  it('routes to origin host while preserving path and query', () => {
    const request = new Request('https://voucha.ai/api/v1/posts?page=2')
    const originRequest = buildOriginRequest(request, 'https://backend.example.com', new Set())

    expect(new URL(originRequest.url).host).toBe('backend.example.com')
    expect(new URL(originRequest.url).pathname).toBe('/api/v1/posts')
    expect(new URL(originRequest.url).search).toBe('?page=2')
  })

  it('merges path override query params with the original request query', () => {
    const request = new Request(
      'https://voucha.ai/reviews.md?limit=10&after=cursor&post_types=story',
    )
    const originRequest = buildOriginRequest(
      request,
      'https://backend.example.com',
      new Set(),
      undefined,
      '/md/posts?post_types=review',
    )
    const originUrl = new URL(originRequest.url)

    expect(originUrl.host).toBe('backend.example.com')
    expect(originUrl.pathname).toBe('/md/posts')
    expect(originUrl.searchParams.get('limit')).toBe('10')
    expect(originUrl.searchParams.get('after')).toBe('cursor')
    expect(originUrl.searchParams.get('post_types')).toBe('review')
  })

  it('sets x-forwarded-host and x-forwarded-proto from the original request URL', () => {
    const request = new Request('https://voucha.ai/page')
    const originRequest = buildOriginRequest(request, 'http://localhost:3000', new Set())

    expect(originRequest.headers.get('x-forwarded-host')).toBe('voucha.ai')
    expect(originRequest.headers.get('x-forwarded-proto')).toBe('https')
  })

  it('sets x-forwarded-for from cf-connecting-ip', () => {
    const request = new Request('https://voucha.ai/page', {
      headers: { 'cf-connecting-ip': '1.2.3.4' },
    })

    const originRequest = buildOriginRequest(request, 'http://localhost:3000', new Set())

    expect(originRequest.headers.get('x-forwarded-for')).toBe('1.2.3.4')
    expect(originRequest.headers.get('cf-connecting-ip')).toBeNull()
  })

  it('strips client-supplied x-forwarded-for to prevent injection', () => {
    const request = new Request('https://voucha.ai/page', {
      headers: { 'x-forwarded-for': '10.0.0.1' },
    })

    const originRequest = buildOriginRequest(request, 'http://localhost:3000', new Set())

    expect(originRequest.headers.get('x-forwarded-for')).toBeNull()
  })

  it('strips additional client-supplied spoofable forwarding headers', () => {
    // Assert that the strip list contains all known/expected security-sensitive headers.
    // This prevents silent regressions if a header is accidentally removed from the list.
    expect(CLIENT_SUPPLIED_PROXY_HEADERS_TO_STRIP).toEqual(
      expect.arrayContaining([
        'cf-connecting-ip',
        'forwarded',
        'true-client-ip',
        'via',
        'x-forwarded-for',
        'x-forwarded-port',
        'x-forwarded-prefix',
        'x-forwarded-scheme',
        'x-forwarded-server',
        'x-forwarded-ssl',
        'x-forwarded-uri',
        'x-http-method',
        'x-http-method-override',
        'x-method-override',
        'x-original-url',
        'x-real-ip',
        'x-rewrite-url',
      ]),
    )

    const request = new Request('https://voucha.ai/page', {
      headers: Object.fromEntries(
        // This test must not seed cf-connecting-ip: the dedicated test above proves it is
        // consumed to stamp x-forwarded-for before the defensive origin-bound deletion.
        CLIENT_SUPPLIED_PROXY_HEADERS_TO_STRIP.filter(header => header !== 'cf-connecting-ip').map(
          (header, index) => [index % 2 === 0 ? header.toUpperCase() : header, 'attacker-supplied'],
        ),
      ),
    })

    const originRequest = buildOriginRequest(request, 'http://localhost:3000', new Set())

    for (const header of CLIENT_SUPPLIED_PROXY_HEADERS_TO_STRIP) {
      expect(originRequest.headers.get(header)).toBeNull()
    }
  })

  it('omits x-forwarded-for when cf-connecting-ip is absent', () => {
    const request = new Request('https://voucha.ai/page')

    const originRequest = buildOriginRequest(request, 'http://localhost:3000', new Set())

    expect(originRequest.headers.get('x-forwarded-for')).toBeNull()
  })

  it('sets x-cf-worker-secret header when cfWorkerSecret is provided', () => {
    const request = new Request('https://voucha.ai/api/v1/posts')
    const originRequest = buildOriginRequest(
      request,
      'https://backend.example.com',
      new Set(),
      'my-secret',
    )

    expect(originRequest.headers.get('x-cf-worker-secret')).toBe('my-secret')
  })

  it('does not set x-cf-worker-secret header when cfWorkerSecret is absent', () => {
    const request = new Request('https://voucha.ai/api/v1/posts')
    const originRequest = buildOriginRequest(request, 'https://backend.example.com', new Set())

    expect(originRequest.headers.get('x-cf-worker-secret')).toBeNull()
  })

  it('sets x-request-id when requestId is provided', () => {
    const request = new Request('https://voucha.ai/api/v1/posts')
    const originRequest = buildOriginRequest(
      request,
      'https://backend.example.com',
      new Set(),
      undefined,
      undefined,
      false,
      'test-request-id-123',
    )

    expect(originRequest.headers.get('x-request-id')).toBe('test-request-id-123')
  })

  it('does not set x-request-id when requestId is absent', () => {
    const request = new Request('https://voucha.ai/api/v1/posts')
    const originRequest = buildOriginRequest(request, 'https://backend.example.com', new Set())

    expect(originRequest.headers.get('x-request-id')).toBeNull()
  })

  it('strips client-supplied x-request-id before setting worker-generated value', () => {
    const request = new Request('https://voucha.ai/api/v1/posts', {
      headers: { 'x-request-id': 'client-supplied-id' },
    })

    // Without requestId arg — client value should be stripped
    const withoutId = buildOriginRequest(request, 'https://backend.example.com', new Set())
    expect(withoutId.headers.get('x-request-id')).toBeNull()

    // With requestId arg — worker value replaces client value
    const withId = buildOriginRequest(
      request,
      'https://backend.example.com',
      new Set(),
      undefined,
      undefined,
      false,
      'worker-generated-id',
    )
    expect(withId.headers.get('x-request-id')).toBe('worker-generated-id')
  })

  it('normalizes Sec-GPC into the internal origin header', () => {
    const request = new Request('https://voucha.ai/page', {
      headers: { 'sec-gpc': '1' },
    })

    const originRequest = buildOriginRequest(request, 'https://backend.example.com', new Set())

    expect(originRequest.headers.get('sec-gpc')).toBe('1')
    expect(originRequest.headers.get('x-voucha-gpc')).toBe('1')
  })

  it('strips spoofed internal Global Privacy Control header without Sec-GPC', () => {
    const request = new Request('https://voucha.ai/page', {
      headers: { 'x-voucha-gpc': '1' },
    })

    const originRequest = buildOriginRequest(request, 'https://backend.example.com', new Set())

    expect(originRequest.headers.get('x-voucha-gpc')).toBeNull()
  })

  it('does not normalize inactive Sec-GPC values', () => {
    const request = new Request('https://voucha.ai/page', {
      headers: { 'sec-gpc': '0', 'x-voucha-gpc': '1' },
    })

    const originRequest = buildOriginRequest(request, 'https://backend.example.com', new Set())

    expect(originRequest.headers.get('sec-gpc')).toBe('0')
    expect(originRequest.headers.get('x-voucha-gpc')).toBeNull()
  })

  it('forwards POST body to origin request', async () => {
    const body = JSON.stringify({ title: 'hello' })
    const request = new Request('https://voucha.ai/api/v1/posts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    })
    const originRequest = buildOriginRequest(request, 'https://backend.example.com', new Set())

    expect(originRequest.method).toBe('POST')
    expect(await originRequest.text()).toBe(body)
  })

  it('GET requests have no body', () => {
    const request = new Request('https://voucha.ai/api/v1/posts')
    const originRequest = buildOriginRequest(request, 'https://backend.example.com', new Set())

    expect(originRequest.method).toBe('GET')
    expect(originRequest.body).toBeNull()
  })
})
