import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import {
  createTestMembership,
  createTestUser,
  getTestPrivateUserById,
  updateTestMembershipExpiresAt,
} from '@voucha/test-helpers'
import { getUserRateLimitContext, rateLimitContextCache } from '@services/user-rate-limits/context'
import { createDeviceAndSessionTokens } from './create.mts'
import { refreshSessionState } from './flows.mts'
import { verifyDeviceAndSessionTokens } from './verify.mts'

describe('membership expiry', () => {
  afterEach(() => vi.useRealTimers())

  it('removes paid session claims when a finite grant elapses without replacement', async () => {
    const user = await createTestUser()
    const expiresAt = new Date(Date.now() + 60_000)
    const membership = await createTestMembership({
      user_id: user.id,
      plan: 'plus',
    })
    await updateTestMembershipExpiresAt(membership.id, expiresAt)
    const context = await getUserRateLimitContext(user.id)
    const tokens = await createDeviceAndSessionTokens({
      did: crypto.randomUUID(),
      uid: user.id,
      membershipPlan: context.membershipPlan,
      membershipExpiresAt: context.membershipExpiresAt,
      trustTier: 4,
    })

    await updateTestMembershipExpiresAt(membership.id, new Date(Date.now() - 60_000))
    vi.useFakeTimers()
    vi.setSystemTime(new Date(expiresAt.getTime() + 1_000))

    await expect(
      verifyDeviceAndSessionTokens({
        deviceToken: tokens.deviceToken.token,
        sessionToken: tokens.sessionToken.token,
      }),
    ).resolves.toMatchObject({
      uid: user.id,
      mpl: null,
      tt: undefined,
    })

    const refreshed = await refreshSessionState({
      deviceToken: tokens.deviceToken.token,
      sessionToken: tokens.sessionToken.token,
      fetchUser: getTestPrivateUserById,
    })

    expect(refreshed.uid).toBe(user.id)
    expect(refreshed.session.mpl).toBeNull()
    expect(refreshed.session.mpe).toBeUndefined()
  })

  it('reloads legacy paid cache entries that predate finite expiry metadata', async () => {
    const user = await createTestUser()
    onTestFinished(async () => {
      await rateLimitContextCache.delete(user.id)
    })
    await rateLimitContextCache.set(user.id, JSON.stringify({ membershipPlan: 'plus' }))

    await expect(getUserRateLimitContext(user.id)).resolves.toEqual({
      membershipPlan: null,
      membershipExpiresAt: null,
    })
  })
})
