import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import worker from '../index.mts'
import {
  createContext,
  restoreGlobals,
  setupMemoryCaches,
} from '../../test-helpers/src/mock-env.mts'
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

  it('forwards Google Pub/Sub Bearer auth without staging Basic Auth or browser cookies', async () => {
    let capturedRequest: Request | undefined
    globalThis.fetch = vi.fn<VitestLooseMock>((request: Request) => {
      capturedRequest = request
      return Promise.resolve(new Response('accepted', { status: 202 }))
    }) as unknown as typeof fetch

    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      BASIC_AUTH_CREDENTIALS: 'staging:password',
    }
    const response = await worker.fetch(
      new Request('https://staging.voucha.ai/api/v1/memberships/google-play/notifications', {
        method: 'POST',
        headers: {
          authorization: 'Bearer google-pubsub-jwt',
          cookie: 'dt=stale-device-token; st=stale-session-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ message: { data: 'e30=' } }),
      }),
      env,
      createContext(env),
    )

    expect(response.status).toBe(202)
    expect(capturedRequest?.headers.get('authorization')).toBe('Bearer google-pubsub-jwt')
    expect(capturedRequest?.headers.get('cookie')).toBeNull()
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
