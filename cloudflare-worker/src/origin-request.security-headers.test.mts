import { describe, expect, it } from 'vitest'
import { buildWorkerOriginRequest } from './origin-request.mts'
import type { Env } from './types.mts'

function build(request: Request) {
  const env = { CF_WORKER_SECRET: 'worker-secret' } as Env
  return buildWorkerOriginRequest({
    canonicalSitemapUrl: null,
    cspNonce: '',
    edgeSession: { kind: 'anon-passthrough' },
    env,
    origin: 'https://backend.example.com',
    request,
    requestId: 'request-id',
    stripAllCookies: false,
    stripCookieNames: new Set(),
    target: 'backend',
    webCsp: '',
  })
}

describe('origin request security policy', () => {
  it('removes client-supplied identity, control, and Next.js internal headers at the origin boundary', () => {
    const untrustedHeaders = [
      'x-user-id',
      'x-device-token',
      'x-session-token',
      'x-voucha-request-kind',
      'x-voucha-staging-authorization',
      'x-voucha-staging-canary-secret',
      'x-voucha-staging-canary-fault',
      'x-voucha-internal-canary-fault',
      'x-voucha-bot-score',
      'x-middleware-subrequest',
      'x-middleware-subrequest-id',
      'x-nextjs-data',
      'x-now-route-matches',
      'next-resume',
      'next-action-nonce',
    ]
    const originRequest = build(
      new Request('https://voucha.ai/api/v1/posts', {
        headers: {
          ...Object.fromEntries(untrustedHeaders.map(name => [name, 'attacker'])),
          'x-cf-worker-secret': 'attacker',
          'x-request-id': 'attacker',
        },
      }),
    )

    for (const name of untrustedHeaders) expect(originRequest.headers.get(name)).toBeNull()
    expect(originRequest.headers.get('x-cf-worker-secret')).toBe('worker-secret')
    expect(originRequest.headers.get('x-request-id')).toBe('request-id')
  })

  it.each([undefined, '1'])('derives the internal privacy signal only from sec-gpc %s', signal => {
    const originRequest = build(
      new Request('https://voucha.ai/api/v1/posts', {
        headers: { 'x-voucha-gpc': 'attacker', ...(signal ? { 'sec-gpc': signal } : {}) },
      }),
    )

    expect(originRequest.headers.get('x-voucha-gpc')).toBe(signal ?? null)
  })

  it.each([1, 29, 30, 99])('forwards trusted Cloudflare bot score %s to the backend', score => {
    const request = new Request('https://voucha.ai/api/v1/posts', {
      headers: { 'x-voucha-bot-score': 'attacker' },
    })
    Object.defineProperty(request, 'cf', { value: { botManagement: { score } } })

    expect(build(request).headers.get('x-voucha-bot-score')).toBe(String(score))
  })

  it.each([undefined, 0, 100, 1.5])(
    'omits unavailable or invalid Cloudflare bot score %s',
    score => {
      const request = new Request('https://voucha.ai/api/v1/posts', {
        headers: { 'x-voucha-bot-score': 'attacker' },
      })
      if (score !== undefined) {
        Object.defineProperty(request, 'cf', { value: { botManagement: { score } } })
      }

      expect(build(request).headers.get('x-voucha-bot-score')).toBeNull()
    },
  )

  it('never forwards bot score metadata to the web origin', () => {
    const request = new Request('https://voucha.ai/settings', {
      headers: { 'x-voucha-bot-score': 'attacker' },
    })
    Object.defineProperty(request, 'cf', { value: { botManagement: { score: 7 } } })

    const originRequest = buildWorkerOriginRequest({
      canonicalSitemapUrl: null,
      cspNonce: 'nonce',
      edgeSession: { kind: 'anon-passthrough' },
      env: { CF_WORKER_SECRET: 'worker-secret' } as Env,
      origin: 'https://web.example.com',
      request,
      requestId: 'request-id',
      stripAllCookies: false,
      stripCookieNames: new Set(),
      target: 'web',
      webCsp: "default-src 'self'",
    })

    expect(originRequest.headers.get('x-voucha-bot-score')).toBeNull()
  })
})
