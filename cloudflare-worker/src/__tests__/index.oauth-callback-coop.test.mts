import { afterEach, describe, expect, it, vi } from 'vitest'

import worker from '../index.mts'
import { createContext, restoreGlobals } from '../../test-helpers/src/mock-env.mts'
import type { Env } from '../types.mts'

describe('OAuth callback COOP', () => {
  afterEach(() => {
    restoreGlobals()
    vi.restoreAllMocks()
  })

  it('uses unsafe-none only for callback documents', async () => {
    // CachedOrigin fetches the web origin on a miss. Stub that call so the
    // network allowlist does not observe a socket to the web origin.
    const fetchSpy = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(new Response('document', { headers: { 'content-type': 'text/html' } })),
    )
    globalThis.fetch = fetchSpy as unknown as typeof fetch
    const env = { WEB_ORIGIN: 'https://web.example.com' } as Env
    const context = createContext(env)

    const callback = await worker.fetch(
      new Request('https://voucha.ai/auth/callback/github'),
      env,
      context,
    )
    const ordinary = await worker.fetch(new Request('https://voucha.ai/about'), env, context)

    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(callback.headers.get('cross-origin-opener-policy')).toBe('unsafe-none')
    expect(ordinary.headers.get('cross-origin-opener-policy')).toBe('same-origin-allow-popups')
  })
})
