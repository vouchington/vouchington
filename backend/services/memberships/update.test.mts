import { beforeAll, describe, expect, it } from 'vitest'
import type { PrivateUser } from '@voucha/types/entities/user'
import {
  createTestUser,
  createTestMembership,
  createTestSku,
  getTestMembershipRaw,
  updateTestMembershipCancelAtPeriodEnd,
} from '@voucha/test-helpers'
import { createMembership } from './create.mts'
import { cancelMembership, updateMembershipFromWebhook } from './update.mts'
import { getMembershipHistory } from './get.mts'

async function updateProjectionWithoutRecording(
  options: Parameters<typeof updateMembershipFromWebhook>[0],
) {
  return await updateMembershipFromWebhook(options, async () => {})
}

describe('update', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })
  describe('updateMembershipFromWebhook', () => {
    it('updates status field', async () => {
      const membership = await createTestMembership({ user_id: user.id })
      const before = (await getTestMembershipRaw(membership.id)) as Record<string, unknown>

      const result = await updateProjectionWithoutRecording({
        membershipId: membership.id,
        status: 'past_due',
      })

      expect(result?.previous.status).toBe('active')
      expect(result?.previous.plan).toBe('plus')
      expect(result?.previous.sku_id).toBe(membership.sku_id)
      expect(result?.current.status).toBe('past_due')
      expect(result?.current.plan).toBe('plus')
      expect(result?.current.sku_id).toBe(membership.sku_id)
      expect(result?.current.past_due_at).toBeInstanceOf(Date)

      const raw = await getTestMembershipRaw(membership.id)
      expect(raw!.status).toBe('past_due')
      expect(raw!.past_due_at).toBeInstanceOf(Date)
      expect((raw as Record<string, unknown>).effective_at).toEqual(before.effective_at)
    })

    it('updates multiple fields (status, plan, expiresAt)', async () => {
      const multiUser = await createTestUser()
      const membership = await createTestMembership({
        user_id: multiUser.id,
        plan: 'plus',
      })
      const newSku = await createTestSku({ plan: 'pro' })
      const futureDate = new Date('2030-01-01T00:00:00Z')

      const result = await updateProjectionWithoutRecording({
        membershipId: membership.id,
        status: 'active',
        plan: 'pro',
        skuId: newSku.id,
        expiresAt: futureDate,
      })

      expect(result?.previous.plan).toBe('plus')
      expect(result?.previous.sku_id).toBe(membership.sku_id)
      expect(result?.current.plan).toBe('pro')
      expect(result?.current.sku_id).toBe(newSku.id)
      expect(result?.current.status).toBe('active')

      const raw = await getTestMembershipRaw(membership.id)
      expect(raw!.status).toBe('active')
      // Verify via full row since getTestMembershipRaw returns SELECT *
      const fullRow = raw as Record<string, unknown>
      expect(fullRow.plan).toBe('pro')
      expect(fullRow.sku_id).toBe(newSku.id)
      expect(fullRow.expires_at).not.toBeNull()
      expect(fullRow.past_due_at).toBeNull()
    })

    it('preserves the original lifecycle entry timestamp for repeated statuses', async () => {
      const lifecycleUser = await createTestUser()
      const membership = await createTestMembership({
        user_id: lifecycleUser.id,
        status: 'past_due',
      })
      const originalRaw = await getTestMembershipRaw(membership.id)

      const result = await updateProjectionWithoutRecording({
        membershipId: membership.id,
        status: 'past_due',
      })

      expect(result?.previous.past_due_at?.toISOString()).toBe(
        originalRaw!.past_due_at?.toISOString(),
      )
      expect(result?.current.past_due_at?.toISOString()).toBe(
        originalRaw!.past_due_at?.toISOString(),
      )

      const raw = await getTestMembershipRaw(membership.id)
      expect(raw!.past_due_at?.toISOString()).toBe(originalRaw!.past_due_at?.toISOString())
    })

    it('clears scheduled cancellation when a membership reaches a terminal status', async () => {
      const terminalUser = await createTestUser()
      const membership = await createTestMembership({ user_id: terminalUser.id })
      await updateTestMembershipCancelAtPeriodEnd(membership.id, true)

      const result = await updateProjectionWithoutRecording({
        membershipId: membership.id,
        status: 'cancelled',
      })

      expect(result?.previous.cancel_at_period_end).toBe(true)
      expect(result?.current.cancel_at_period_end).toBe(false)
      expect(result?.current.status).toBe('cancelled')

      const raw = await getTestMembershipRaw(membership.id)
      expect(raw!.status).toBe('cancelled')
      expect(raw!.cancel_at_period_end).toBe(false)
    })

    it('ignores explicit scheduled cancellation when the webhook status is terminal', async () => {
      const terminalUser = await createTestUser()
      const membership = await createTestMembership({ user_id: terminalUser.id })

      const result = await updateProjectionWithoutRecording({
        membershipId: membership.id,
        status: 'cancelled',
        cancelAtPeriodEnd: true,
      })

      expect(result?.previous.status).toBe('active')
      expect(result?.current.status).toBe('cancelled')
      expect(result?.current.cancel_at_period_end).toBe(false)

      const raw = await getTestMembershipRaw(membership.id)
      expect(raw!.status).toBe('cancelled')
      expect(raw!.cancel_at_period_end).toBe(false)
    })

    it('returns null for a missing membership', async () => {
      await expect(
        updateProjectionWithoutRecording({
          membershipId: '00000000-0000-7000-8000-000000000000',
          status: 'past_due',
        }),
      ).resolves.toBeNull()
    })

    it('does not resurrect an elapsed membership when a replacement is current', async () => {
      const replacementUser = await createTestUser()
      const elapsed = await createTestMembership({
        user_id: replacementUser.id,
        status: 'expired',
      })

      await expect(
        updateProjectionWithoutRecording({ membershipId: elapsed.id, status: 'active' }),
      ).resolves.toBeNull()
      await expect(getTestMembershipRaw(elapsed.id)).resolves.toMatchObject({ status: 'expired' })
    })
  })

  describe('cancelMembership', () => {
    it('sets cancel_at_period_end and records change', async () => {
      const cancelUser = await createTestUser()
      const sku = await createTestSku()
      const membership = await createMembership({
        userId: cancelUser.id,
        plan: 'plus',
        skuId: sku.id,
        stripeSubscriptionId: `sub_scheduled_cancel_${cancelUser.id}`,
      })

      await expect(getTestMembershipRaw(membership.id)).resolves.toMatchObject({
        source_auto_renews: true,
      })

      await cancelMembership(cancelUser.id, membership.id)

      const raw = await getTestMembershipRaw(membership.id)
      expect(raw!.cancelled_at).toBeNull()
      expect(raw!.cancel_at_period_end).toBe(true)
      expect(raw!.source_auto_renews).toBe(false)
      expect(raw!.status).toBe('active')

      const history = await getMembershipHistory(cancelUser.id)
      expect(history.length).toBeGreaterThanOrEqual(1)
      expect(history[0].change_type).toBe('cancellation')
    })

    it('does not throw for nonexistent membership', async () => {
      await expect(
        cancelMembership(user.id, '00000000-0000-0000-0000-000000000000'),
      ).resolves.toBeUndefined()
    })

    it('idempotent: cancelling already-cancelled membership does not throw or create duplicate audit rows', async () => {
      const idempotentUser = await createTestUser()
      const membership = await createTestMembership({ user_id: idempotentUser.id })

      // Cancel first time
      await cancelMembership(idempotentUser.id, membership.id)

      const historyAfterFirst = await getMembershipHistory(idempotentUser.id)
      const cancellationCountBefore = historyAfterFirst.filter(
        h => h.change_type === 'cancellation',
      ).length

      // Cancel second time — should not throw
      await cancelMembership(idempotentUser.id, membership.id)

      const historyAfterSecond = await getMembershipHistory(idempotentUser.id)
      const cancellationCountAfter = historyAfterSecond.filter(
        h => h.change_type === 'cancellation',
      ).length

      // No duplicate audit row
      expect(cancellationCountAfter).toBe(cancellationCountBefore)
    })

    it('records correct change history fields', async () => {
      const historyUser = await createTestUser()
      const membership = await createTestMembership({
        user_id: historyUser.id,
        plan: 'pro',
      })

      await cancelMembership(historyUser.id, membership.id)

      const history = await getMembershipHistory(historyUser.id)
      expect(history.length).toBeGreaterThanOrEqual(1)
      const change = history[0]
      expect(change.change_type).toBe('cancellation')
      expect(change.from_plan).toBe('pro')
      expect(change.to_plan).toBe('pro')
      expect(change.cancel_at_period_end).toBe(true)
      expect(change.cancelled_at).toBeNull()
      expect(change.expired_at).toBeNull()
      expect(change.past_due_at).toBeNull()
      expect(change.paused_at).toBeNull()
      expect(change.changed_by_id).toBe(historyUser.id)
      expect(change.membership_id).toBe(membership.id)
    })

    it('records current lifecycle fields when scheduling cancellation', async () => {
      const pastDueUser = await createTestUser()
      const membership = await createTestMembership({
        user_id: pastDueUser.id,
        status: 'past_due',
      })

      await cancelMembership(pastDueUser.id, membership.id)

      const history = await getMembershipHistory(pastDueUser.id)
      expect(history[0].change_type).toBe('cancellation')
      expect(history[0].cancel_at_period_end).toBe(true)
      expect(history[0].past_due_at).toBeInstanceOf(Date)
    })
  })
})
