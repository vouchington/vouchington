import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import worker from '../index.mts'
import { createContext, restoreGlobals, setupMemoryCaches } from '../test-helpers/mock-env.mts'
import type { Env } from '../types.mts'

const notificationPath = '/api/v1/memberships/apple-app-store/notifications'

describe('Apple App Store notification ingress', () => {
  beforeEach(() => {
    setupMemoryCaches()
  })

  afterEach(() => {
    restoreGlobals()
    vi.restoreAllMocks()
  })

  it('bypasses staging Basic Auth and browser sessions while retaining origin authentication', async () => {
    let capturedRequest: Request | undefined
    globalThis.fetch = vi.fn<VitestLooseMock>((request: Request): Promise<Response> => {
      capturedRequest = request
      return Promise.resolve(new Response('accepted', { status: 202 }))
    }) as unknown as typeof fetch
    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'https://web.example.com',
      BASIC_AUTH_CREDENTIALS: 'staging:password',
      CF_WORKER_SECRET: 'worker-origin-secret',
    }
    const payload = JSON.stringify({ signedPayload: 'apple-jws' })

    const response = await worker.fetch(
      new Request(`https://staging.voucha.ai${notificationPath}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: 'dt=browser-device; st=browser-session',
        },
        body: payload,
      }),
      env,
      createContext(env),
    )

    expect(response.status).toBe(202)
    expect(response.headers.get('set-cookie')).toBeNull()
    expect(capturedRequest?.headers.get('cookie')).toBeNull()
    expect(capturedRequest?.headers.get('x-cf-worker-secret')).toBe('worker-origin-secret')
    expect(await capturedRequest?.text()).toBe(payload)
  })

  it('keeps neighboring methods behind staging Basic Auth', async () => {
    const fetchSpy = vi.fn<VitestLooseMock>(() => Promise.resolve(new Response('unexpected')))
    globalThis.fetch = fetchSpy as unknown as typeof fetch
    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      WEB_ORIGIN: 'https://web.example.com',
      BASIC_AUTH_CREDENTIALS: 'staging:password',
    }

    const response = await worker.fetch(
      new Request(`https://staging.voucha.ai${notificationPath}`),
      env,
      createContext(env),
    )

    expect(response.status).toBe(401)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
