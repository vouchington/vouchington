import { describe, expect, it } from 'vitest'
import { buildWorkerOriginRequest } from './origin-request.mts'
import type { Env } from './types.mts'

const env = {
  BACKEND_ORIGIN: 'https://backend.example.com',
  CF_WORKER_SECRET: 'worker-secret',
  GIT_COMMIT: 'edge-release',
} as Env

function build(request: Request, requestKind?: 'bot' | 'cache-fill') {
  return buildWorkerOriginRequest({
    canonicalSitemapUrl: null,
    cspNonce: '',
    edgeSession: { kind: 'anon-passthrough' },
    env,
    origin: env.BACKEND_ORIGIN!,
    request,
    requestId: 'request-id',
    requestKind,
    stripAllCookies: false,
    stripCookieNames: new Set(),
    target: 'backend',
    webCsp: '',
  })
}

describe('buildWorkerOriginRequest client information', () => {
  it('stamps browser-shaped backend requests', () => {
    const originRequest = build(
      new Request('https://voucha.ai/api/v1/posts', {
        headers: { 'sec-fetch-site': 'same-origin' },
      }),
    )

    expect(originRequest.headers.get('x-voucha-client')).toBe('web')
    expect(originRequest.headers.get('x-voucha-platform')).toBe('web')
    expect(originRequest.headers.get('x-voucha-app-version')).toBe('edge-release')
  })

  it('preserves native metadata through backend origin construction', () => {
    const originRequest = build(
      new Request('https://voucha.ai/api/v1/posts', {
        headers: {
          'x-voucha-app-version': '1.0+1',
          'x-voucha-client': 'dotnet',
          'x-voucha-platform': 'windows',
        },
      }),
    )

    expect(originRequest.headers.get('x-voucha-client')).toBe('dotnet')
    expect(originRequest.headers.get('x-voucha-platform')).toBe('windows')
    expect(originRequest.headers.get('x-voucha-app-version')).toBe('1.0+1')
  })

  it('preserves Basic client authentication only for OAuth credential routes', () => {
    const authorization = `Basic ${Buffer.from('client:secret').toString('base64')}`

    expect(
      build(new Request('https://voucha.ai/token', { headers: { authorization } })).headers.get(
        'authorization',
      ),
    ).toBe(authorization)
    expect(
      build(new Request('https://voucha.ai/revoke', { headers: { authorization } })).headers.get(
        'authorization',
      ),
    ).toBe(authorization)
    expect(
      build(
        new Request('https://voucha.ai/api/v1/posts', { headers: { authorization } }),
      ).headers.get('authorization'),
    ).toBeNull()
  })

  it('replaces spoofed request kinds with a trusted cache-fill marker', () => {
    const originRequest = build(
      new Request('https://voucha.ai/api/v1/posts', {
        headers: {
          'sec-fetch-site': 'same-origin',
          'x-voucha-request-kind': 'attacker',
        },
      }),
      'cache-fill',
    )

    expect(originRequest.headers.get('x-voucha-request-kind')).toBe('cache-fill')
    expect(originRequest.headers.get('x-voucha-client')).toBeNull()
  })

  it('does not stamp requests routed to non-backend origins', () => {
    const originRequest = buildWorkerOriginRequest({
      canonicalSitemapUrl: null,
      cspNonce: 'nonce',
      edgeSession: { kind: 'anon-passthrough' },
      env,
      origin: 'https://web.example.com',
      request: new Request('https://voucha.ai/page', {
        headers: { 'sec-fetch-site': 'same-origin' },
      }),
      requestId: 'request-id',
      stripAllCookies: false,
      stripCookieNames: new Set(),
      target: 'web',
      webCsp: "default-src 'self'",
    })

    expect(originRequest.headers.get('x-voucha-client')).toBeNull()
  })

  it('marks web cache-fill origin requests so render time can suppress trace meta', () => {
    const originRequest = buildWorkerOriginRequest({
      canonicalSitemapUrl: null,
      cspNonce: 'nonce',
      edgeSession: { kind: 'anon-passthrough' },
      env,
      origin: 'https://web.example.com',
      request: new Request('https://voucha.ai/page'),
      requestId: 'request-id',
      requestKind: 'cache-fill',
      stripAllCookies: false,
      stripCookieNames: new Set(),
      target: 'web',
      webCsp: "default-src 'self'",
    })

    expect(originRequest.headers.get('x-voucha-request-kind')).toBe('cache-fill')
  })

  it('strips a client-supplied request-kind spoof on non-cache-fill web requests', () => {
    const originRequest = buildWorkerOriginRequest({
      canonicalSitemapUrl: null,
      cspNonce: 'nonce',
      edgeSession: { kind: 'anon-passthrough' },
      env,
      origin: 'https://web.example.com',
      request: new Request('https://voucha.ai/page', {
        headers: { 'x-voucha-request-kind': 'cache-fill' },
      }),
      requestId: 'request-id',
      stripAllCookies: false,
      stripCookieNames: new Set(),
      target: 'web',
      webCsp: "default-src 'self'",
    })

    expect(originRequest.headers.get('x-voucha-request-kind')).toBeNull()
  })
})
