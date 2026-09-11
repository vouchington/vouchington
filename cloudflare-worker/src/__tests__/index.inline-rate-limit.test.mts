import { afterEach, describe, expect, it, vi } from 'vitest'
import worker from '../index.mts'
import { createContext, restoreGlobals } from '../test-helpers/mock-env.mts'
import type { Env } from '../types.mts'

describe('worker-owned inline response rate-limit exemptions', () => {
  afterEach(() => {
    restoreGlobals()
    vi.restoreAllMocks()
  })

  it.each(['/robots.txt', '/llms.txt', '/.well-known/api-catalog'])(
    'serves %s without consulting identity or bot limiters when cache dispatch is unavailable',
    async pathname => {
      const identityLimiter = vi.fn<VitestLooseMock>(() => ({ success: false }))
      const botLimiter = vi.fn<VitestLooseMock>(() => ({ success: false }))
      const env: Env = {
        CACHE_PLACEHOLDER_NONCE: 'invalid',
        RATE_LIMITER_GET_HEAD: { limit: identityLimiter },
        RATE_LIMITER_BOT_GET_HEAD: { limit: botLimiter },
      }

      const response = await worker.fetch(
        new Request(`https://voucha.ai${pathname}`, {
          headers: { 'cf-connecting-ip': '1.1.1.1', 'user-agent': 'MyGenericBot/1.0' },
        }),
        env,
        createContext(env),
      )

      expect(response.status).toBe(200)
      expect(identityLimiter).not.toHaveBeenCalled()
      expect(botLimiter).not.toHaveBeenCalled()
    },
  )

  it('serves an inline response without consulting the human identity limiter', async () => {
    const identityLimiter = vi.fn<VitestLooseMock>(() => ({ success: false }))
    const env: Env = {
      RATE_LIMITER_GET_HEAD: { limit: identityLimiter },
    }

    const response = await worker.fetch(
      new Request('https://voucha.ai/robots.txt', {
        headers: { 'cf-connecting-ip': '1.1.1.1', 'user-agent': 'Mozilla/5.0' },
      }),
      env,
      createContext(env),
    )

    expect(response.status).toBe(200)
    expect(identityLimiter).not.toHaveBeenCalled()
  })

  it.each([
    ['maintenance', { MAINTENANCE_MODE: 'true' }, {}, 503],
    ['staging Basic Auth', { BASIC_AUTH_CREDENTIALS: 'staging:password' }, {}, 401],
    [
      'geo block',
      { GEO_BLOCKED_COUNTRIES: 'CN' },
      { 'cf-ipcountry': 'CN', 'cf-ray': 'test-ray' },
      403,
    ],
  ])('%s wins before the inline response', async (_label, env, headers, expectedStatus) => {
    const response = await worker.fetch(
      new Request('https://voucha.ai/robots.txt', { headers }),
      env as Env,
      createContext(env as Env),
    )

    expect(response.status).toBe(expectedStatus)
  })

  it('applies outer response security without minting a session for an inline response', async () => {
    const env: Env = { NOINDEX: 'true' }

    const response = await worker.fetch(
      new Request('https://voucha.ai/robots.txt'),
      env,
      createContext(env),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/)
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('x-frame-options')).toBe('SAMEORIGIN')
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow, noarchive')
    expect(response.headers.get('set-cookie')).toBeNull()
  })
})
