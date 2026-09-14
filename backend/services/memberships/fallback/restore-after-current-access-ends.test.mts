import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createTestFamilyMembership,
  createTestSku,
  createTestUser,
  endTestMembershipProjection,
  getTestMembershipEntitlementEffects,
  getTestMembershipRaw,
  rejectTestMembershipProviderEvidence,
  updateTestMembershipExpiresAt,
} from '@voucha/test-helpers'
import { createMembership, grantMembership } from '../create.mts'
import { getMembershipByUserId, getMembershipHistory } from '../get.mts'
import { updateMembershipFromEvent } from '../update.mts'

describe('fallback access after current direct or administrator-grant access ends', () => {
  it.each(['cancelled', 'expired', 'paused'] as const)(
    'restores valid family access after a higher direct term becomes %s',
    async status => {
      const user = await createTestUser()
      const familySku = await createTestSku({
        plan: 'plus',
        provider_application_id: `family-restoration-${randomUUID()}`,
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
        stripeSubscriptionId: `sub_restore_family_${status}_${randomUUID()}`,
      })

      await updateMembershipFromEvent(
        {
          membershipId: direct.id,
          status,
          terminalEffectiveAt: status === 'paused' ? undefined : new Date(),
        },
        async () => false,
      )

      const restored = await getMembershipByUserId(user.id)
      expect(restored).toMatchObject({
        plan: 'plus',
        status: 'active',
      })
      expect(restored?.id).not.toBe(family.id)
      await expect(getTestMembershipRaw(family.id)).resolves.toMatchObject({
        projection_ended_at: expect.any(Date),
      })
      await expect(getTestMembershipRaw(direct.id)).resolves.toMatchObject({
        projection_ended_at: expect.any(Date),
        status,
      })
      const restoration = (await getMembershipHistory(user.id)).find(
        change => change.membership_id === restored?.id,
      )
      expect(restoration).toMatchObject({
        change_type: 'reactivation',
        from_sku_id: directSku.id,
        to_sku_id: familySku.id,
      })
      await expect(getTestMembershipEntitlementEffects(restoration!.id)).resolves.toEqual([
        expect.objectContaining({ membership_change_id: restoration!.id, user_id: user.id }),
      ])
    },
  )

  it('preserves queued-grant FIFO precedence over a family restoration', async () => {
    const admin = await createTestUser({ administrator: true })
    const user = await createTestUser()
    const familySku = await createTestSku({
      plan: 'plus',
      provider_application_id: `family-grant-precedence-${randomUUID()}`,
    })
    await createTestFamilyMembership({
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
      stripeSubscriptionId: `sub_family_grant_precedence_${randomUUID()}`,
    })
    const grantSku = await createTestSku({ plan: 'plus', interval: 'yearly' })
    await grantMembership(admin.id, user.id, 'plus', grantSku.id, 30)

    await updateMembershipFromEvent(
      { membershipId: direct.id, status: 'paused' },
      async () => false,
    )

    await expect(getMembershipByUserId(user.id)).resolves.toMatchObject({
      granted_by_id: admin.id,
      plan: 'plus',
      status: 'active',
    })
  })

  it('restores the highest-tier valid family source before a newer lower tier', async () => {
    const user = await createTestUser()
    const proSku = await createTestSku({
      plan: 'pro',
      provider_application_id: `family-restoration-pro-${randomUUID()}`,
    })
    const proFamily = await createTestFamilyMembership({
      applicationId: proSku.provider_application_id,
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
      membershipProductId: proSku.id,
      membershipProviderProductId: proSku.membership_provider_product_id,
      userId: user.id,
    })
    await endTestMembershipProjection(proFamily.id)
    const plusSku = await createTestSku({
      plan: 'plus',
      provider_application_id: `family-restoration-plus-${randomUUID()}`,
    })
    await createTestFamilyMembership({
      applicationId: plusSku.provider_application_id,
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
      membershipProductId: plusSku.id,
      membershipProviderProductId: plusSku.membership_provider_product_id,
      userId: user.id,
    })
    const direct = await createMembership({
      userId: user.id,
      plan: 'pro',
      skuId: proSku.id,
      stripeSubscriptionId: `sub_restore_highest_family_${randomUUID()}`,
    })

    await updateMembershipFromEvent(
      { membershipId: direct.id, status: 'paused' },
      async () => false,
    )

    const restored = await getMembershipByUserId(user.id)
    expect(restored).toMatchObject({
      plan: 'pro',
      status: 'active',
    })
    expect(restored?.id).not.toBe(direct.id)
  })

  it('does not restore expired family source state', async () => {
    const user = await createTestUser()
    const familySku = await createTestSku({
      plan: 'plus',
      provider_application_id: `expired-family-restoration-${randomUUID()}`,
    })
    const family = await createTestFamilyMembership({
      applicationId: familySku.provider_application_id,
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
      membershipProductId: familySku.id,
      membershipProviderProductId: familySku.membership_provider_product_id,
      userId: user.id,
    })
    await updateTestMembershipExpiresAt(family.id, new Date('2020-01-01T00:00:00.000Z'))
    const directSku = await createTestSku({ plan: 'pro' })
    const direct = await createMembership({
      userId: user.id,
      plan: 'pro',
      skuId: directSku.id,
      stripeSubscriptionId: `sub_expired_family_${randomUUID()}`,
    })

    await updateMembershipFromEvent(
      { membershipId: direct.id, status: 'paused' },
      async () => false,
    )

    await expect(getMembershipByUserId(user.id)).resolves.toMatchObject({
      id: direct.id,
      status: 'paused',
    })
  })

  it('does not restore family access after its evidence is rejected', async () => {
    const user = await createTestUser()
    const familySku = await createTestSku({
      plan: 'plus',
      provider_application_id: `rejected-family-restoration-${randomUUID()}`,
    })
    const family = await createTestFamilyMembership({
      applicationId: familySku.provider_application_id,
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
      membershipProductId: familySku.id,
      membershipProviderProductId: familySku.membership_provider_product_id,
      userId: user.id,
    })
    await rejectTestMembershipProviderEvidence(family.id)
    const directSku = await createTestSku({ plan: 'pro' })
    const direct = await createMembership({
      userId: user.id,
      plan: 'pro',
      skuId: directSku.id,
      stripeSubscriptionId: `sub_rejected_family_${randomUUID()}`,
    })

    await updateMembershipFromEvent(
      { membershipId: direct.id, status: 'paused' },
      async () => false,
    )

    await expect(getMembershipByUserId(user.id)).resolves.toMatchObject({
      id: direct.id,
      status: 'paused',
    })
  })

  it('does not restore a family source before its effective time', async () => {
    const user = await createTestUser()
    const familySku = await createTestSku({
      plan: 'plus',
      provider_application_id: `future-family-restoration-${randomUUID()}`,
    })
    const family = await createTestFamilyMembership({
      applicationId: familySku.provider_application_id,
      effectiveAt: new Date('2030-01-01T00:00:00.000Z'),
      expiresAt: new Date('2031-01-01T00:00:00.000Z'),
      membershipProductId: familySku.id,
      membershipProviderProductId: familySku.membership_provider_product_id,
      userId: user.id,
    })
    await endTestMembershipProjection(family.id)
    const directSku = await createTestSku({ plan: 'pro' })
    const direct = await createMembership({
      userId: user.id,
      plan: 'pro',
      skuId: directSku.id,
      stripeSubscriptionId: `sub_future_family_${randomUUID()}`,
    })

    await updateMembershipFromEvent(
      { membershipId: direct.id, status: 'paused' },
      async () => false,
    )

    await expect(getMembershipByUserId(user.id)).resolves.toMatchObject({
      id: direct.id,
      status: 'paused',
    })
  })
})
