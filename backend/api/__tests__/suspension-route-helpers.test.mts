import { beforeAll, describe, expect, it, vi } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import type { Context } from '@jongleberry/api-server'
import type { PrivateUser } from '@services/users/types'
import { ACCOUNT_SUSPENDED } from '@modules/on-error/error-codes'
import {
  getOptionalAuthAndRateLimit,
  getOptionalProtocolAuthAndRateLimit,
  requireAuth,
  requireAuthAndRateLimit,
  requireAuthForSuspendedException,
} from '../response-helpers.mts'

describe('suspension policy in route helpers', () => {
  let user: PrivateUser
  beforeAll(async () => {
    user = await createTestUser({ extraRoles: ['administrator'] })
  })
  it.each([
    {
      name: 'requireAuth',
      routeId: 'POST:/api/v1/posts',
      preambleEvents: ['currentUser', 'signature'],
      run: (ctx: Context) => requireAuth(ctx, 'POST:/api/v1/posts'),
    },
    {
      name: 'requireAuthAndRateLimit',
      routeId: 'DELETE:/api/v1/posts/:id',
      preambleEvents: ['currentUser', 'signature'],
      run: (ctx: Context) => requireAuthAndRateLimit(ctx, () => true, 'DELETE:/api/v1/posts/:id'),
    },
    {
      name: 'getOptionalAuthAndRateLimit',
      routeId: 'PATCH:/api/v1/my/profile',
      preambleEvents: ['signature', 'currentUser'],
      run: (ctx: Context) => getOptionalAuthAndRateLimit(ctx, 'PATCH:/api/v1/my/profile'),
    },
  ])(
    'rejects unsafe $name routes from a suspended authenticated user',
    async ({ routeId, preambleEvents, run }) => {
      const ctx = makeContext({ ...user, suspended_at: new Date() })

      await expect(run(ctx)).rejects.toMatchObject({ status: 403, code: ACCOUNT_SUSPENDED })
      expect(ctx.events).toEqual([...preambleEvents, `rate-limit:${routeId}`])
    },
  )

  it('allows safe GETs for suspended users and unauthenticated optional reads', async () => {
    const suspended = { ...user, suspended_at: new Date() }
    await expect(requireAuth(makeContext(suspended), 'GET:/api/v1/my/cards')).resolves.toBe(
      suspended,
    )
    await expect(
      getOptionalAuthAndRateLimit(makeContext(null), 'GET:/api/v1/posts'),
    ).resolves.toBeNull()
  })

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])(
    'blocks %s through every standard helper',
    async method => {
      const suspended = { ...user, suspended_at: new Date() }
      const routeId = `${method}:/api/v1/my/cards`
      for (const run of [
        (ctx: Context) => requireAuth(ctx, routeId),
        (ctx: Context) => requireAuthAndRateLimit(ctx, () => true, routeId),
        (ctx: Context) => getOptionalAuthAndRateLimit(ctx, routeId),
      ]) {
        await expect(run(makeContext(suspended))).rejects.toMatchObject({ code: ACCOUNT_SUSPENDED })
      }
      await expect(getOptionalAuthAndRateLimit(makeContext(null), routeId)).resolves.toBeNull()
      await expect(requireAuth(makeContext(user), routeId)).resolves.toBe(user)
    },
  )

  it('leaves only registered independent protocols outside the account-write policy', async () => {
    const suspended = { ...user, suspended_at: new Date() }
    await expect(
      getOptionalProtocolAuthAndRateLimit(
        makeContext(suspended),
        'POST:/api/v1/auth/oauth/:provider/continue',
      ),
    ).resolves.toBe(suspended)
    await expect(
      getOptionalProtocolAuthAndRateLimit(
        makeContext(suspended),
        // @ts-expect-error A user mutation is not an independent protocol.
        'POST:/api/v1/my/cards',
      ),
    ).rejects.toThrow('Unapproved protocol route')
  })

  it('keeps signature failure precedence over the suspension error', async () => {
    const signatureError = new Error('invalid attested request signature')
    const ctx = makeContext({ ...user, suspended_at: new Date() }, signatureError)

    await expect(requireAuth(ctx, 'POST:/api/v1/posts')).rejects.toBe(signatureError)
    expect(ctx.events).toEqual(['currentUser', 'signature', 'rate-limit:POST:/api/v1/posts'])
  })

  it('permits only a registered route through the exception helper', async () => {
    const suspended = { ...user, suspended_at: new Date() }
    await expect(
      requireAuthForSuspendedException(makeContext(suspended), 'POST:/api/v1/appeals'),
    ).resolves.toBe(suspended)
    await expect(
      requireAuthForSuspendedException(
        makeContext(suspended),
        // @ts-expect-error Unregistered exception routes fail the compile-time contract too.
        'POST:/api/v1/posts',
      ),
    ).rejects.toThrow('Unapproved suspension exception')
  })
})

function makeContext(
  currentUser: PrivateUser | null,
  signatureError?: Error,
): Context & { events: string[] } {
  const events: string[] = []
  return {
    events,
    getCurrentUser: vi.fn<() => Promise<PrivateUser | null>>().mockImplementation(async () => {
      events.push('currentUser')
      return currentUser
    }),
    verifyAttestedRequestSignature: vi.fn<() => Promise<void>>().mockImplementation(async () => {
      events.push('signature')
      if (signatureError) throw signatureError
    }),
    applyRouteRateLimit: vi
      .fn<(routeId: string) => Promise<void>>()
      .mockImplementation(async routeId => {
        events.push(`rate-limit:${routeId}`)
      }),
    assert(condition: unknown, status: number, message: string): asserts condition {
      if (condition) return
      throw Object.assign(new Error(message), { status })
    },
  } as unknown as Context & { events: string[] }
}
