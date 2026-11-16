import { describe, expect, it } from 'vitest'
import {
  createTestMembership,
  createTestSku,
  createTestUser,
  getTestMembershipRaw,
  updateTestMembershipCancelAtPeriodEnd,
  updateTestMembershipExpiresAt,
} from '@voucha/test-helpers'
import { grantMembership } from './create.mts'
import { getMembershipHistory } from './get.mts'
import { isolateSerializableWriterTests } from '../../test-helpers/serializable-writer-isolation.mts'

describe('elapsed membership replacement', () => {
  isolateSerializableWriterTests()
  it('expires a past-due scheduled cancellation before an admin grant replaces it', async () => {
    const admin = await createTestUser({ administrator: true })
    const member = await createTestUser()
    const pastDueSku = await createTestSku({ plan: 'plus' })
    // Committed fixture: the elapsed term is only setup. The replacing grant below is the subject,
    // so it stays on the SERIALIZABLE writer.
    const elapsedMembership = await createTestMembership({
      user_id: member.id,
      sku_id: pastDueSku.id,
      status: 'past_due',
      granted_by_id: admin.id,
    })
    await updateTestMembershipCancelAtPeriodEnd(elapsedMembership.id, true)
    await updateTestMembershipExpiresAt(elapsedMembership.id, new Date('2020-01-01T00:00:00.000Z'))
    const replacementSku = await createTestSku({ plan: 'pro' })

    const replacement = await grantMembership(admin.id, member.id, 'pro', replacementSku.id, 30)

    await expect(getTestMembershipRaw(elapsedMembership.id)).resolves.toMatchObject({
      cancelled_at: null,
      expired_at: expect.any(Date),
      past_due_at: null,
      paused_at: null,
      should_cancel_at_period_end: false,
    })
    await expect(getTestMembershipRaw(replacement.id)).resolves.toMatchObject({
      plan: 'pro',
      status: 'active',
    })
    await expect(getMembershipHistory(member.id).then(page => page.results)).resolves.toEqual(
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
