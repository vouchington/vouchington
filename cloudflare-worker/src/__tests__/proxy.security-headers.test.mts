import { describe, expect, it } from 'vitest'
import { appendHeaders, buildOriginRequest, withHeaders } from '../proxy.mts'

describe('buildOriginRequest — security header stripping', () => {
  it('strips client-supplied x-cf-worker-secret before forwarding to origin', () => {
    const request = new Request('https://voucha.ai/api/v1/posts', {
      headers: { 'x-cf-worker-secret': 'attacker-supplied-secret' },
    })
    const originRequest = buildOriginRequest(request, 'https://backend.example.com', new Set())

    expect(originRequest.headers.get('x-cf-worker-secret')).toBeNull()
  })

  it('worker secret overrides client-supplied value when cfWorkerSecret is provided', () => {
    const request = new Request('https://voucha.ai/api/v1/posts', {
      headers: { 'x-cf-worker-secret': 'attacker-supplied-secret' },
    })
    const originRequest = buildOriginRequest(
      request,
      'https://backend.example.com',
      new Set(),
      'real-secret',
    )

    expect(originRequest.headers.get('x-cf-worker-secret')).toBe('real-secret')
  })

  it('strips client-supplied auth-looking headers before forwarding to origin', () => {
    const request = new Request('https://voucha.ai/api/v1/posts', {
      headers: {
        'x-user-id': 'attacker-user',
        'x-device-token': 'attacker-device',
        'x-session-token': 'attacker-session',
      },
    })
    const originRequest = buildOriginRequest(request, 'https://backend.example.com', new Set())

    expect(originRequest.headers.get('x-user-id')).toBeNull()
    expect(originRequest.headers.get('x-device-token')).toBeNull()
    expect(originRequest.headers.get('x-session-token')).toBeNull()
  })

  it('strips x-middleware-subrequest (CVE-2025-29927 auth bypass)', () => {
    const request = new Request('https://voucha.ai/page', {
      headers: {
        'x-middleware-subrequest': 'middleware:middleware:middleware:middleware:middleware',
      },
    })
    const originRequest = buildOriginRequest(request, 'http://localhost:3000', new Set())
    expect(originRequest.headers.get('x-middleware-subrequest')).toBeNull()
  })

  it('strips x-middleware-subrequest-id (CVE-2025-30218 data leak)', () => {
    const request = new Request('https://voucha.ai/page', {
      headers: { 'x-middleware-subrequest-id': 'abc123' },
    })
    const originRequest = buildOriginRequest(request, 'http://localhost:3000', new Set())
    expect(originRequest.headers.get('x-middleware-subrequest-id')).toBeNull()
  })

  it('strips x-nextjs-data (GHSA-3g8h-86w9-wvmq redirect cache poisoning)', () => {
    const request = new Request('https://voucha.ai/page', {
      headers: { 'x-nextjs-data': '1' },
    })
    const originRequest = buildOriginRequest(request, 'http://localhost:3000', new Set())
    expect(originRequest.headers.get('x-nextjs-data')).toBeNull()
  })

  it('strips x-now-route-matches (CVE-2025-32421 pageProps leak)', () => {
    const request = new Request('https://voucha.ai/page', {
      headers: { 'x-now-route-matches': '1=foo&2=bar' },
    })
    const originRequest = buildOriginRequest(request, 'http://localhost:3000', new Set())
    expect(originRequest.headers.get('x-now-route-matches')).toBeNull()
  })

  it('strips next-resume (CVE-2026-44579 DoS)', () => {
    const request = new Request('https://voucha.ai/page', {
      headers: { 'next-resume': '1' },
    })
    const originRequest = buildOriginRequest(request, 'http://localhost:3000', new Set())
    expect(originRequest.headers.get('next-resume')).toBeNull()
  })

  it('strips next-action-nonce (defense-in-depth around CVE-2026-44581)', () => {
    const request = new Request('https://voucha.ai/page', {
      headers: { 'next-action-nonce': 'nonce-value' },
    })
    const originRequest = buildOriginRequest(request, 'http://localhost:3000', new Set())
    expect(originRequest.headers.get('next-action-nonce')).toBeNull()
  })

  it('does not strip rsc header (needed for Next.js RSC navigation; cache-key marker provides CVE protection)', () => {
    const request = new Request('https://voucha.ai/page', {
      headers: { rsc: '1' },
    })
    const originRequest = buildOriginRequest(request, 'http://localhost:3000', new Set())
    expect(originRequest.headers.get('rsc')).toBe('1')
  })

  it('does not strip next-action header (needed for Server Action origin validation)', () => {
    const request = new Request('https://voucha.ai/page', {
      method: 'POST',
      headers: { 'next-action': 'abc123' },
    })
    const originRequest = buildOriginRequest(request, 'http://localhost:3000', new Set())
    expect(originRequest.headers.get('next-action')).toBe('abc123')
  })

  it('strips specified cookies', () => {
    const request = new Request('https://voucha.ai/', {
      headers: { cookie: 'st=token; dt=device; foo=bar' },
    })

    const originRequest = buildOriginRequest(
      request,
      'https://web.example.com',
      new Set(['st', 'dt']),
    )

    expect(originRequest.headers.get('cookie')).toBe('foo=bar')
  })

  it('removes cookie header entirely when all cookies are stripped', () => {
    const request = new Request('https://voucha.ai/', {
      headers: { cookie: 'st=token; dt=device' },
    })

    const originRequest = buildOriginRequest(
      request,
      'https://web.example.com',
      new Set(['st', 'dt']),
    )

    expect(originRequest.headers.get('cookie')).toBeNull()
  })

  it('removes cookie header entirely when stripAllCookies is enabled', () => {
    const request = new Request('https://voucha.ai/', {
      headers: { cookie: 'st=token; dt=device; foo=bar' },
    })

    const originRequest = buildOriginRequest(
      request,
      'https://web.example.com',
      new Set(),
      undefined,
      undefined,
      true,
    )

    expect(originRequest.headers.get('cookie')).toBeNull()
  })
})

