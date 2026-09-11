import { randomUUID } from 'node:crypto'
import { describe, it, expect, vi } from 'vitest'
import type { Context } from '@jongleberry/api-server'
import type { PrivateUser } from '@services/users/types'

import {
  getOptionalAuthAndRateLimit,
  requireAuth,
  requireAuthAndRateLimit,
  setAnonymousPublicCacheHeaders,
} from '../response-helpers.mts'

describe('route helpers', () => {
  it('sets anonymous public cache headers for optional-auth routes', () => {
    const ctx = makeContext({
      currentUser: null,
    })

    ctx.res.setHeader('Vary', 'Accept-Encoding')
    setAnonymousPublicCacheHeaders(ctx, null, 60)

    expect(ctx.set).toHaveBeenCalledWith('Cache-Control', 'public, max-age=60')
    expect(ctx.set).toHaveBeenCalledWith('Vary', 'Accept-Encoding, Cookie, Authorization')
    expect(ctx.res.getHeader('Vary')).toBe('Accept-Encoding, Cookie, Authorization')
  })

  it('does not set anonymous cache headers for authenticated users', () => {
    const currentUser = makeUser()
    const ctx = makeContext({
      currentUser,
    })

    setAnonymousPublicCacheHeaders(ctx, currentUser, 60)

    expect(ctx.set).not.toHaveBeenCalled()
  })

  it('requireAuth rate-limits before rethrowing a signature failure', async () => {
    const signatureError = new Error('signature failed')
    const ctx = makeContext({
      currentUser: makeUser(),
      signatureError,
    })

    await expect(requireAuth(ctx, 'GET:/api/v1/posts')).rejects.toBe(signatureError)
    expect(ctx.getCurrentUser).toHaveBeenCalledTimes(1)
    expect(ctx.verifyAttestedRequestSignature).toHaveBeenCalledTimes(1)
    expect(ctx.applyRouteRateLimit).toHaveBeenCalledTimes(1)
    expect(ctx.applyRouteRateLimit).toHaveBeenCalledWith('GET:/api/v1/posts')
    expect(ctx.events).toEqual(['currentUser', 'signature', 'rate-limit:GET:/api/v1/posts'])
  })

  it('getOptionalAuthAndRateLimit rate-limits before rethrowing a signature failure', async () => {
    const signatureError = new Error('signature failed')
    const ctx = makeContext({
      currentUser: null,
      signatureError,
    })

    await expect(getOptionalAuthAndRateLimit(ctx, 'GET:/api/v1/posts')).rejects.toBe(signatureError)
    expect(ctx.getCurrentUser).toHaveBeenCalledTimes(1)
    expect(ctx.verifyAttestedRequestSignature).toHaveBeenCalledTimes(1)
    expect(ctx.applyRouteRateLimit).toHaveBeenCalledTimes(1)
    expect(ctx.applyRouteRateLimit).toHaveBeenCalledWith('GET:/api/v1/posts')
    expect(ctx.events).toEqual(['signature', 'currentUser', 'rate-limit:GET:/api/v1/posts'])
  })

  it('requireAuthAndRateLimit rate-limits before rethrowing a signature failure', async () => {
    const signatureError = new Error('signature failed')
    const ctx = makeContext({
      currentUser: makeUser(),
      signatureError,
    })

    await expect(requireAuthAndRateLimit(ctx, () => true, 'POST:/api/v1/posts')).rejects.toBe(
      signatureError,
    )
    expect(ctx.getCurrentUser).toHaveBeenCalledTimes(1)
    expect(ctx.verifyAttestedRequestSignature).toHaveBeenCalledTimes(1)
    expect(ctx.applyRouteRateLimit).toHaveBeenCalledTimes(1)
    expect(ctx.applyRouteRateLimit).toHaveBeenCalledWith('POST:/api/v1/posts')
    expect(ctx.events).toEqual(['currentUser', 'signature', 'rate-limit:POST:/api/v1/posts'])
  })

  it('uses the rate limiter error when signature verification and rate limiting both fail', async () => {
    const signatureError = new Error('signature failed')
    const limiterError = Object.assign(new Error('rate limit exceeded'), {
      status: 429,
    })
    const ctx = makeContext({
      currentUser: makeUser(),
      signatureError,
      routeLimitError: limiterError,
    })

    await expect(requireAuthAndRateLimit(ctx, () => true, 'POST:/api/v1/posts')).rejects.toBe(
      limiterError,
    )
    expect(ctx.getCurrentUser).toHaveBeenCalledTimes(1)
    expect(ctx.verifyAttestedRequestSignature).toHaveBeenCalledTimes(1)
    expect(ctx.applyRouteRateLimit).toHaveBeenCalledTimes(1)
    expect(ctx.events).toEqual(['currentUser', 'signature', 'rate-limit:POST:/api/v1/posts'])
  })

  it.each([
    {
      helperName: 'requireAuth',
      routeId: 'GET:/api/v1/posts',
      run: (ctx: Context) => requireAuth(ctx, 'GET:/api/v1/posts'),
    },
    {
      helperName: 'requireAuthAndRateLimit',
      routeId: 'POST:/api/v1/posts',
      run: (ctx: Context) => requireAuthAndRateLimit(ctx, () => false, 'POST:/api/v1/posts'),
    },
  ])('rate-limits unauthenticated $helperName requests before 401', async ({ routeId, run }) => {
    const signatureError = new Error('signature failed')
    const unauthorizedCtx = makeContext({ currentUser: null, signatureError })

    await expect(run(unauthorizedCtx)).rejects.toMatchObject({ status: 401 })

    expect(unauthorizedCtx.applyRouteRateLimit).toHaveBeenCalledTimes(1)
    expect(unauthorizedCtx.applyRouteRateLimit).toHaveBeenCalledWith(routeId)
    expect(unauthorizedCtx.verifyAttestedRequestSignature).not.toHaveBeenCalled()
    expect(unauthorizedCtx.events).toEqual(['currentUser', `rate-limit:${routeId}`])
  })

  it('does not rate-limit or verify signatures for forbidden requests', async () => {
    const forbiddenCtx = makeContext({
      currentUser: makeUser(),
      signatureError: new Error('signature failed'),
    })

    await expect(
      requireAuthAndRateLimit(forbiddenCtx, () => false, 'POST:/api/v1/posts'),
    ).rejects.toMatchObject({
      status: 403,
      message: 'Forbidden',
    })

    expect(forbiddenCtx.applyRouteRateLimit).not.toHaveBeenCalled()
    expect(forbiddenCtx.verifyAttestedRequestSignature).not.toHaveBeenCalled()
  })
})

