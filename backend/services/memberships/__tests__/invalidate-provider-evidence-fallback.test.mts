import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  attachTestStripeProductionProviderObservation,
  createTestFamilyMembership,
  createTestSku,
  createTestUser,
  endTestMembershipProjection,
  getTestMembershipProviderEvidenceId,
  getTestMembershipRaw,
} from '@voucha/test-helpers'
import { createMembership } from '../create.mts'
import { getMembershipByUserId, getMembershipHistory } from '../get.mts'
import { rejectMembershipProviderEvidence } from '../invalidate-provider-evidence.mts'

describe('rejectMembershipProviderEvidence fallback access', () => {
  it('retires a live family projection after its evidence is rejected', async () => {
    const member = await createTestUser()
    const sku = await createTestSku({
      plan: 'plus',
      provider_application_id: `live-family-evidence-${randomUUID()}`,
    })
    const family = await createTestFamilyMembership({
      applicationId: sku.provider_application_id,
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
      membershipProductId: sku.id,
      membershipProviderProductId: sku.membership_provider_product_id,
      userId: member.id,
    })
    const evidenceId = await getTestMembershipProviderEvidenceId(family.id)
    if (!evidenceId) throw new Error('Family membership evidence was not created')

    await expect(
      rejectMembershipProviderEvidence(evidenceId, 'Family provider evidence was rejected'),
    ).resolves.toEqual({ invalidated: true, membershipId: family.id })

    await expect(getTestMembershipRaw(family.id)).resolves.toMatchObject({
      cancelled_at: expect.any(Date),
      projection_ended_at: expect.any(Date),
      source_cancelled_at: expect.any(Date),
    })
    await expect(getMembershipByUserId(member.id)).resolves.toBeNull()
  })

  it('restores another verified family source after rejecting the live family evidence', async () => {
    const member = await createTestUser()
    const fallbackSku = await createTestSku({
      plan: 'plus',
      provider_application_id: `family-evidence-fallback-${randomUUID()}`,
    })
    const fallback = await createTestFamilyMembership({
      applicationId: fallbackSku.provider_application_id,
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
      membershipProductId: fallbackSku.id,
      membershipProviderProductId: fallbackSku.membership_provider_product_id,
      userId: member.id,
    })
    await endTestMembershipProjection(fallback.id)
    const currentSku = await createTestSku({
      plan: 'pro',
      provider_application_id: `live-family-evidence-fallback-${randomUUID()}`,
    })
    const current = await createTestFamilyMembership({
      applicationId: currentSku.provider_application_id,
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
      membershipProductId: currentSku.id,
      membershipProviderProductId: currentSku.membership_provider_product_id,
      userId: member.id,
    })
    const evidenceId = await getTestMembershipProviderEvidenceId(current.id)
    if (!evidenceId) throw new Error('Current family membership evidence was not created')

    await expect(
      rejectMembershipProviderEvidence(evidenceId, 'Current family evidence was rejected'),
    ).resolves.toEqual({ invalidated: true, membershipId: current.id })

    const restored = await getMembershipByUserId(member.id)
    expect(restored).toMatchObject({ plan: 'plus', status: 'active' })
    expect(restored?.id).not.toBe(fallback.id)
    expect(restored?.id).not.toBe(current.id)
    await expect(getTestMembershipRaw(current.id)).resolves.toMatchObject({
      cancelled_at: expect.any(Date),
      projection_ended_at: expect.any(Date),
      source_cancelled_at: expect.any(Date),
    })

    await expect(
      rejectMembershipProviderEvidence(evidenceId, 'Family rejection replay'),
    ).resolves.toEqual({ invalidated: false, membershipId: null })

    const history = await getMembershipHistory(member.id)
    expect(
      history.filter(
        change => change.membership_id === current.id && change.change_type === 'cancellation',
      ),
    ).toHaveLength(1)
    expect(
      history.filter(
        change => change.membership_id === restored?.id && change.change_type === 'reactivation',
      ),
    ).toHaveLength(1)
  })

  it('restores a retained verified direct source after rejecting live family evidence', async () => {
    const member = await createTestUser()
    const directSku = await createTestSku({
      plan: 'plus',
      provider_application_id: `retained-direct-${randomUUID()}`,
    })
    const stripeSubscriptionId = `sub_evidence_${randomUUID()}`
    const direct = await createMembership({
      cancelAtPeriodEnd: true,
      userId: member.id,
      plan: 'plus',
      skuId: directSku.id,
      stripeSubscriptionId,
      providerApplicationId: directSku.provider_application_id,
    })
    await attachTestStripeProductionProviderObservation({
      auto_renews: false,
      membership_id: direct.id,
      membership_provider_product_id: directSku.membership_provider_product_id,
    })
    await endTestMembershipProjection(direct.id)
    const familySku = await createTestSku({
      plan: 'pro',
      provider_application_id: `rejected-family-direct-fallback-${randomUUID()}`,
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
    expect(restored).toMatchObject({ plan: 'plus', status: 'active' })
    expect(restored?.id).not.toBe(direct.id)
    await expect(getTestMembershipRaw(restored!.id)).resolves.toMatchObject({
      cancel_at_period_end: true,
      source_auto_renews: false,
      stripe_subscription_id: stripeSubscriptionId,
    })
    expect(
      (await getMembershipHistory(member.id)).find(change => change.membership_id === restored?.id),
    ).toMatchObject({ cancel_at_period_end: true })
  })

  it('restores verified direct fallback despite stale past-due and expiry state', async () => {
    const member = await createTestUser()
    const directSku = await createTestSku({
      plan: 'plus',
      provider_application_id: `stale-direct-${randomUUID()}`,
    })
    const direct = await createMembership({
      expiresAt: new Date('2020-01-01T00:00:00.000Z'),
      status: 'past_due',
      userId: member.id,
      plan: 'plus',
      skuId: directSku.id,
      stripeSubscriptionId: `sub_stale_direct_${randomUUID()}`,
      providerApplicationId: directSku.provider_application_id,
    })
    await attachTestStripeProductionProviderObservation({
      membership_id: direct.id,
      membership_provider_product_id: directSku.membership_provider_product_id,
    })
    await endTestMembershipProjection(direct.id)
    const familySku = await createTestSku({
      plan: 'pro',
      provider_application_id: `rejected-family-stale-direct-${randomUUID()}`,
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
    expect(restored).toMatchObject({ plan: 'plus', status: 'past_due' })
    expect(restored?.id).not.toBe(direct.id)
    await expect(getTestMembershipRaw(restored!.id)).resolves.toMatchObject({
      source_expires_at: new Date('2020-01-01T00:00:00.000Z'),
      source_past_due_at: expect.any(Date),
    })
    expect(
      (await getMembershipHistory(member.id)).find(change => change.membership_id === restored?.id),
    ).toMatchObject({ past_due_at: expect.any(Date) })
  })
})
