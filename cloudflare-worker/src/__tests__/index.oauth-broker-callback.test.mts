import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import worker from '../index.mts'
import { createContext, restoreGlobals, setupMemoryCaches } from '../test-helpers/mock-env.mts'
import type { Env } from '../types.mts'

const baseEnv: Env = {
  BACKEND_ORIGIN: 'https://backend.example.com',
  WEB_ORIGIN: 'https://web.example.com',
  BASIC_AUTH_CREDENTIALS: 'alice:hunter2',
}

describe('OAuth broker callback routing', () => {
  beforeEach(() => {
    setupMemoryCaches()
    globalThis.fetch = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(new Response('ok')),
    ) as unknown as typeof fetch
  })

  afterEach(() => {
    restoreGlobals()
    vi.restoreAllMocks()
  })

  it('routes public GET callbacks to the backend with their query params intact', async () => {
    const forwardedUrls: string[] = []
    globalThis.fetch = vi.fn<VitestLooseMock>((request: Request) => {
      forwardedUrls.push(request.url)
      return Promise.resolve(new Response('ok'))
    }) as unknown as typeof fetch

    for (const provider of ['facebook', 'x', 'github']) {
      const response = await worker.fetch(
        new Request(
          `https://staging.voucha.ai/auth/callback/${provider}/broker?code=abc%2B123&state=oauth-state&error_description=needs+consent`,
          { headers: { 'cf-connecting-ip': '1.1.1.1' } },
        ),
        baseEnv,
        createContext(baseEnv),
      )

      expect(response.status).toBe(200)
      expect(response.headers.get('cross-origin-opener-policy')).toBe('unsafe-none')
    }

    expect(forwardedUrls).toEqual(
      ['facebook', 'x', 'github'].map(
        provider =>
          `https://backend.example.com/api/v1/auth/oauth/${provider}/broker-callback?code=abc%2B123&state=oauth-state&error_description=needs+consent`,
      ),
    )
  })

  it('preserves the backend no-referrer policy on broker callback redirects', async () => {
    globalThis.fetch = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(
        new Response(null, {
          status: 302,
          headers: {
            location: 'https://staging.voucha.ai/auth/callback/broker?flow_id=flow-id',
            'referrer-policy': 'no-referrer',
          },
        }),
      ),
    ) as unknown as typeof fetch

    const response = await worker.fetch(
      new Request(
        'https://staging.voucha.ai/auth/callback/github/broker?code=secret-code&state=secret-state',
        { headers: { 'cf-connecting-ip': '1.1.1.1' } },
      ),
      baseEnv,
      createContext(baseEnv),
    )

    expect(response.status).toBe(302)
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
  })

  it.each([
    ['POST', '/auth/callback/facebook/broker'],
    ['HEAD', '/auth/callback/x/broker'],
    ['GET', '/auth/callback/google/broker'],
    ['GET', '/auth/callback/github/brokered'],
    ['GET', '/auth/callback/github/broker/extra'],
  ])('protects callback near miss %s %s', async (method, pathname) => {
    const response = await worker.fetch(
      new Request(`https://staging.voucha.ai${pathname}`, {
        method,
        headers: { 'cf-connecting-ip': '1.1.1.1' },
      }),
      baseEnv,
      createContext(baseEnv),
    )

    expect(response.status).toBe(401)
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })
})