type MockContext = Context & {
  events: string[]
}

function makeContext(options: {
  currentUser: PrivateUser | null
  signatureError?: Error
  routeLimitError?: Error
}): MockContext {
  const events: string[] = []

  const headers = new Map<string, string | number | readonly string[]>()
  const res: {
    getHeader: (header: string) => string | number | readonly string[] | undefined
    setHeader: (header: string, value: string | number | readonly string[]) => unknown
  } = {
    getHeader: vi.fn<(header: string) => string | number | readonly string[] | undefined>(header =>
      headers.get(header.toLowerCase()),
    ),
    setHeader: vi.fn<(header: string, value: string | number | readonly string[]) => unknown>(
      (header, value) => {
        headers.set(header.toLowerCase(), value)
        return res
      },
    ),
  }

  return {
    events,
    set: vi.fn<(header: string, value: string) => void>().mockImplementation((header, value) => {
      events.push(`set:${header}=${value}`)
      res.setHeader(header, value)
    }),
    res,
    getCurrentUser: vi.fn<() => Promise<PrivateUser | null>>().mockImplementation(async () => {
      events.push('currentUser')
      return options.currentUser
    }),
    verifyAttestedRequestSignature: vi.fn<() => Promise<void>>().mockImplementation(async () => {
      events.push('signature')
      if (options.signatureError) throw options.signatureError
    }),
    applyRouteRateLimit: vi
      .fn<(routeId: string) => Promise<void>>()
      .mockImplementation(async routeId => {
        events.push(`rate-limit:${routeId}`)
        if (options.routeLimitError) throw options.routeLimitError
      }),
    assert(value: unknown, status: number, message: string): asserts value {
      if (value) return
      const error = new Error(message) as Error & { status: number }
      error.status = status
      throw error
    },
  } as unknown as MockContext
}

function makeUser(): PrivateUser {
  return {
    id: randomUUID(),
  } as PrivateUser
}
