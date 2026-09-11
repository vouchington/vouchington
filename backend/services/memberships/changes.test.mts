import { describe, expect, it, beforeAll } from 'vitest'
import type { PrivateUser } from '@voucha/types/entities/user'
import {
  createTestUser,
  createTestMembership,
  createTestSku,
  getTestMembershipRaw,
} from '@voucha/test-helpers'
import { recordMembershipChange } from './changes.mts'
import { getMembershipHistory } from './get.mts'

describe('changes', () => {
  let user: PrivateUser
  let membershipId: string

  beforeAll(async () => {
    user = await createTestUser()
    const membership = await createTestMembership({ user_id: user.id })
    membershipId = membership.id
  })
  describe('recordMembershipChange', () => {
    it('records a change and verifies via getMembershipHistory', async () => {
      const toSku = await createTestSku({ plan: 'plus' })
      await recordMembershipChange({
        membershipId,
        userId: user.id,
        changeType: 'admin_grant',
        toSkuId: toSku.id,
      })

      const history = await getMembershipHistory(user.id)
      expect(history.length).toBeGreaterThanOrEqual(1)
      const change = history[0]!
      expect(change.membership_id).toBe(membershipId)
      expect(change.user_id).toBe(user.id)
      expect(change.change_type).toBe('admin_grant')
      expect(change.to_plan).toBe('plus')
      expect(change.cancel_at_period_end).toBe(false)
      expect(change.cancelled_at).toBeNull()
      expect(change.expired_at).toBeNull()
      expect(change.past_due_at).toBeNull()
      expect(change.paused_at).toBeNull()
      expect(change.created_at).toBeInstanceOf(Date)

      const membership = await getTestMembershipRaw(membershipId)
      expect(membership?.latest_change_id).toBe(change.id)
    })

    it('records change with all optional fields', async () => {
      const admin = await createTestUser({ administrator: true })
      const fromSku = await createTestSku({ plan: 'plus' })
      const toSku = await createTestSku({ plan: 'pro' })
      const stripeEventId = `evt_test_${Date.now()}`

      await recordMembershipChange({
        membershipId,
        userId: user.id,
        changeType: 'upgrade',
        fromSkuId: fromSku.id,
        toSkuId: toSku.id,
        changedById: admin.id,
        note: 'Upgraded via admin panel',
        stripeEventId,
      })

      const history = await getMembershipHistory(user.id)
      const change = history[0]!
      expect(change.change_type).toBe('upgrade')
      expect(change.from_plan).toBe('plus')
      expect(change.to_plan).toBe('pro')
      expect(change.from_sku_id).toBe(fromSku.id)
      expect(change.to_sku_id).toBe(toSku.id)
      expect(change.changed_by_id).toBe(admin.id)
      expect(change.note).toBe('Upgraded via admin panel')
      expect(change.stripe_event_id).toBe(stripeEventId)
    })

    it('duplicate stripe_event_id throws', async () => {
      const duplicateEventId = `evt_dup_${Date.now()}`

      await recordMembershipChange({
        membershipId,
        userId: user.id,
        changeType: 'renewal',
        stripeEventId: duplicateEventId,
      })

      await expect(
        recordMembershipChange({
          membershipId,
          userId: user.id,
          changeType: 'renewal',
          stripeEventId: duplicateEventId,
        }),
      ).rejects.toThrow(Error)
    })

    it('rejects mutually exclusive lifecycle snapshots', async () => {
      await expect(
        recordMembershipChange({
          membershipId,
          userId: user.id,
          changeType: 'expiration',
          cancelledAt: new Date(),
          expiredAt: new Date(),
        }),
      ).rejects.toMatchObject({ code: '23514' })
    })
  })
})
