import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createTestMembership,
  createTestSku,
  createTestUser,
  endTestMembershipProjection,
} from '@voucha/test-helpers'
import {
  getMembershipByStripeSubscriptionId,
  getRetainedDirectMembershipSourceByStripeIdentity,
} from './get.mts'

describe('retained direct membership source lookup', () => {
  it.each(['active', 'past_due'] as const)(
    'finds a suppressed direct source with %s state by its provider lineage',
    async status => {
      const member = await createTestUser()
      const applicationId = `membership-retained-${status}-${randomUUID()}`
      const subscriptionId = `sub_retained_${status}_${randomUUID()}`
      const sku = await createTestSku({ provider_application_id: applicationId })
      const direct = await createTestMembership({
        provider_environment: 'production',
        provider_application_id: applicationId,
        status,
        sku_id: sku.id,
        stripe_subscription_id: subscriptionId,
        user_id: member.id,
      })
      await endTestMembershipProjection(direct.id)
      await createTestMembership({ user_id: member.id, stripe_subscription_id: null })

      const sourceIdentity = {
        applicationId,
        environment: 'production' as const,
        provider: 'stripe' as const,
        providerLineageId: subscriptionId,
      }
      await expect(getMembershipByStripeSubscriptionId(sourceIdentity)).resolves.toBeNull()
      await expect(
        getRetainedDirectMembershipSourceByStripeIdentity(sourceIdentity),
      ).resolves.toEqual({
        membershipId: direct.id,
        status,
        userId: member.id,
      })
    },
  )
})
