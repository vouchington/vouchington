import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createTestSku, createTestUser, getTestMembershipRaw } from '@voucha/test-helpers'
import { createMembership } from './create.mts'

const providerStartedAt = new Date('2100-01-01T00:00:00.000Z')
const providerExpiresAt = new Date('2101-01-01T00:00:00.000Z')

describe('createMembership provider transition clocks', () => {
  it.each([
    ['cancelled', 'cancelled_at', 'source_cancelled_at'],
    ['expired', 'expired_at', 'source_expired_at'],
  ] as const)(
    'observes a new %s provider transition without a terminal clock',
    async (status, lifecycleColumn, sourceLifecycleColumn) => {
      const user = await createTestUser()
      const sku = await createTestSku({ plan: 'plus' })
      const subscriptionId = `sub_${status}_transition_${randomUUID()}`
      const observedBefore = new Date()
      const membership = await createMembership({
        userId: user.id,
        plan: 'plus',
        skuId: sku.id,
        status,
        effectiveAt: providerStartedAt,
        expiresAt: providerExpiresAt,
        stripeSubscriptionId: subscriptionId,
      })
      const observedAfter = new Date()

      const raw = (await getTestMembershipRaw(membership.id))!
      expectObservedDuring(raw.source_effective_at, observedBefore, observedAfter)
      expect(raw[lifecycleColumn]).toBeInstanceOf(Date)
      expect(raw[sourceLifecycleColumn]).toBeInstanceOf(Date)
      expectObservedDuring(raw[lifecycleColumn], observedBefore, observedAfter)
      expectObservedDuring(raw[sourceLifecycleColumn], observedBefore, observedAfter)

      const replay = await createMembership({
        userId: user.id,
        plan: 'plus',
        skuId: sku.id,
        status,
        effectiveAt: providerStartedAt,
        expiresAt: providerExpiresAt,
        stripeSubscriptionId: subscriptionId,
      })
      expect(replay.id).toBe(membership.id)
      await expect(getTestMembershipRaw(membership.id)).resolves.toMatchObject({
        source_effective_at: raw.source_effective_at,
        [lifecycleColumn]: raw[lifecycleColumn],
        [sourceLifecycleColumn]: raw[sourceLifecycleColumn],
      })
    },
  )

  it.each([
    ['past_due', 'past_due_at', 'source_past_due_at'],
    ['paused', 'paused_at', 'source_paused_at'],
  ] as const)(
    'observes a new %s provider transition rather than using its start time',
    async (status, lifecycleColumn, sourceLifecycleColumn) => {
      const user = await createTestUser()
      const sku = await createTestSku({ plan: 'plus' })
      const subscriptionId = `sub_${status}_transition_${randomUUID()}`
      const observedBefore = new Date()
      const membership = await createMembership({
        userId: user.id,
        plan: 'plus',
        skuId: sku.id,
        status,
        effectiveAt: providerStartedAt,
        expiresAt: providerExpiresAt,
        stripeSubscriptionId: subscriptionId,
      })
      const observedAfter = new Date()

      const raw = (await getTestMembershipRaw(membership.id))!
      expectObservedDuring(raw.source_effective_at, observedBefore, observedAfter)
      expect(raw[lifecycleColumn]).toBeInstanceOf(Date)
      expect(raw[sourceLifecycleColumn]).toBeInstanceOf(Date)
      expectObservedDuring(raw[lifecycleColumn], observedBefore, observedAfter)
      expectObservedDuring(raw[sourceLifecycleColumn], observedBefore, observedAfter)

      const replay = await createMembership({
        userId: user.id,
        plan: 'plus',
        skuId: sku.id,
        status,
        effectiveAt: providerStartedAt,
        expiresAt: providerExpiresAt,
        stripeSubscriptionId: subscriptionId,
      })
      expect(replay.id).toBe(membership.id)
      await expect(getTestMembershipRaw(membership.id)).resolves.toMatchObject({
        source_effective_at: raw.source_effective_at,
        [lifecycleColumn]: raw[lifecycleColumn],
        [sourceLifecycleColumn]: raw[sourceLifecycleColumn],
      })
    },
  )
})

function expectObservedDuring(timestamp: Date | null, lowerBound: Date, upperBound: Date): void {
  expect(timestamp!.getTime()).toBeGreaterThanOrEqual(lowerBound.getTime())
  expect(timestamp!.getTime()).toBeLessThanOrEqual(upperBound.getTime())
}
