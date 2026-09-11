import { afterEach, describe, expect, it, vi } from 'vitest'
import { CachedOrigin } from '../cached-origin.mts'
import { EDGE_CACHE_CANARY_PATH, EDGE_CACHE_CANARY_TAG } from '../staging-canary.mts'
import { INTERNAL_CANARY_FAULT_HEADER } from '../staging-control-headers.mts'
import type { Env } from '../types.mts'

const buildOrigin = (env: Env) =>
  new CachedOrigin(
    {
      props: { audience: 'anon', isRsc: false },
      waitUntil: () => {},
      passThroughOnException: () => {},
    },
    env,
  )

describe('CachedOrigin edge cache canary', () => {
  afterEach(() => vi.restoreAllMocks())

  it('generates dedicated anonymous cache bytes with the configured TTL policy and tag', async () => {
    const fetchSpy = vi.fn<VitestLooseMock>(() => Promise.resolve(new Response('unexpected')))
    globalThis.fetch = fetchSpy as unknown as typeof fetch
    const origin = buildOrigin({ ANON_CACHE_TTL_SECONDS: '30', PRODUCTION: 'false' })

    const first = await origin.fetch(new Request(`https://voucha.ai${EDGE_CACHE_CANARY_PATH}`))
    const second = await origin.fetch(new Request(`https://voucha.ai${EDGE_CACHE_CANARY_PATH}`))
    const firstBody = (await first.json()) as { generatedAt: string; generation: string }
    const secondBody = (await second.json()) as { generation: string }

    expect(first.status).toBe(200)
    expect(first.headers.get('cache-control')).toBe(
      'public, max-age=30, stale-while-revalidate=60, stale-if-error=86400',
    )
    expect(first.headers.get('cache-tag')).toBe(EDGE_CACHE_CANARY_TAG)
    expect(firstBody.generation).toMatch(/^[0-9a-f-]{36}$/)
    expect(Date.parse(firstBody.generatedAt)).not.toBeNaN()
    expect(secondBody.generation).not.toBe(firstBody.generation)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('returns a no-store synthetic 503 for the validated SIE fault', async () => {
    const response = await buildOrigin({ PRODUCTION: 'false' }).fetch(
      new Request(`https://voucha.ai${EDGE_CACHE_CANARY_PATH}`, {
        headers: { [INTERNAL_CANARY_FAULT_HEADER]: 'sie' },
      }),
    )

    expect(response.status).toBe(503)
    expect(response.headers.get('cache-control')).toContain('no-store')
  })

  it('is hard-disabled in production', async () => {
    const fetchSpy = vi.fn<VitestLooseMock>(() => Promise.resolve(new Response('unexpected')))
    globalThis.fetch = fetchSpy as unknown as typeof fetch
    const response = await buildOrigin({ PRODUCTION: 'true' }).fetch(
      new Request(`https://voucha.ai${EDGE_CACHE_CANARY_PATH}`),
    )

    expect(response.status).toBe(404)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
