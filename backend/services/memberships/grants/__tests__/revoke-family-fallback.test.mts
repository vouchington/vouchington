import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  attachTestStripeProductionProviderObservation,
  createTestAdminGrantMembership,
  createTestFamilyMembership,
  createTestSku,
  createTestUser,
  endTestMembershipProjection,
  getTestGrantQueue,
  getTestMembershipEntitlementEffects,
  insertQueuedMembershipGrant,
  getTestMembershipRaw,
  rejectTestMembershipProviderEvidence,
} from '@voucha/test-helpers'
import { createMembership } from '../../create.mts'
import { getMembershipByUserId, getMembershipHistory } from '../../get.mts'
import { updateMembershipFromEvent } from '../../update.mts'
import { revokeMembershipGrant } from '../revoke.mts'

describe('revokeMembershipGrant family fallback', () => {
  it('restores a retained verified direct Stripe source when revoking the covering grant', async () => {
    const admin = await createTestUser({ administrator: true })
    const member = await createTestUser()
    const directSku = await createTestSku({
      plan: 'plus',
      provider_application_id: `revoked-grant-direct-fallback-${randomUUID()}`,
    })
    const stripeSubscriptionId = `sub_revoked_grant_direct_fallback_${randomUUID()}`
    const direct = await createMembership({
      userId: member.id,
      plan: 'plus',
      skuId: directSku.id,
      stripeSubscriptionId,
      providerApplicationId: directSku.provider_application_id,
    })
    await attachTestStripeProductionProviderObservation({
      membership_id: direct.id,
      membership_provider_product_id: directSku.membership_provider_product_id,
    })
    await endTestMembershipProjection(direct.id)
    const grantSku = await createTestSku({ plan: 'pro', interval: 'yearly' })
    // Committed fixtures: the SERIALIZABLE grant writer is only setup here, and parallel tests'
    // predicate locks can abort it with 40001. Writer coverage lives in create.test.mts.
    const grant = await createTestAdminGrantMembership({
      grantedById: admin.id,
      productId: grantSku.id,
      userId: member.id,
    })

    await revokeMembershipGrant(admin.id, grant.grantId, 'grant revoked')

    await expect(getMembershipByUserId(member.id)).resolves.toMatchObject({
      plan: 'plus',
      status: 'active',
      stripe_subscription_id: stripeSubscriptionId,
    })
  })

  it('restores family access when revoking an active grant that directly replaced family access', async () => {
    const admin = await createTestUser({ administrator: true })
    const member = await createTestUser()
    const familySku = await createTestSku({
      plan: 'plus',
      provider_application_id: `family-direct-grant-revoke-${randomUUID()}`,
    })
    const family = await createTestFamilyMembership({
      applicationId: familySku.provider_application_id,
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
      membershipProductId: familySku.id,
      membershipProviderProductId: familySku.membership_provider_product_id,
      userId: member.id,
    })
    const grantSku = await createTestSku({ plan: 'pro', interval: 'yearly' })
    const grant = await createTestAdminGrantMembership({
      grantedById: admin.id,
      productId: grantSku.id,
      userId: member.id,
    })
    await expect(getTestGrantQueue(member.id)).resolves.toMatchObject({
      active_grant_ids: [grant.grantId],
    })

    const revoked = await revokeMembershipGrant(admin.id, grant.grantId, 'grant revoked')

    expect(revoked).toMatchObject({
      activatedNextGrant: false,
      alreadyRevoked: false,
      grantId: grant.grantId,
    })
    const restored = await getMembershipByUserId(member.id)
    expect(restored).toMatchObject({ plan: 'plus', status: 'active' })
    expect(restored?.id).not.toBe(family.id)
    expect(restored?.id).not.toBe(grant.id)
    const history = (await getMembershipHistory(member.id)).results
    const revocation = history.find(
      change => change.membership_id === grant.id && change.change_type === 'admin_revoke',
    )
    const reactivation = history.find(change => change.membership_id === restored?.id)
    expect(reactivation).toMatchObject({
      change_type: 'reactivation',
      from_sku_id: grantSku.id,
      to_sku_id: familySku.id,
    })
    await expect(
      Promise.all([
        getTestMembershipEntitlementEffects(revocation!.id),
        getTestMembershipEntitlementEffects(reactivation!.id),
      ]),
    ).resolves.toEqual([
      [expect.objectContaining({ membership_change_id: revocation!.id, user_id: member.id })],
      [expect.objectContaining({ membership_change_id: reactivation!.id, user_id: member.id })],
    ])
  })

  it('restores verified family access when revoking the grant promoted after direct suspension', async () => {
    const admin = await createTestUser({ administrator: true })
    const member = await createTestUser()
    const familySku = await createTestSku({
      plan: 'plus',
      provider_application_id: `family-after-revoked-grant-${randomUUID()}`,
    })
    const family = await createTestFamilyMembership({
      applicationId: familySku.provider_application_id,
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
      membershipProductId: familySku.id,
      membershipProviderProductId: familySku.membership_provider_product_id,
      userId: member.id,
    })
    const directSku = await createTestSku({ plan: 'pro' })
    const direct = await createMembership({
      userId: member.id,
      plan: 'pro',
      skuId: directSku.id,
      stripeSubscriptionId: `sub_revoke_family_fallback_${randomUUID()}`,
    })
    const grantSku = await createTestSku({ plan: 'plus', interval: 'yearly' })
    const grantId = await insertQueuedMembershipGrant({
      grantedById: admin.id,
      productId: grantSku.id,
      userId: member.id,
      durationDays: 30,
    })

    await updateMembershipFromEvent(
      { membershipId: direct.id, status: 'paused' },
      async () => false,
    )
    const activeGrant = await getMembershipByUserId(member.id)
    expect(activeGrant).toMatchObject({
      granted_by_id: admin.id,
      status: 'active',
    })

    const revoked = await revokeMembershipGrant(admin.id, grantId, 'grant revoked')

    expect(revoked).toMatchObject({
      activatedNextGrant: false,
      alreadyRevoked: false,
      grantId,
    })
    const restored = await getMembershipByUserId(member.id)
    expect(restored).toMatchObject({ plan: 'plus', status: 'active' })
    expect(restored?.id).not.toBe(family.id)
    expect(restored?.id).not.toBe(activeGrant?.id)
    const history = (await getMembershipHistory(member.id)).results
    const revocation = history.find(
      change => change.membership_id === activeGrant?.id && change.change_type === 'admin_revoke',
    )
    const reactivation = history.find(change => change.membership_id === restored?.id)
    expect(revocation).toMatchObject({
      from_sku_id: grantSku.id,
      note: 'grant revoked',
    })
    expect(reactivation).toMatchObject({
      change_type: 'reactivation',
      from_sku_id: grantSku.id,
      to_sku_id: familySku.id,
    })
    await expect(
      Promise.all([
        getTestMembershipEntitlementEffects(revocation!.id),
        getTestMembershipEntitlementEffects(reactivation!.id),
      ]),
    ).resolves.toEqual([
      [expect.objectContaining({ membership_change_id: revocation!.id, user_id: member.id })],
      [expect.objectContaining({ membership_change_id: reactivation!.id, user_id: member.id })],
    ])
  })

  it('does not restore family access when the retained family evidence is rejected', async () => {
    const admin = await createTestUser({ administrator: true })
    const member = await createTestUser()
    const familySku = await createTestSku({
      plan: 'plus',
      provider_application_id: `rejected-family-grant-revoke-${randomUUID()}`,
    })
    const family = await createTestFamilyMembership({
      applicationId: familySku.provider_application_id,
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
      membershipProductId: familySku.id,
      membershipProviderProductId: familySku.membership_provider_product_id,
      userId: member.id,
    })
    await rejectTestMembershipProviderEvidence(family.id)
    const grantSku = await createTestSku({ plan: 'pro', interval: 'yearly' })
    const grant = await createTestAdminGrantMembership({
      grantedById: admin.id,
      productId: grantSku.id,
      userId: member.id,
    })
    await expect(getTestGrantQueue(member.id)).resolves.toMatchObject({
      active_grant_ids: [grant.grantId],
    })

    await revokeMembershipGrant(admin.id, grant.grantId, 'grant revoked without valid family')

    await expect(getMembershipByUserId(member.id)).resolves.toBeNull()
    await expect(getTestMembershipRaw(grant.id)).resolves.toMatchObject({
      id: grant.id,
      status: 'cancelled',
    })
  })
})
