import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createTestFamilyMembership,
  createTestMembership,
  createTestSku,
  createTestUser,
  getTestMembershipRaw,
  rejectTestMembershipProviderEvidence,
  updateTestMembershipExpiresAt,
} from '@voucha/test-helpers'
import { createMembership } from './create.mts'
import {
  DirectMembershipSourceRejectedError,
  getDirectMembershipSourceAdmission,
} from './direct-source-authority.mts'

describe('direct membership source authority', () => {
  it('allows a higher direct tier to replace a current family projection', async () => {
    const user = await createTestUser()
    const familySku = await createTestSku({
      plan: 'plus',
      provider_application_id: `family-authority-${randomUUID()}`,
    })
    const family = await createTestFamilyMembership({
      applicationId: familySku.provider_application_id,
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
      membershipProductId: familySku.id,
      membershipProviderProductId: familySku.membership_provider_product_id,
      userId: user.id,
    })
    const directSku = await createTestSku({ plan: 'pro' })

    const direct = await createMembership({
      userId: user.id,
      plan: 'pro',
      skuId: directSku.id,
      stripeSubscriptionId: `sub_family_replacement_${randomUUID()}`,
    })
    await expect(getTestMembershipRaw(family.id)).resolves.toMatchObject({
      id: family.id,
      projection_ended_at: expect.any(Date),
    })
    await expect(getTestMembershipRaw(direct.id)).resolves.toMatchObject({
      id: direct.id,
      projection_ended_at: null,
    })
  })

  it('rejects a same-tier direct source when family access is current', async () => {
    const user = await createTestUser()
    const familySku = await createTestSku({
      plan: 'plus',
      provider_application_id: `family-authority-${randomUUID()}`,
    })
    await createTestFamilyMembership({
      applicationId: familySku.provider_application_id,
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
      membershipProductId: familySku.id,
      membershipProviderProductId: familySku.membership_provider_product_id,
      userId: user.id,
    })
    const directSku = await createTestSku({ plan: 'plus' })

    await expect(
      createMembership({
        userId: user.id,
        plan: 'plus',
        skuId: directSku.id,
        stripeSubscriptionId: `sub_family_same_tier_${randomUUID()}`,
      }),
    ).rejects.toMatchObject({
      reason: 'current_source_not_lower_tier',
      currentSourceKind: 'family',
    } satisfies Partial<DirectMembershipSourceRejectedError>)
  })

  it.each(['cancelled', 'expired', 'past_due', 'paused'] as const)(
    'allows same-tier direct admission when a live family projection has a %s source state',
    async sourceStatus => {
      const user = await createTestUser()
      const familySku = await createTestSku({
        plan: 'plus',
        provider_application_id: `family-stale-${sourceStatus}-${randomUUID()}`,
      })
      await createTestFamilyMembership({
        applicationId: familySku.provider_application_id,
        expiresAt: new Date('2030-01-01T00:00:00.000Z'),
        membershipProductId: familySku.id,
        membershipProviderProductId: familySku.membership_provider_product_id,
        sourceStatus,
        userId: user.id,
      })

      await expect(getDirectMembershipSourceAdmission(user.id, 'plus')).resolves.toEqual({
        accepted: true,
      })
    },
  )

  it('allows same-tier direct admission when a live family projection source has elapsed', async () => {
    const user = await createTestUser()
    const familySku = await createTestSku({
      plan: 'plus',
      provider_application_id: `family-stale-expiry-${randomUUID()}`,
    })
    await createTestFamilyMembership({
      applicationId: familySku.provider_application_id,
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
      membershipProductId: familySku.id,
      membershipProviderProductId: familySku.membership_provider_product_id,
      sourceEffectiveAt: new Date('2019-01-01T00:00:00.000Z'),
      sourceExpiresAt: new Date('2020-01-01T00:00:00.000Z'),
      userId: user.id,
    })

    await expect(getDirectMembershipSourceAdmission(user.id, 'plus')).resolves.toEqual({
      accepted: true,
    })
  })

  it('ignores a current family projection after its evidence is rejected', async () => {
    const user = await createTestUser()
    const familySku = await createTestSku({
      plan: 'plus',
      provider_application_id: `family-rejected-evidence-${randomUUID()}`,
    })
    const family = await createTestFamilyMembership({
      applicationId: familySku.provider_application_id,
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
      membershipProductId: familySku.id,
      membershipProviderProductId: familySku.membership_provider_product_id,
      userId: user.id,
    })
    await rejectTestMembershipProviderEvidence(family.id)
    const directSku = await createTestSku({ plan: 'plus' })

    const direct = await createMembership({
      userId: user.id,
      plan: 'plus',
      skuId: directSku.id,
      stripeSubscriptionId: `sub_rejected_family_${randomUUID()}`,
    })

    await expect(getTestMembershipRaw(family.id)).resolves.toMatchObject({
      projection_ended_at: expect.any(Date),
    })
    await expect(getTestMembershipRaw(direct.id)).resolves.toMatchObject({
      projection_ended_at: null,
    })
  })

  it('allows a replacement while direct access is paused', async () => {
    const user = await createTestUser()
    const pausedSku = await createTestSku({ plan: 'plus' })
    const paused = await createTestMembership({
      user_id: user.id,
      sku_id: pausedSku.id,
      stripe_subscription_id: `sub_elapsed_paused_${randomUUID()}`,
      status: 'paused',
    })
    const replacementSku = await createTestSku({ plan: 'plus' })

    const replacement = await createMembership({
      userId: user.id,
      plan: 'plus',
      skuId: replacementSku.id,
      stripeSubscriptionId: `sub_elapsed_paused_replacement_${randomUUID()}`,
    })

    await expect(getTestMembershipRaw(paused.id)).resolves.toMatchObject({
      id: paused.id,
      projection_ended_at: expect.any(Date),
    })
    await expect(getTestMembershipRaw(replacement.id)).resolves.toMatchObject({
      id: replacement.id,
      projection_ended_at: null,
    })
  })

  it('does not let elapsed non-direct access reject direct checkout admission', async () => {
    const adminUser = await createTestUser()
    const adminSku = await createTestSku({ plan: 'plus' })
    const adminGrant = await createTestMembership({ user_id: adminUser.id, sku_id: adminSku.id })
    await updateTestMembershipExpiresAt(adminGrant.id, new Date('2020-01-01T00:00:00.000Z'))
    await expect(getDirectMembershipSourceAdmission(adminUser.id, 'plus')).resolves.toEqual({
      accepted: true,
    })

    const familyUser = await createTestUser()
    const familySku = await createTestSku({
      plan: 'plus',
      provider_application_id: `family-elapsed-authority-${randomUUID()}`,
    })
    const family = await createTestFamilyMembership({
      applicationId: familySku.provider_application_id,
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
      membershipProductId: familySku.id,
      membershipProviderProductId: familySku.membership_provider_product_id,
      userId: familyUser.id,
    })
    await updateTestMembershipExpiresAt(family.id, new Date('2020-01-01T00:00:00.000Z'))

    await expect(getDirectMembershipSourceAdmission(familyUser.id, 'plus')).resolves.toEqual({
      accepted: true,
    })
  })

  it('serializes competing direct sources so only one becomes the effective projection', async () => {
    const user = await createTestUser()
    const sku = await createTestSku({ plan: 'plus' })
    const firstSubscriptionId = `sub_first_${randomUUID()}`
    const secondSubscriptionId = `sub_second_${randomUUID()}`

    const outcomes = await Promise.allSettled([
      createMembership({
        userId: user.id,
        plan: 'plus',
        skuId: sku.id,
        stripeSubscriptionId: firstSubscriptionId,
      }),
      createMembership({
        userId: user.id,
        plan: 'plus',
        skuId: sku.id,
        stripeSubscriptionId: secondSubscriptionId,
      }),
    ])

    const fulfilled = outcomes.filter(
      (outcome): outcome is PromiseFulfilledResult<Awaited<ReturnType<typeof createMembership>>> =>
        outcome.status === 'fulfilled',
    )
    const rejected = outcomes.filter(
      (outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected',
    )
    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect(rejected[0]?.reason).toMatchObject({
      reason: 'competing_direct_source',
      currentSourceKind: 'direct',
    } satisfies Partial<DirectMembershipSourceRejectedError>)
    await expect(getTestMembershipRaw(fulfilled[0]!.value.id)).resolves.toMatchObject({
      id: fulfilled[0]!.value.id,
      projection_ended_at: null,
    })
  })

  it('rejects a different Stripe lineage context that reuses the raw subscription ID', async () => {
    const user = await createTestUser()
    const sku = await createTestSku({ plan: 'plus' })
    const subscriptionId = `sub_context_${randomUUID()}`
    const first = await createMembership({
      userId: user.id,
      plan: 'plus',
      skuId: sku.id,
      stripeSubscriptionId: subscriptionId,
      providerEnvironment: 'test',
      providerApplicationId: `stripe-test-${randomUUID()}`,
    })

    await expect(
      createMembership({
        userId: user.id,
        plan: 'plus',
        skuId: sku.id,
        stripeSubscriptionId: subscriptionId,
        providerEnvironment: 'production',
        providerApplicationId: `stripe-production-${randomUUID()}`,
      }),
    ).rejects.toMatchObject({
      reason: 'competing_direct_source',
      currentSourceKind: 'direct',
    } satisfies Partial<DirectMembershipSourceRejectedError>)
    await expect(getTestMembershipRaw(first.id)).resolves.toMatchObject({
      id: first.id,
      projection_ended_at: null,
    })
  })
})
