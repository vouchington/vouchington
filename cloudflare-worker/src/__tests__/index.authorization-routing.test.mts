import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import worker from '../index.mts'
import { createContext, restoreGlobals, setupMemoryCaches } from '../test-helpers/mock-env.mts'
import type { Env } from '../types.mts'

describe('worker Authorization routing', () => {
  beforeEach(() => {
    setupMemoryCaches()
  })

  afterEach(() => {
    restoreGlobals()
    vi.restoreAllMocks()
  })

  it('bypasses CachedOrigin for backend Bearer auth and forwards the credential', async () => {
    let capturedRequest: Request | undefined
    globalThis.fetch = vi.fn<VitestLooseMock>((request: Request) => {
      capturedRequest = request
      return Promise.resolve(new Response('ok'))
    }) as unknown as typeof fetch

    const env: Env = { BACKEND_ORIGIN: 'https://backend.example.com' }
    const context = createContext(env)
    const response = await worker.fetch(
      new Request('https://voucha.ai/api/v1/posts', {
        headers: { authorization: 'Bearer backend-token' },
      }),
      env,
      context,
    )

    expect(response.headers.get('x-voucha-cache')).toBe('BYPASS')
    expect(capturedRequest?.headers.get('authorization')).toBe('Bearer backend-token')
  })

  it('keeps valid staging Basic auth cache eligible and strips it before backend origin', async () => {
    let capturedRequest: Request | undefined
    globalThis.fetch = vi.fn<VitestLooseMock>((request: Request) => {
      capturedRequest = request
      return Promise.resolve(new Response('ok'))
    }) as unknown as typeof fetch

    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      BASIC_AUTH_CREDENTIALS: 'staging:password',
    }
    const response = await worker.fetch(
      new Request('https://voucha.ai/api/v1/posts', {
        headers: { authorization: `Basic ${btoa('staging:password')}` },
      }),
      env,
      createContext(env),
    )

    expect(response.headers.get('x-voucha-cache')).toBe('DISPATCHED')
    expect(capturedRequest?.headers.get('authorization')).toBeNull()
  })

  it('never forwards Bearer authorization to non-backend origins', async () => {
    let capturedRequest: Request | undefined
    globalThis.fetch = vi.fn<VitestLooseMock>((request: Request) => {
      capturedRequest = request
      return Promise.resolve(new Response('ok'))
    }) as unknown as typeof fetch

    const env: Env = { WEB_ORIGIN: 'https://web.example.com' }
    const response = await worker.fetch(
      new Request('https://voucha.ai/login', {
        headers: { authorization: 'Bearer must-not-leak' },
      }),
      env,
      createContext(env),
    )

    expect(response.headers.get('x-voucha-cache')).toBe('BYPASS')
    expect(capturedRequest?.headers.get('authorization')).toBeNull()
  })
})
