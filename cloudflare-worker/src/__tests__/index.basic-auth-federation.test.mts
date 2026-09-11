import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import worker from '../index.mts'
import { createContext, restoreGlobals, setupMemoryCaches } from '../test-helpers/mock-env.mts'
import type { Env } from '../types.mts'

const baseEnv: Env = {
  BACKEND_ORIGIN: 'https://backend.example.com',
  WEB_ORIGIN: 'https://web.example.com',
  BASIC_AUTH_CREDENTIALS: 'alice:hunter2',
}

describe('staging federation Basic Auth exemptions', () => {
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

  it.each([
    ['GET', '/.well-known/webfinger'],
    ['GET', '/.well-known/nodeinfo'],
    ['GET', '/nodeinfo/2.0'],
    ['GET', '/ap/users/23b0a75f-b618-4477-8e7d-87e44967727a'],
    ['POST', '/ap/inbox'],
    ['GET', '/client-metadata.json'],
  ])(
    'allows the public federation machine route %s %s without Basic credentials',
    async (method, path) => {
      const response = await worker.fetch(
        new Request(`https://staging.voucha.ai${path}`, {
          method,
          headers: { 'cf-connecting-ip': '1.1.1.1' },
          ...(method === 'POST' && { body: '{}' }),
        }),
        baseEnv,
        createContext(baseEnv),
      )

      expect(response.status).toBe(200)
      expect(globalThis.fetch).toHaveBeenCalledOnce()
    },
  )

  it.each([
    ['POST', '/.well-known/webfinger'],
    ['HEAD', '/.well-known/nodeinfo'],
    ['GET', '/nodeinfo/2.1'],
    ['GET', '/ap/users/not-a-uuid'],
    ['GET', '/ap/users/23b0a75f-b618-4477-8e7d-87e44967727a/inbox'],
    ['GET', '/ap/inbox'],
    ['POST', '/client-metadata.json'],
  ])(
    'keeps the neighboring or wrong-method federation route protected: %s %s',
    async (method, path) => {
      const response = await worker.fetch(
        new Request(`https://staging.voucha.ai${path}`, {
          method,
          headers: { 'cf-connecting-ip': '1.1.1.1' },
          ...(method === 'POST' && { body: '{}' }),
        }),
        baseEnv,
        createContext(baseEnv),
      )

      expect(response.status).toBe(401)
      expect(globalThis.fetch).not.toHaveBeenCalled()
    },
  )
})
