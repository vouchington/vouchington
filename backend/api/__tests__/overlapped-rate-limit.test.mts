import { randomUUID } from 'node:crypto'
import { describe, it, expect, vi } from 'vitest'
import type { Context } from '@jongleberry/api-server'
import type { PrivateUser } from '@services/users/types'

import {
  getOptionalAuthAndRateLimit,
  getOptionalProtocolAuthAndRateLimit,
  requireAuth,
  requireAuthForSuspendedException,
} from '../response-helpers.mts'

const routeId = 'GET:/api/v1/posts'
const authenticatedHelpers: [string, (ctx: Context) => Promise<unknown>][] = [
  ['requireAuth', ctx => requireAuth(ctx, routeId)],
  [
    'requireAuthForSuspendedException',
    ctx => requireAuthForSuspendedException(ctx, 'POST:/api/v1/appeals'),
  ],
]

describe('route limiter overlapped with the user fetch', () => {
  it.each(authenticatedHelpers)(
    '%s charges the limiter once, then 401, for anonymous',
    async (_name, run) => {
      const ctx = makeContext({ currentUser: null, signatureError: new Error('signature failed') })

      await expect(run(ctx)).rejects.toMatchObject({ status: 401 })

      expect(ctx.prepareRouteRateLimit).toHaveBeenCalledTimes(1)
      expect(ctx.settleRouteRateLimit).toHaveBeenCalledTimes(1)
      expect(ctx.applyRouteRateLimit).not.toHaveBeenCalled()
      expect(ctx.verifyAttestedRequestSignature).not.toHaveBeenCalled()
    },
  )

  it.each(authenticatedHelpers)(
    '%s answers 429 instead of 401 for a limited anonymous caller',
    async (_name, run) => {
      const limiterError = Object.assign(new Error('limited'), { status: 429 })
      const ctx = makeContext({ currentUser: null, routeLimitError: limiterError })

      await expect(run(ctx)).rejects.toBe(limiterError)
      expect(ctx.prepareRouteRateLimit).toHaveBeenCalledTimes(1)
    },
  )

  it.each(authenticatedHelpers)(
    '%s answers 429 for a limited authenticated caller',
    async (_name, run) => {
      const limiterError = Object.assign(new Error('limited'), { status: 429 })
      const ctx = makeContext({
        currentUser: makeUser(),
        routeLimitError: limiterError,
        signatureError: new Error('signature failed'),
      })

      await expect(run(ctx)).rejects.toBe(limiterError)
      expect(ctx.prepareRouteRateLimit).toHaveBeenCalledTimes(1)
      expect(ctx.settleRouteRateLimit).toHaveBeenCalledTimes(1)
    },
  )

  it('starts the limiter before the user fetch and settles it afterwards', async () => {
    const ctx = makeContext({ currentUser: makeUser() })

    await requireAuth(ctx, routeId)

    expect(ctx.events).toEqual([
      `rate-limit-charge:${routeId}`,
      'currentUser',
      'signature',
      `rate-limit:${routeId}`,
    ])
  })

  it('does not leave an unhandled rejection when the user fetch fails', async () => {
    const userError = new Error('database down')
    const ctx = makeContext({ currentUser: makeUser() })
    vi.mocked(ctx.getCurrentUser).mockRejectedValueOnce(userError)
    vi.mocked(ctx.prepareRouteRateLimit).mockRejectedValueOnce(new Error('valkey down'))

    await expect(requireAuth(ctx, routeId)).rejects.toBe(userError)
    expect(ctx.settleRouteRateLimit).not.toHaveBeenCalled()
  })

  it('surfaces a limiter failure after the user resolves', async () => {
    const limiterError = new Error('valkey down')
    const ctx = makeContext({ currentUser: makeUser() })
    vi.mocked(ctx.prepareRouteRateLimit).mockRejectedValueOnce(limiterError)

    await expect(requireAuth(ctx, routeId)).rejects.toBe(limiterError)
    expect(ctx.settleRouteRateLimit).not.toHaveBeenCalled()
  })

  it.each([
    ['getOptionalAuthAndRateLimit', (ctx: Context) => getOptionalAuthAndRateLimit(ctx, routeId)],
    [
      'getOptionalProtocolAuthAndRateLimit',
      (ctx: Context) =>
        getOptionalProtocolAuthAndRateLimit(ctx, 'POST:/api/v1/auth/oauth/:provider/continue'),
    ],
  ])('%s charges once and returns a null user', async (_name, run) => {
    const ctx = makeContext({ currentUser: null })

    await expect(run(ctx)).resolves.toBeNull()
    expect(ctx.prepareRouteRateLimit).toHaveBeenCalledTimes(1)
    expect(ctx.settleRouteRateLimit).toHaveBeenCalledTimes(1)
  })
})

function makeContext(options: {
  currentUser: PrivateUser | null
  signatureError?: Error
  routeLimitError?: Error
}) {
  const events: string[] = []
  return {
    events,
    getCurrentUser: vi.fn<() => Promise<PrivateUser | null>>().mockImplementation(async () => {
      events.push('currentUser')
      return options.currentUser
    }),
    verifyAttestedRequestSignature: vi.fn<() => Promise<void>>().mockImplementation(async () => {
      events.push('signature')
      if (options.signatureError) throw options.signatureError
    }),
    applyRouteRateLimit: vi.fn<(routeId: string) => Promise<void>>(),
    prepareRouteRateLimit: vi
      .fn<(routeId: string) => Promise<null>>()
      .mockImplementation(async id => {
        events.push(`rate-limit-charge:${id}`)
        return null
      }),
    settleRouteRateLimit: vi
      .fn<(routeId: string) => Promise<void>>()
      .mockImplementation(async id => {
        events.push(`rate-limit:${id}`)
        if (options.routeLimitError) throw options.routeLimitError
      }),
    assert(value: unknown, status: number, message: string): asserts value {
      if (value) return
      throw Object.assign(new Error(message), { status })
    },
  } as unknown as Context & { events: string[] }
}

function makeUser(): PrivateUser {
  return { id: randomUUID() } as PrivateUser
}
