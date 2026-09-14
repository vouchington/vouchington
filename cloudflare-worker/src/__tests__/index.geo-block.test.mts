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

describe('geo-blocking', () => {
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

  it('returns 403 for a blocked country', async () => {
    const env: Env = { ...baseEnv, GEO_BLOCKED_COUNTRIES: 'CN,IR,RU' }

    const response = await worker.fetch(
      new Request('https://voucha.ai/', {
        headers: { 'cf-ray': 'test-ray', 'cf-ipcountry': 'CN', 'cf-connecting-ip': '1.1.1.1' },
      }),
      env,
      createContext(env),
    )

    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({
      message: 'Access denied',
      code: 'FORBIDDEN',
    })
  })

  it('returns 403 for all countries in the default list', async () => {
    const defaultList = 'CN,HK,IR,RU,KP,BY,SY,VE,CU,MM,SD'
    const env: Env = { ...baseEnv, GEO_BLOCKED_COUNTRIES: defaultList }

    for (const code of defaultList.split(',')) {
      const response = await worker.fetch(
        new Request('https://voucha.ai/', {
          headers: {
            'cf-ray': 'test-ray',
            'cf-ipcountry': code,
            'cf-connecting-ip': '1.1.1.1',
          },
        }),
        env,
        createContext(env),
      )
      expect(response.status).toBe(403)
    }
  })

  it('allows requests from unblocked countries', async () => {
    const env: Env = { ...baseEnv, GEO_BLOCKED_COUNTRIES: 'CN,IR,RU' }

    const response = await worker.fetch(
      new Request('https://voucha.ai/', {
        headers: { 'cf-ray': 'test-ray', 'cf-ipcountry': 'US', 'cf-connecting-ip': '1.1.1.1' },
      }),
      env,
      createContext(env),
    )

    expect(response.status).toBe(200)
    expect(globalThis.fetch).toHaveBeenCalled()
  })

  it('allows requests when GEO_BLOCKED_COUNTRIES is empty (blocking disabled)', async () => {
    const env: Env = { ...baseEnv, GEO_BLOCKED_COUNTRIES: '' }

    const response = await worker.fetch(
      new Request('https://voucha.ai/', {
        headers: { 'cf-ray': 'test-ray', 'cf-ipcountry': 'CN', 'cf-connecting-ip': '1.1.1.1' },
      }),
      env,
      createContext(env),
    )

    expect(response.status).toBe(200)
    expect(globalThis.fetch).toHaveBeenCalled()
  })

  it('allows requests when GEO_BLOCKED_COUNTRIES is unset', async () => {
    const env: Env = { ...baseEnv }
    // GEO_BLOCKED_COUNTRIES not set

    const response = await worker.fetch(
      new Request('https://voucha.ai/', {
        headers: { 'cf-ray': 'test-ray', 'cf-ipcountry': 'CN', 'cf-connecting-ip': '1.1.1.1' },
      }),
      env,
      createContext(env),
    )

    expect(response.status).toBe(200)
    expect(globalThis.fetch).toHaveBeenCalled()
  })

  it('returns 403 when cf-ray is present but cf-ipcountry is absent (regression #3741)', async () => {
    const env: Env = { ...baseEnv, GEO_BLOCKED_COUNTRIES: 'CN,IR,RU' }

    const response = await worker.fetch(
      new Request('https://voucha.ai/', {
        headers: { 'cf-ray': 'test-ray', 'cf-connecting-ip': '1.1.1.1' },
        // cf-ipcountry intentionally omitted with cf-ray present — fail-closed path
      }),
      env,
      createContext(env),
    )

    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({
      message: 'Access denied',
      code: 'FORBIDDEN',
    })
  })

  it('allows requests when both cf-ray and cf-ipcountry are absent (local dev)', async () => {
    const env: Env = { ...baseEnv, GEO_BLOCKED_COUNTRIES: 'CN,IR,RU' }

    const response = await worker.fetch(
      new Request('https://voucha.ai/', {
        headers: { 'cf-connecting-ip': '1.1.1.1' },
        // neither cf-ray nor cf-ipcountry — local dev / CI scenario
      }),
      env,
      createContext(env),
    )

    expect(response.status).toBe(200)
    expect(globalThis.fetch).toHaveBeenCalled()
  })

  it('security headers are applied to 403 geo-block responses', async () => {
    const env: Env = { ...baseEnv, GEO_BLOCKED_COUNTRIES: 'CN' }

    const response = await worker.fetch(
      new Request('https://voucha.ai/', {
        headers: { 'cf-ray': 'test-ray', 'cf-ipcountry': 'CN', 'cf-connecting-ip': '1.1.1.1' },
      }),
      env,
      createContext(env),
    )

    expect(response.status).toBe(403)
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
  })

  it('rate limiter is not consumed for geo-blocked requests', async () => {
    const rateLimiterCalls: string[] = []
    const env: Env = {
      ...baseEnv,
      GEO_BLOCKED_COUNTRIES: 'CN',
      RATE_LIMITER_GET_HEAD: {
        limit: ({ key }) => {
          rateLimiterCalls.push(key)
          return { success: true }
        },
      },
    }

    const response = await worker.fetch(
      new Request('https://voucha.ai/', {
        headers: { 'cf-ray': 'test-ray', 'cf-ipcountry': 'CN', 'cf-connecting-ip': '1.1.1.1' },
      }),
      env,
      createContext(env),
    )

    expect(response.status).toBe(403)
    expect(rateLimiterCalls).toHaveLength(0)
  })
})
