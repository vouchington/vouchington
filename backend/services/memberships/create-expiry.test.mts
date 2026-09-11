import { describe, expect, it } from 'vitest'
import {
  createTestSku,
  createTestUser,
  getTestMembershipRaw,
  updateTestMembershipExpiresAt,
} from '@voucha/test-helpers'
import { createMembership, grantMembership } from './create.mts'
import { getMembershipHistory } from './get.mts'

describe('elapsed membership replacement', () => {
  it('expires a past-due scheduled cancellation before an admin grant replaces it', async () => {
    const admin = await createTestUser({ administrator: true })
    const member = await createTestUser()
    const pastDueSku = await createTestSku({ plan: 'plus' })
    const elapsedMembership = await createMembership({
      userId: member.id,
      plan: 'plus',
      skuId: pastDueSku.id,
      durationDays: 30,
      status: 'past_due',
      cancelAtPeriodEnd: true,
    })
    await updateTestMembershipExpiresAt(elapsedMembership.id, new Date('2020-01-01T00:00:00.000Z'))
    const replacementSku = await createTestSku({ plan: 'pro' })

    const replacement = await grantMembership(admin.id, member.id, 'pro', replacementSku.id, 30)

    await expect(getTestMembershipRaw(elapsedMembership.id)).resolves.toMatchObject({
      cancelled_at: null,
      expired_at: expect.any(Date),
      past_due_at: null,
      paused_at: null,
      cancel_at_period_end: false,
    })
    await expect(getTestMembershipRaw(replacement.id)).resolves.toMatchObject({
      plan: 'pro',
      status: 'active',
    })
    await expect(getMembershipHistory(member.id)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          membership_id: elapsedMembership.id,
          change_type: 'expiration',
          from_plan: 'plus',
          to_plan: null,
          expired_at: expect.any(Date),
        }),
      ]),
    )
  })
})
