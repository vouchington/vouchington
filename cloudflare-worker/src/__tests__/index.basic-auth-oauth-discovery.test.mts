import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import worker from '../index.mts'
import {
  createContext,
  restoreGlobals,
  setupMemoryCaches,
} from '../../test-helpers/src/mock-env.mts'
import type { Env } from '../types.mts'

const baseEnv: Env = {
  BACKEND_ORIGIN: 'https://backend.example.com',
  WEB_ORIGIN: 'https://web.example.com',
  BASIC_AUTH_CREDENTIALS: 'alice:hunter2',
}

const OAUTH_DISCOVERY_PATHS = [
  '/.well-known/oauth-authorization-server',
  '/.well-known/oauth-protected-resource/api/v1/mcp',
  '/.well-known/oauth-protected-resource/api/v1/admin/mcp',
]

async function fetchFromStaging(method: string, path: string): Promise<Response> {
  return worker.fetch(
    new Request(`https://staging.voucha.ai${path}`, {
      method,
      headers: { 'cf-connecting-ip': '1.1.1.1' },
      ...(method === 'POST' && { body: '{}' }),
    }),
    baseEnv,
    createContext(baseEnv),
  )
}

describe('staging OAuth discovery Basic Auth exemptions', () => {
  beforeEach(() => {
    setupMemoryCaches()
    globalThis.fetch = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(new Response('{}', { headers: { 'content-type': 'application/json' } })),
    ) as unknown as typeof fetch
  })

  afterEach(() => {
    restoreGlobals()
    vi.restoreAllMocks()
  })

  it.each(OAUTH_DISCOVERY_PATHS)(
    'forwards the anonymous discovery document GET %s to the backend',
    async path => {
      const response = await fetchFromStaging('GET', path)

      expect(response.status).toBe(200)
      expect(globalThis.fetch).toHaveBeenCalledOnce()
      const forwarded = vi.mocked(globalThis.fetch).mock.calls[0]?.[0] as Request
      expect(new URL(forwarded.url).origin).toBe(baseEnv.BACKEND_ORIGIN)
    },
  )

  it.each([
    ...OAUTH_DISCOVERY_PATHS.map(path => ['POST', path]),
    ['GET', '/.well-known/oauth-protected-resource'],
    ['GET', '/.well-known/oauth-protected-resource/api/v1/users'],
  ])('keeps the wrong-method or neighboring path protected: %s %s', async (method, path) => {
    const response = await fetchFromStaging(method, path)

    expect(response.status).toBe(401)
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })
})
