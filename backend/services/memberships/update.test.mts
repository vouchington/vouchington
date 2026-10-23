import { beforeAll, describe, expect, it } from 'vitest'
import type { PrivateUser } from '@voucha/types/entities/user'
import {
  createTestUser,
  createTestMembership,
  createTestSku,
  getTestMembershipRaw,
  updateTestMembershipCancelAtPeriodEnd,
} from '@voucha/test-helpers'
import { updateMembershipFromEvent } from './update.mts'

async function updateProjectionWithoutRecording(
  options: Parameters<typeof updateMembershipFromEvent>[0],
) {
  return updateMembershipFromEvent(options, async () => {})
}

describe('update', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })
  describe('updateMembershipFromEvent', () => {
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
      // Verify via the full stored row returned by getTestMembershipRaw.
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

      expect(result?.previous.should_cancel_at_period_end).toBe(true)
      expect(result?.current.should_cancel_at_period_end).toBe(false)
      expect(result?.current.status).toBe('cancelled')

      const raw = await getTestMembershipRaw(membership.id)
      expect(raw!.status).toBe('cancelled')
      expect(raw!.should_cancel_at_period_end).toBe(false)
    })

    it('ignores explicit scheduled cancellation when the event status is terminal', async () => {
      const terminalUser = await createTestUser()
      const membership = await createTestMembership({ user_id: terminalUser.id })

      const result = await updateProjectionWithoutRecording({
        membershipId: membership.id,
        status: 'cancelled',
        cancelAtPeriodEnd: true,
      })

      expect(result?.previous.status).toBe('active')
      expect(result?.current.status).toBe('cancelled')
      expect(result?.current.should_cancel_at_period_end).toBe(false)

      const raw = await getTestMembershipRaw(membership.id)
      expect(raw!.status).toBe('cancelled')
      expect(raw!.should_cancel_at_period_end).toBe(false)
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
})
