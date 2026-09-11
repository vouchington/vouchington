import { describe, expect, it } from 'vitest'
import { dispatchToCachedOrigin, type CacheDispatchInput } from '../cache-dispatch.mts'
import type { EdgeExecutionContext, Env } from '../types.mts'

const unusedPurge = () => Promise.reject(new Error('purge unexpectedly called in this test'))

const buildContext = (
  fetchImpl: (request: Request) => Promise<Response>,
): EdgeExecutionContext => ({
  waitUntil: () => {},
  exports: { CachedOrigin: { fetch: request => fetchImpl(request), purge: unusedPurge } },
})

const baseInput = (overrides: Partial<CacheDispatchInput> = {}): CacheDispatchInput => ({
  audience: 'anon',
  botTier: null,
  context: buildContext(() => Promise.resolve(new Response('ok'))),
  cspNonce: 'real-per-request-nonce',
  dispatchUrl: new URL('https://voucha.ai/api/v1/posts'),
  edgeSession: { kind: 'anon-passthrough' },
  env: {} as Env,
  ip: null,
  isProduction: false,
  isRsc: false,
  method: 'GET',
  requestId: 'test-request-id',
  target: 'backend',
  ...overrides,
})

describe('dispatchToCachedOrigin Vary restoration', () => {
  it('restores safe tunneled tokens and adds auth dimensions for anonymous backend JSON', async () => {
    const context = buildContext(() =>
      Promise.resolve(
        new Response('ok', {
          headers: {
            vary: 'accept-language, COOKIE',
            'x-voucha-cache-vary': 'Accept-Encoding, Next-Url, cookie',
          },
        }),
      ),
    )

    const response = await dispatchToCachedOrigin(baseInput({ context }))

    expect(response.headers.get('vary')).toBe(
      'accept-language, COOKIE, Accept-Encoding, Next-Url, Authorization',
    )
    expect(response.headers.get('x-voucha-cache-vary')).toBeNull()
  })

  it('adds Cookie and Authorization without an origin marker', async () => {
    const response = await dispatchToCachedOrigin(baseInput())

    expect(response.headers.get('vary')).toBe('Cookie, Authorization')
  })

  it.each([
    { audience: 'bot' as const, target: 'backend' as const },
    { audience: 'static' as const, target: 'backend' as const },
    { audience: 'anon' as const, target: 'web' as const },
  ])('does not add auth dimensions for $audience $target responses', async overrides => {
    const response = await dispatchToCachedOrigin(baseInput(overrides))

    expect(response.headers.get('vary')).toBeNull()
  })

  it('preserves Vary star and never leaks the internal marker', async () => {
    const context = buildContext(() =>
      Promise.resolve(
        new Response('ok', {
          headers: { vary: '*', 'x-voucha-cache-vary': 'Cookie, Authorization' },
        }),
      ),
    )

    const response = await dispatchToCachedOrigin(baseInput({ context }))

    expect(response.headers.get('vary')).toBe('*')
    expect(response.headers.get('x-voucha-cache-vary')).toBeNull()
  })

  it('drops an invalid internal marker instead of reflecting it to the client', async () => {
    const context = buildContext(() =>
      Promise.resolve(
        new Response('ok', { headers: { 'x-voucha-cache-vary': 'Cookie, X-Smuggled' } }),
      ),
    )

    const response = await dispatchToCachedOrigin(baseInput({ context }))

    expect(response.headers.get('vary')).toBe('Cookie, Authorization')
    expect(response.headers.get('x-voucha-cache-vary')).toBeNull()
  })
})