describe('withHeaders', () => {
  it('sets the specified header', () => {
    const response = new Response('body')
    const result = withHeaders(response, { 'x-voucha-cache': 'HIT' })

    expect(result.headers.get('x-voucha-cache')).toBe('HIT')
  })

  it('sets cache-control with s-maxage for edge and no browser cache', () => {
    const response = new Response('body', { status: 200 })
    const result = withHeaders(response, { 'cache-control': 'public, s-maxage=30, max-age=0' })

    expect(result.headers.get('cache-control')).toBe('public, s-maxage=30, max-age=0')
  })

  it('sets multiple headers at once', () => {
    const response = new Response('body')
    const result = withHeaders(response, {
      'x-voucha-cache': 'MISS',
      'cache-control': 'public, s-maxage=60, max-age=0',
    })

    expect(result.headers.get('x-voucha-cache')).toBe('MISS')
    expect(result.headers.get('cache-control')).toBe('public, s-maxage=60, max-age=0')
  })

  it('preserves multiple set-cookie headers', () => {
    const response = new Response('body')
    response.headers.append('set-cookie', 'a=1; Path=/')
    response.headers.append('set-cookie', 'b=2; Path=/')

    const result = withHeaders(response, { 'x-voucha-cache': 'HIT' })

    const setCookieValues = result.headers.getSetCookie?.() ?? [result.headers.get('set-cookie')]
    expect(setCookieValues).toHaveLength(2)
    expect(setCookieValues).toContain('a=1; Path=/')
    expect(setCookieValues).toContain('b=2; Path=/')
  })

  it('preserves response status and body', async () => {
    const response = new Response('hello', { status: 201 })
    const result = withHeaders(response, { 'cache-control': 'public, s-maxage=60, max-age=0' })

    expect(result.status).toBe(201)
    expect(await result.text()).toBe('hello')
  })

  it('preserves existing headers', () => {
    const response = new Response('body', {
      headers: { 'content-type': 'application/json' },
    })
    const result = withHeaders(response, { 'x-custom': 'value' })

    expect(result.headers.get('content-type')).toBe('application/json')
    expect(result.headers.get('x-custom')).toBe('value')
  })
})

describe('appendHeaders', () => {
  it('preserves existing headers and appends new ones', () => {
    const response = new Response('body', {
      headers: { 'content-type': 'text/html', 'x-existing': 'yes' },
    })
    const result = appendHeaders(response, [['x-new', 'added']])

    expect(result.headers.get('content-type')).toBe('text/html')
    expect(result.headers.get('x-existing')).toBe('yes')
    expect(result.headers.get('x-new')).toBe('added')
  })

  it('preserves multiple set-cookie headers as separate entries', () => {
    const base = new Response(null, { status: 200 })
    const withFirst = appendHeaders(base, [['set-cookie', 'dt=abc; Path=/; HttpOnly']])
    const result = appendHeaders(withFirst, [['set-cookie', 'st=xyz; Path=/; HttpOnly']])

    const cookies = result.headers.getSetCookie()
    expect(cookies).toHaveLength(2)
    expect(cookies[0]).toBe('dt=abc; Path=/; HttpOnly')
    expect(cookies[1]).toBe('st=xyz; Path=/; HttpOnly')
  })

  it('appends set-cookie without overwriting existing ones', () => {
    const response = new Response(null, {
      headers: [['set-cookie', 'existing=1; Path=/']],
    })
    const result = appendHeaders(response, [['set-cookie', 'new=2; Path=/']])

    const cookies = result.headers.getSetCookie()
    expect(cookies).toContain('existing=1; Path=/')
    expect(cookies).toContain('new=2; Path=/')
  })

  it('preserves response status and body', async () => {
    const response = new Response('hello', { status: 202 })
    const result = appendHeaders(response, [['x-tag', 'yes']])

    expect(result.status).toBe(202)
    expect(await result.text()).toBe('hello')
  })
})
