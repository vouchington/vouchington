import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createTestMembership,
  createTestSku,
  createTestUser,
  getTestMembershipEntitlementEffects,
  getTestMembershipRaw,
} from '@voucha/test-helpers'
import { recordMembershipChange } from '../changes.mts'
import { createMembership } from '../create.mts'
import { getMembershipHistory } from '../get.mts'
import { updateMembershipFromWebhook } from '../update.mts'

describe('membership projection entitlement-effect transaction', () => {
  it('rolls back the projection and its entitlement handoff when change recording fails', async () => {
    const atomicUser = await createTestUser()
    const membership = await createTestMembership({ user_id: atomicUser.id })
    const before = await getTestMembershipRaw(membership.id)

    await expect(
      updateMembershipFromWebhook(
        { membershipId: membership.id, status: 'past_due' },
        async (updated, query) => {
          await recordMembershipChange({
            membershipId: membership.id,
            userId: updated.current.user_id,
            changeType: 'renewal',
            pastDueAt: updated.current.past_due_at,
            query,
          })
          throw new Error('abort membership change transaction')
        },
      ),
    ).rejects.toThrow('abort membership change transaction')

    await expect(getTestMembershipRaw(membership.id)).resolves.toMatchObject({
      status: 'active',
      latest_change_id: before!.latest_change_id,
    })
  })

  it('records a durable effect when provider reconciliation changes only expiry', async () => {
    const user = await createTestUser()
    const sku = await createTestSku({ plan: 'plus' })
    const subscriptionId = `sub_expiry_effect_${randomUUID()}`
    const first = await createMembership({
      userId: user.id,
      plan: 'plus',
      skuId: sku.id,
      expiresAt: new Date('2030-02-01T00:00:00.000Z'),
      stripeSubscriptionId: subscriptionId,
      stripeEventId: `evt_initial_${randomUUID()}`,
    })
    const before = await getTestMembershipRaw(first.id)

    const shortenedEventId = `evt_shortened_${randomUUID()}`
    const reconciled = await createMembership({
      userId: user.id,
      plan: 'plus',
      skuId: sku.id,
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
      stripeSubscriptionId: subscriptionId,
      stripeEventId: shortenedEventId,
    })

    const after = await getTestMembershipRaw(reconciled.id)
    expect(reconciled.projected).toBe(true)
    expect(after?.expires_at).toEqual(new Date('2030-01-01T00:00:00.000Z'))
    expect(after?.latest_change_id).not.toBe(before?.latest_change_id)
    if (!after?.latest_change_id) throw new Error('Expected expiry reconciliation change')
    await expect(getTestMembershipEntitlementEffects(after.latest_change_id)).resolves.toEqual([
      expect.objectContaining({ user_id: user.id, delivered_at: null }),
    ])
    await expect(getMembershipHistory(user.id)).resolves.toEqual([
      expect.objectContaining({ change_type: 'renewal', stripe_event_id: shortenedEventId }),
      expect.objectContaining({ change_type: 'renewal' }),
    ])
  })
})
