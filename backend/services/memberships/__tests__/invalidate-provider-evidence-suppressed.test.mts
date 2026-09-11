import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  attachTestStripeProductionProviderObservation,
  createTestFamilyMembership,
  createTestSku,
  createTestUser,
  endTestMembershipProjection,
  getTestGrantQueue,
  getTestMembershipEntitlementEffects,
  getTestMembershipProviderEvidenceId,
  getTestMembershipRaw,
  rejectTestMembershipProviderEvidence,
} from '@voucha/test-helpers'
import { createMembership, grantMembership } from '../create.mts'
import { getMembershipByUserId, getMembershipHistory } from '../get.mts'
import { rejectMembershipProviderEvidence } from '../invalidate-provider-evidence.mts'

describe('rejectMembershipProviderEvidence suppressed access', () => {
  it('activates a queued grant when the higher-tier family fallback is rejected', async () => {
    const admin = await createTestUser({ administrator: true })
    const member = await createTestUser()
    const directSku = await createTestSku({ plan: 'pro' })
    const direct = await createMembership({
      userId: member.id,
      plan: 'pro',
      skuId: directSku.id,
      stripeSubscriptionId: `sub_rejected_family_queued_grant_${randomUUID()}`,
      providerApplicationId: directSku.provider_application_id,
    })
    const grantSku = await createTestSku({ plan: 'plus', interval: 'yearly' })
    const queued = await grantMembership(admin.id, member.id, 'plus', grantSku.id, 30)
    expect(queued.queued).toBe(true)
    await attachTestStripeProductionProviderObservation({
      membership_id: direct.id,
      membership_provider_product_id: directSku.membership_provider_product_id,
    })
    await rejectTestMembershipProviderEvidence(direct.id)
    await endTestMembershipProjection(direct.id)
    const familySku = await createTestSku({
      plan: 'pro',
      provider_application_id: `rejected-family-queued-grant-${randomUUID()}`,
    })
    const family = await createTestFamilyMembership({
      applicationId: familySku.provider_application_id,
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
      membershipProductId: familySku.id,
      membershipProviderProductId: familySku.membership_provider_product_id,
      userId: member.id,
    })
    await expect(getMembershipByUserId(member.id)).resolves.toMatchObject({
      plan: 'pro',
      status: 'active',
    })
    const evidenceId = await getTestMembershipProviderEvidenceId(family.id)
    if (!evidenceId) throw new Error('Family membership evidence was not created')

    await rejectMembershipProviderEvidence(evidenceId, 'Family fallback evidence was rejected')

    await expect(getMembershipByUserId(member.id)).resolves.toMatchObject({
      granted_by_id: admin.id,
      plan: 'plus',
      status: 'active',
    })
    await expect(getTestGrantQueue(member.id)).resolves.toMatchObject({
      active_grant_ids: expect.arrayContaining([queued.grantId]),
      open_activation_count: 1,
    })
  })

  it('restores an active administrator grant after rejecting live family evidence', async () => {
    const admin = await createTestUser({ administrator: true })
    const member = await createTestUser()
    const grantSku = await createTestSku({ plan: 'pro', interval: 'yearly' })
    const grant = await grantMembership(admin.id, member.id, 'pro', grantSku.id, 30)
    await endTestMembershipProjection(grant.id)
    const familySku = await createTestSku({
      plan: 'plus',
      provider_application_id: `rejected-family-grant-fallback-${randomUUID()}`,
    })
    const family = await createTestFamilyMembership({
      applicationId: familySku.provider_application_id,
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
      membershipProductId: familySku.id,
      membershipProviderProductId: familySku.membership_provider_product_id,
      userId: member.id,
    })
    const evidenceId = await getTestMembershipProviderEvidenceId(family.id)
    if (!evidenceId) throw new Error('Family membership evidence was not created')

    await rejectMembershipProviderEvidence(evidenceId, 'Family evidence was rejected')

    const restored = await getMembershipByUserId(member.id)
    expect(restored).toMatchObject({ plan: 'pro', status: 'active' })
    expect(restored?.id).not.toBe(grant.id)
    await expect(getTestMembershipRaw(restored!.id)).resolves.toMatchObject({
      granted_by_id: admin.id,
    })
  })

  it('audits a suppressed direct source after its evidence is rejected', async () => {
    const admin = await createTestUser({ administrator: true })
    const member = await createTestUser()
    const directSku = await createTestSku({
      plan: 'plus',
      provider_application_id: `suppressed-direct-evidence-${randomUUID()}`,
    })
    const direct = await createMembership({
      userId: member.id,
      plan: 'plus',
      skuId: directSku.id,
      stripeSubscriptionId: `sub_evidence_${randomUUID()}`,
      providerApplicationId: directSku.provider_application_id,
    })
    const observation = await attachTestStripeProductionProviderObservation({
      membership_id: direct.id,
      membership_provider_product_id: directSku.membership_provider_product_id,
    })
    const grantSku = await createTestSku({ plan: 'pro', interval: 'yearly' })
    await grantMembership(admin.id, member.id, 'pro', grantSku.id, 30)

    await expect(
      rejectMembershipProviderEvidence(
        observation.membership_provider_evidence_id,
        'Suppressed direct evidence was rejected',
      ),
    ).resolves.toEqual({ invalidated: true, membershipId: direct.id })

    await expect(getTestMembershipRaw(direct.id)).resolves.toMatchObject({
      cancelled_at: expect.any(Date),
      projection_ended_at: expect.any(Date),
      source_cancelled_at: expect.any(Date),
    })
    await expect(getMembershipByUserId(member.id)).resolves.toMatchObject({
      plan: 'pro',
      status: 'active',
    })
    const history = await getMembershipHistory(member.id)
    const cancellation = history.find(
      change => change.membership_id === direct.id && change.change_type === 'cancellation',
    )
    await expect(getTestMembershipEntitlementEffects(cancellation!.id)).resolves.toHaveLength(1)
  })
})
