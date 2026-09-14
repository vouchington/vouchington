import { afterEach, describe, expect, it, vi } from 'vitest'
import worker from '../index.mts'
import { STAGING_AUTHORIZATION_HEADER } from '../basic-auth.mts'
import { createContext, restoreGlobals } from '../../test-helpers/src/mock-env.mts'
import type { Env } from '../types.mts'

const BASIC = `Basic ${btoa('staging:password')}`

describe('staging dual authorization', () => {
  afterEach(() => {
    restoreGlobals()
    vi.restoreAllMocks()
  })

  it('accepts secondary Basic while preserving primary backend Bearer through the limiter path', async () => {
    const fetchSpy = vi.fn<VitestLooseMock>(() => Promise.resolve(new Response('ok')))
    const limiter = vi.fn<VitestLooseMock>(() => ({ success: true }))
    globalThis.fetch = fetchSpy as unknown as typeof fetch
    const env: Env = {
      BACKEND_ORIGIN: 'https://backend.example.com',
      BASIC_AUTH_CREDENTIALS: 'staging:password',
      RATE_LIMITER_GET_HEAD: { limit: limiter },
    }

    const response = await worker.fetch(
      new Request('https://voucha.ai/api/v1/posts', {
        headers: {
          authorization: 'Bearer backend-token',
          [STAGING_AUTHORIZATION_HEADER]: BASIC,
          'cf-connecting-ip': '1.1.1.1',
        },
      }),
      env,
      createContext(env),
    )

    const originRequest = fetchSpy.mock.calls[0]![0] as Request
    expect(response.status).toBe(200)
    expect(response.headers.get('x-voucha-cache')).toBe('BYPASS')
    expect(response.headers.get(STAGING_AUTHORIZATION_HEADER)).toBeNull()
    expect(limiter).toHaveBeenCalledTimes(1)
    expect(originRequest.headers.get('authorization')).toBe('Bearer backend-token')
    expect(originRequest.headers.get(STAGING_AUTHORIZATION_HEADER)).toBeNull()
  })

  it.each([
    ['invalid secondary', 'Basic invalid'],
    ['missing secondary', undefined],
    ['ambiguous dual Basic', BASIC],
    ['duplicate secondary', `${BASIC}, ${BASIC}`],
  ])('rejects %s credentials', async (label, secondary) => {
    const fetchSpy = vi.fn<VitestLooseMock>(() => Promise.resolve(new Response('unexpected')))
    globalThis.fetch = fetchSpy as unknown as typeof fetch
    const headers: Record<string, string> = {
      authorization: label === 'ambiguous dual Basic' ? BASIC : 'Bearer backend-token',
    }
    if (secondary) headers[STAGING_AUTHORIZATION_HEADER] = secondary

    const response = await worker.fetch(
      new Request('https://voucha.ai/api/v1/posts', { headers }),
      { BACKEND_ORIGIN: 'https://backend.example.com', BASIC_AUTH_CREDENTIALS: 'staging:password' },
      createContext(),
    )

    expect(response.status).toBe(401)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('strips the secondary header from non-backend origins', async () => {
    const fetchSpy = vi.fn<VitestLooseMock>(() => Promise.resolve(new Response('web')))
    globalThis.fetch = fetchSpy as unknown as typeof fetch
    const env: Env = {
      WEB_ORIGIN: 'https://web.example.com',
      BASIC_AUTH_CREDENTIALS: 'staging:password',
    }
    await worker.fetch(
      new Request('https://voucha.ai/about', {
        headers: { authorization: 'Bearer ignored', [STAGING_AUTHORIZATION_HEADER]: BASIC },
      }),
      env,
      createContext(env),
    )

    const originRequest = fetchSpy.mock.calls[0]![0] as Request
    expect(originRequest.headers.get('authorization')).toBeNull()
    expect(originRequest.headers.get(STAGING_AUTHORIZATION_HEADER)).toBeNull()
  })

  it('has no authentication effect when Basic Auth is unset and still strips the header', async () => {
    const fetchSpy = vi.fn<VitestLooseMock>(() => Promise.resolve(new Response('ok')))
    globalThis.fetch = fetchSpy as unknown as typeof fetch
    const env: Env = { BACKEND_ORIGIN: 'https://backend.example.com' }
    const response = await worker.fetch(
      new Request('https://voucha.ai/api/v1/posts', {
        headers: {
          authorization: 'Bearer backend-token',
          [STAGING_AUTHORIZATION_HEADER]: 'Basic ignored',
        },
      }),
      env,
      createContext(env),
    )

    const originRequest = fetchSpy.mock.calls[0]![0] as Request
    expect(response.status).toBe(200)
    expect(originRequest.headers.get('authorization')).toBe('Bearer backend-token')
    expect(originRequest.headers.get(STAGING_AUTHORIZATION_HEADER)).toBeNull()
  })

  it('never relays an ignored secondary header into the cache RPC', async () => {
    const env: Env = { BACKEND_ORIGIN: 'https://backend.example.com' }
    const context = createContext(env)
    const dispatchSpy = vi.spyOn(context.exports.CachedOrigin, 'fetch')
    await worker.fetch(
      new Request('https://voucha.ai/api/v1/posts', {
        headers: { [STAGING_AUTHORIZATION_HEADER]: 'Basic ignored' },
      }),
      env,
      context,
    )

    const dispatchRequest = dispatchSpy.mock.calls[0]![0]
    expect(dispatchRequest.headers.get(STAGING_AUTHORIZATION_HEADER)).toBeNull()
  })
})
