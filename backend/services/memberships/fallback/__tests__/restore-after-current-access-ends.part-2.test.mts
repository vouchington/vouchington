import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createTestAdminGrantMembership,
  createTestFamilyMembership,
  createTestSku,
  createTestUser,
  getTestGrantQueue,
  getTestMembershipEntitlementEffects,
  insertQueuedMembershipGrant,
  getTestMembershipRaw,
  updateTestMembershipExpiresAt,
} from '@voucha/test-helpers'
import { createMembership } from '../../create.mts'
import { getMembershipByUserId, getMembershipHistory } from '../../get.mts'
import { expireElapsedMembershipsForUsers } from '../../grants/expire-elapsed-batch.mts'
import { updateMembershipFromEvent } from '../../update.mts'

describe('fallback access after current direct or administrator-grant access ends', () => {
  it('restores family access when an active grant directly replacing family access expires', async () => {
    const admin = await createTestUser({ administrator: true })
    const user = await createTestUser()
    const familySku = await createTestSku({
      plan: 'plus',
      provider_application_id: `family-direct-grant-expiry-${randomUUID()}`,
    })
    const family = await createTestFamilyMembership({
      applicationId: familySku.provider_application_id,
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
      membershipProductId: familySku.id,
      membershipProviderProductId: familySku.membership_provider_product_id,
      userId: user.id,
    })
    const grantSku = await createTestSku({ plan: 'pro', interval: 'yearly' })
    // Committed fixtures: the SERIALIZABLE grant writer is only setup here, and parallel tests'
    // predicate locks can abort it with 40001. Writer coverage lives in create.test.mts.
    const grant = await createTestAdminGrantMembership({
      grantedById: admin.id,
      productId: grantSku.id,
      userId: user.id,
    })
    await expect(getTestGrantQueue(user.id)).resolves.toMatchObject({
      active_grant_ids: [grant.grantId],
    })
    await updateTestMembershipExpiresAt(grant.id, new Date('2020-01-01T00:00:00.000Z'))

    await expect(expireElapsedMembershipsForUsers([user.id])).resolves.toEqual({
      expired: 1,
      hasMore: false,
    })

    const restored = await getMembershipByUserId(user.id)
    expect(restored).toMatchObject({ plan: 'plus', status: 'active' })
    expect(restored?.id).not.toBe(family.id)
    expect(restored?.id).not.toBe(grant.id)
    const history = (await getMembershipHistory(user.id)).results
    const expiration = history.find(
      change => change.membership_id === grant.id && change.change_type === 'expiration',
    )
    const reactivation = history.find(change => change.membership_id === restored?.id)
    expect(reactivation).toMatchObject({
      change_type: 'reactivation',
      from_sku_id: grantSku.id,
      to_sku_id: familySku.id,
    })
    await expect(
      Promise.all([
        getTestMembershipEntitlementEffects(expiration!.id),
        getTestMembershipEntitlementEffects(reactivation!.id),
      ]),
    ).resolves.toEqual([
      [expect.objectContaining({ membership_change_id: expiration!.id, user_id: user.id })],
      [expect.objectContaining({ membership_change_id: reactivation!.id, user_id: user.id })],
    ])
  })

  it('restores a verified, currently-effective family source when no grant remains', async () => {
    const admin = await createTestUser({ administrator: true })
    const user = await createTestUser()
    const familySku = await createTestSku({
      plan: 'plus',
      provider_application_id: `family-after-grant-${randomUUID()}`,
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
      stripeSubscriptionId: `sub_family_after_grant_${randomUUID()}`,
    })
    const grantSku = await createTestSku({ plan: 'plus', interval: 'yearly' })
    await insertQueuedMembershipGrant({
      grantedById: admin.id,
      productId: grantSku.id,
      userId: user.id,
      durationDays: 30,
    })

    await updateMembershipFromEvent(
      { membershipId: direct.id, status: 'paused' },
      async () => false,
    )
    const activeGrant = await getMembershipByUserId(user.id)
    expect(activeGrant).toMatchObject({ granted_by_id: admin.id, status: 'active' })
    await updateTestMembershipExpiresAt(activeGrant!.id, new Date('2020-01-01T00:00:00.000Z'))

    await expect(expireElapsedMembershipsForUsers([user.id])).resolves.toEqual({
      expired: 1,
      hasMore: false,
    })

    const restored = await getMembershipByUserId(user.id)
    expect(restored).toMatchObject({ plan: 'plus', status: 'active' })
    expect(restored?.id).not.toBe(family.id)
    expect(restored?.id).not.toBe(activeGrant?.id)
    await expect(getTestMembershipRaw(activeGrant!.id)).resolves.toMatchObject({
      expired_at: new Date('2020-01-01T00:00:00.000Z'),
      projection_ended_at: expect.any(Date),
    })
    const history = (await getMembershipHistory(user.id)).results
    expect(history).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          membership_id: activeGrant!.id,
          change_type: 'expiration',
          from_sku_id: grantSku.id,
        }),
      ]),
    )
    const reactivation = history.find(change => change.membership_id === restored?.id)
    expect(reactivation).toMatchObject({
      change_type: 'reactivation',
      from_sku_id: grantSku.id,
      to_sku_id: familySku.id,
    })
    await expect(getTestMembershipEntitlementEffects(reactivation!.id)).resolves.toEqual([
      expect.objectContaining({ membership_change_id: reactivation!.id, user_id: user.id }),
    ])
  })

  it('restores family access after every grant in a promoted FIFO chain expires', async () => {
    const admin = await createTestUser({ administrator: true })
    const user = await createTestUser()
    const familySku = await createTestSku({
      plan: 'plus',
      provider_application_id: `family-after-grant-chain-${randomUUID()}`,
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
      stripeSubscriptionId: `sub_family_after_grant_chain_${randomUUID()}`,
    })
    const firstGrantSku = await createTestSku({ plan: 'plus', interval: 'yearly' })
    const terminalDirectDecoy = await createMembership({
      userId: user.id,
      plan: 'plus',
      skuId: firstGrantSku.id,
      status: 'cancelled',
      stripeSubscriptionId: `sub_family_after_grant_chain_decoy_${randomUUID()}`,
    })
    await expect(getTestMembershipRaw(terminalDirectDecoy.id)).resolves.toMatchObject({
      projection_ended_at: expect.any(Date),
      status: 'cancelled',
    })
    const firstGrantId = await insertQueuedMembershipGrant({
      grantedById: admin.id,
      productId: firstGrantSku.id,
      userId: user.id,
      durationDays: 30,
    })
    const secondGrantSku = await createTestSku({ plan: 'plus', interval: 'yearly' })
    const secondGrantId = await insertQueuedMembershipGrant({
      grantedById: admin.id,
      productId: secondGrantSku.id,
      userId: user.id,
      durationDays: 30,
    })
    await expect(getTestGrantQueue(user.id)).resolves.toMatchObject({
      active_grant_ids: [],
      grant_ids: [firstGrantId, secondGrantId],
    })

    await updateMembershipFromEvent(
      { membershipId: direct.id, status: 'paused' },
      async () => false,
    )
    const firstActiveGrant = await getMembershipByUserId(user.id)
    expect(firstActiveGrant).toMatchObject({
      plan: 'plus',
      sku: { id: firstGrantSku.id },
      status: 'active',
    })
    await updateTestMembershipExpiresAt(firstActiveGrant!.id, new Date('2020-01-01T00:00:00.000Z'))

    await expect(expireElapsedMembershipsForUsers([user.id])).resolves.toEqual({
      expired: 1,
      hasMore: false,
    })
    const secondActiveGrant = await getMembershipByUserId(user.id)
    expect(secondActiveGrant).toMatchObject({
      plan: 'plus',
      sku: { id: secondGrantSku.id },
      status: 'active',
    })
    expect(secondActiveGrant?.id).not.toBe(firstActiveGrant?.id)
    await updateTestMembershipExpiresAt(secondActiveGrant!.id, new Date('2020-01-01T00:00:00.000Z'))

    await expect(expireElapsedMembershipsForUsers([user.id])).resolves.toEqual({
      expired: 1,
      hasMore: false,
    })

    const restored = await getMembershipByUserId(user.id)
    expect(restored).toMatchObject({ plan: 'plus', status: 'active' })
    expect(restored?.id).not.toBe(family.id)
    expect(restored?.id).not.toBe(secondActiveGrant?.id)
    const history = (await getMembershipHistory(user.id)).results
    const firstExpiration = history.find(
      change =>
        change.membership_id === firstActiveGrant!.id && change.change_type === 'expiration',
    )
    expect(firstExpiration).toMatchObject({ from_sku_id: firstGrantSku.id })
    const grantPromotion = history.find(
      change =>
        change.membership_id === secondActiveGrant!.id && change.change_type === 'admin_grant',
    )
    expect(grantPromotion).toMatchObject({
      from_sku_id: firstGrantSku.id,
      to_sku_id: secondGrantSku.id,
    })
    const secondExpiration = history.find(
      change =>
        change.membership_id === secondActiveGrant!.id && change.change_type === 'expiration',
    )
    expect(secondExpiration).toMatchObject({ from_sku_id: secondGrantSku.id })
    const reactivation = history.find(change => change.membership_id === restored?.id)
    expect(reactivation).toMatchObject({
      change_type: 'reactivation',
      from_sku_id: secondGrantSku.id,
      to_sku_id: familySku.id,
    })
    await expect(
      Promise.all([
        getTestMembershipEntitlementEffects(firstExpiration!.id),
        getTestMembershipEntitlementEffects(grantPromotion!.id),
        getTestMembershipEntitlementEffects(secondExpiration!.id),
        getTestMembershipEntitlementEffects(reactivation!.id),
      ]),
    ).resolves.toEqual([
      [expect.objectContaining({ membership_change_id: firstExpiration!.id, user_id: user.id })],
      [expect.objectContaining({ membership_change_id: grantPromotion!.id, user_id: user.id })],
      [expect.objectContaining({ membership_change_id: secondExpiration!.id, user_id: user.id })],
      [expect.objectContaining({ membership_change_id: reactivation!.id, user_id: user.id })],
    ])
  })
})
