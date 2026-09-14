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
}

const CREDS = 'alice:hunter2,bob:s3cr3t'

const encodeCreds = (userPass: string) => `Basic ${btoa(userPass)}`

describe('staging basic auth', () => {
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

  it('returns 401 with WWW-Authenticate when creds are set and no Authorization header', async () => {
    const env: Env = { ...baseEnv, BASIC_AUTH_CREDENTIALS: CREDS }

    const response = await worker.fetch(
      new Request('https://staging.voucha.ai/', {
        headers: { 'cf-connecting-ip': '1.1.1.1' },
      }),
      env,
      createContext(env),
    )

    expect(response.status).toBe(401)
    expect(response.headers.get('www-authenticate')).toMatch(/^Basic realm=/)
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0, must-revalidate')
    expect(response.headers.get('cdn-cache-control')).toBe('no-store')
    expect(response.headers.get('cloudflare-cdn-cache-control')).toBe('no-store')
    expect(await response.json()).toMatchObject({
      message: 'Authentication required',
      code: 'UNAUTHORIZED',
    })
  })

  it('returns 401 on wrong credentials', async () => {
    const env: Env = { ...baseEnv, BASIC_AUTH_CREDENTIALS: CREDS }

    const response = await worker.fetch(
      new Request('https://staging.voucha.ai/', {
        headers: {
          'cf-connecting-ip': '1.1.1.1',
          authorization: encodeCreds('alice:wrongpass'),
        },
      }),
      env,
      createContext(env),
    )

    expect(response.status).toBe(401)
  })

  it.each(['Bearer some-token', 'Basic A'])(
    'returns 401 on malformed / non-Basic Authorization header: %s',
    async authorization => {
      const env: Env = { ...baseEnv, BASIC_AUTH_CREDENTIALS: CREDS }

      const response = await worker.fetch(
        new Request('https://staging.voucha.ai/', {
          headers: { 'cf-connecting-ip': '1.1.1.1', authorization },
        }),
        env,
        createContext(env),
      )

      expect(response.status).toBe(401)
      expect(globalThis.fetch).not.toHaveBeenCalled()
    },
  )

  it('passes through (200) with the first credential in the list', async () => {
    const env: Env = { ...baseEnv, BASIC_AUTH_CREDENTIALS: CREDS }

    const response = await worker.fetch(
      new Request('https://staging.voucha.ai/', {
        headers: {
          'cf-connecting-ip': '1.1.1.1',
          authorization: encodeCreds('alice:hunter2'),
        },
      }),
      env,
      createContext(env),
    )

    expect(response.status).toBe(200)
    expect(globalThis.fetch).toHaveBeenCalled()
  })

  it('passes through (200) with the second credential (rotation coverage)', async () => {
    const env: Env = { ...baseEnv, BASIC_AUTH_CREDENTIALS: CREDS }

    const response = await worker.fetch(
      new Request('https://staging.voucha.ai/', {
        headers: {
          'cf-connecting-ip': '1.1.1.1',
          authorization: encodeCreds('bob:s3cr3t'),
        },
      }),
      env,
      createContext(env),
    )

    expect(response.status).toBe(200)
    expect(globalThis.fetch).toHaveBeenCalled()
  })

  it('passes through (gate disabled) when BASIC_AUTH_CREDENTIALS is unset', async () => {
    const env: Env = { ...baseEnv }

    const response = await worker.fetch(
      new Request('https://staging.voucha.ai/', {
        headers: { 'cf-connecting-ip': '1.1.1.1' },
      }),
      env,
      createContext(env),
    )

    expect(response.status).toBe(200)
    expect(globalThis.fetch).toHaveBeenCalled()
  })

  it.each([
    ['/api/v1/mcp', 'Bearer voucha_mcp_test'],
    ['/api/v1/admin/mcp', 'Bearer voucha_admin_mcp_test'],
  ])(
    'allowlist: %s passes through with a Bearer token (no Basic creds)',
    async (path, authorization) => {
      const env: Env = { ...baseEnv, BASIC_AUTH_CREDENTIALS: CREDS }

      const response = await worker.fetch(
        new Request(`https://staging.voucha.ai${path}`, {
          method: 'POST',
          headers: {
            'cf-connecting-ip': '1.1.1.1',
            authorization,
            'content-type': 'application/json',
          },
          body: '{}',
        }),
        env,
        createContext(env),
      )

      expect(response.status).not.toBe(401)
      expect(globalThis.fetch).toHaveBeenCalled()
    },
  )

  it('requires Basic Auth on wrong-method machine routes', async () => {
    const env: Env = { ...baseEnv, BASIC_AUTH_CREDENTIALS: CREDS }

    const response = await worker.fetch(
      new Request('https://staging.voucha.ai/api/v1/mcp', {
        headers: {
          'cf-connecting-ip': '1.1.1.1',
          authorization: 'Bearer voucha_mcp_test',
        },
      }),
      env,
      createContext(env),
    )

    expect(response.status).toBe(401)
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('allowlist: /infra/ping passes through without credentials', async () => {
    const env: Env = { ...baseEnv, BASIC_AUTH_CREDENTIALS: CREDS }

    const response = await worker.fetch(
      new Request('https://staging.voucha.ai/infra/ping', {
        headers: { 'cf-connecting-ip': '1.1.1.1' },
      }),
      env,
      createContext(env),
    )

    expect(response.status).not.toBe(401)
    expect(globalThis.fetch).toHaveBeenCalled()
  })

  it('allowlist: /manifest.webmanifest passes through without credentials', async () => {
    const env: Env = { ...baseEnv, BASIC_AUTH_CREDENTIALS: CREDS }

    const response = await worker.fetch(
      new Request('https://staging.voucha.ai/manifest.webmanifest', {
        headers: { 'cf-connecting-ip': '1.1.1.1' },
      }),
      env,
      createContext(env),
    )

    expect(response.status).not.toBe(401)
    expect(globalThis.fetch).toHaveBeenCalled()
  })

  it('requires Basic Auth on wrong-method manifest requests', async () => {
    const env: Env = { ...baseEnv, BASIC_AUTH_CREDENTIALS: CREDS }

    const response = await worker.fetch(
      new Request('https://staging.voucha.ai/manifest.webmanifest', {
        method: 'POST',
        headers: { 'cf-connecting-ip': '1.1.1.1' },
      }),
      env,
      createContext(env),
    )

    expect(response.status).toBe(401)
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('security headers are applied to the 401 response', async () => {
    const env: Env = { ...baseEnv, BASIC_AUTH_CREDENTIALS: CREDS }

    const response = await worker.fetch(
      new Request('https://staging.voucha.ai/', {
        headers: { 'cf-connecting-ip': '1.1.1.1' },
      }),
      env,
      createContext(env),
    )

    expect(response.status).toBe(401)
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
  })

  it('x-robots-tag is applied to the 401 when NOINDEX is set', async () => {
    const env: Env = { ...baseEnv, BASIC_AUTH_CREDENTIALS: CREDS, NOINDEX: 'true' }

    const response = await worker.fetch(
      new Request('https://staging.voucha.ai/', {
        headers: { 'cf-connecting-ip': '1.1.1.1' },
      }),
      env,
      createContext(env),
    )

    expect(response.status).toBe(401)
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow, noarchive')
  })

  it('Authorization: Basic header is stripped before forwarding to origin', async () => {
    const env: Env = { ...baseEnv, BASIC_AUTH_CREDENTIALS: CREDS }
    let capturedRequest: Request | undefined

    globalThis.fetch = vi.fn<VitestLooseMock>((req: Request) => {
      capturedRequest = req
      return Promise.resolve(new Response('ok'))
    }) as unknown as typeof fetch

    await worker.fetch(
      new Request('https://staging.voucha.ai/', {
        headers: {
          'cf-connecting-ip': '1.1.1.1',
          authorization: encodeCreds('alice:hunter2'),
        },
      }),
      env,
      createContext(env),
    )

    expect(capturedRequest?.headers.get('authorization')).toBeNull()
  })
})
