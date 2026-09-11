import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  attachTestStripeProductionProviderObservation,
  createTestFamilyMembership,
  createTestSku,
  createTestUser,
  createTestUnprojectedStripeProductionProviderObservation,
  getTestMembershipEntitlementEffects,
  getTestMembershipRaw,
  getTestMembershipSourceState,
  rejectTestMembershipProviderEvidence,
} from '@voucha/test-helpers'
import { recordMembershipChange } from './changes.mts'
import { createMembership } from './create.mts'
import { getMembershipByUserId, getMembershipHistory } from './get.mts'
import { rejectMembershipProviderEvidence } from './invalidate-provider-evidence.mts'

describe('rejectMembershipProviderEvidence', () => {
  it('rejects verified evidence whose source has never been projected', async () => {
    const member = await createTestUser()
    const sku = await createTestSku({
      plan: 'plus',
      provider_application_id: `unprojected-evidence-${randomUUID()}`,
    })
    const observation = await createTestUnprojectedStripeProductionProviderObservation({
      applicationId: sku.provider_application_id,
      membershipProductId: sku.id,
      membershipProviderProductId: sku.membership_provider_product_id,
      userId: member.id,
    })

    await expect(
      rejectMembershipProviderEvidence(
        observation.membership_provider_evidence_id,
        'Verified evidence was rejected before projection',
      ),
    ).resolves.toEqual({ invalidated: true, membershipId: null })
    await expect(getMembershipByUserId(member.id)).resolves.toBeNull()
    await expect(
      rejectMembershipProviderEvidence(
        observation.membership_provider_evidence_id,
        'A terminal rejection cannot be replayed',
      ),
    ).resolves.toEqual({ invalidated: false, membershipId: null })
  })

  it('retires rejected direct access, audits it, and restores verified family access', async () => {
    const member = await createTestUser()
    const familySku = await createTestSku({
      plan: 'plus',
      provider_application_id: `evidence-family-${randomUUID()}`,
    })
    await createTestFamilyMembership({
      applicationId: familySku.provider_application_id,
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
      membershipProductId: familySku.id,
      membershipProviderProductId: familySku.membership_provider_product_id,
      userId: member.id,
    })
    const directSku = await createTestSku({
      plan: 'pro',
      provider_application_id: `evidence-direct-${randomUUID()}`,
    })
    const direct = await createMembership({
      userId: member.id,
      plan: 'pro',
      skuId: directSku.id,
      stripeSubscriptionId: `sub_evidence_${randomUUID()}`,
      providerApplicationId: directSku.provider_application_id,
    })
    const observation = await attachTestStripeProductionProviderObservation({
      membership_id: direct.id,
      membership_provider_product_id: directSku.membership_provider_product_id,
    })

    await expect(
      rejectMembershipProviderEvidence(
        observation.membership_provider_evidence_id,
        'Stripe rejected the verified entitlement evidence',
      ),
    ).resolves.toEqual({ invalidated: true, membershipId: direct.id })

    await expect(getTestMembershipRaw(direct.id)).resolves.toMatchObject({
      cancelled_at: expect.any(Date),
      projection_ended_at: expect.any(Date),
      source_cancelled_at: expect.any(Date),
    })
    await expect(getMembershipByUserId(member.id)).resolves.toMatchObject({
      plan: 'plus',
      status: 'active',
    })
    const history = await getMembershipHistory(member.id)
    const cancellation = history.find(
      change => change.membership_id === direct.id && change.change_type === 'cancellation',
    )
    expect(cancellation).toMatchObject({
      from_sku_id: directSku.id,
      membership_provider_evidence_id: observation.membership_provider_evidence_id,
      note: 'Stripe rejected the verified entitlement evidence',
      to_sku_id: directSku.id,
    })
    await expect(getTestMembershipEntitlementEffects(cancellation!.id)).resolves.toEqual([
      expect.objectContaining({ membership_change_id: cancellation!.id, user_id: member.id }),
    ])
  })

  it('audits rejection when the accepted change already owns the evidence link', async () => {
    const member = await createTestUser()
    const sku = await createTestSku({
      plan: 'plus',
      provider_application_id: `accepted-evidence-${randomUUID()}`,
    })
    const direct = await createMembership({
      userId: member.id,
      plan: 'plus',
      skuId: sku.id,
      stripeSubscriptionId: `sub_accepted_evidence_${randomUUID()}`,
      providerApplicationId: sku.provider_application_id,
    })
    const observation = await attachTestStripeProductionProviderObservation({
      membership_id: direct.id,
      membership_provider_product_id: sku.membership_provider_product_id,
    })
    await recordMembershipChange({
      membershipId: direct.id,
      userId: member.id,
      changeType: 'renewal',
      fromSkuId: sku.id,
      toSkuId: sku.id,
      membershipProviderEvidenceId: observation.membership_provider_evidence_id,
    })

    await expect(
      rejectMembershipProviderEvidence(
        observation.membership_provider_evidence_id,
        'Previously accepted evidence was rejected',
      ),
    ).resolves.toEqual({ invalidated: true, membershipId: direct.id })

    const history = await getMembershipHistory(member.id)
    expect(
      history.filter(
        change =>
          change.membership_provider_evidence_id === observation.membership_provider_evidence_id,
      ),
    ).toHaveLength(1)
    expect(
      history.find(
        change => change.membership_id === direct.id && change.change_type === 'cancellation',
      ),
    ).toMatchObject({
      membership_provider_evidence_id: null,
      note: 'Previously accepted evidence was rejected',
    })
  })

  it('is idempotent after the evidence lifecycle becomes terminal', async () => {
    const member = await createTestUser()
    const sku = await createTestSku({
      plan: 'plus',
      provider_application_id: `evidence-idempotency-${randomUUID()}`,
    })
    const direct = await createMembership({
      userId: member.id,
      plan: 'plus',
      skuId: sku.id,
      stripeSubscriptionId: `sub_evidence_${randomUUID()}`,
      providerApplicationId: sku.provider_application_id,
    })
    const observation = await attachTestStripeProductionProviderObservation({
      membership_id: direct.id,
      membership_provider_product_id: sku.membership_provider_product_id,
    })

    await rejectMembershipProviderEvidence(
      observation.membership_provider_evidence_id,
      'First rejection wins',
    )
    await expect(
      rejectMembershipProviderEvidence(
        observation.membership_provider_evidence_id,
        'Replay cannot replace the rejection reason',
      ),
    ).resolves.toEqual({ invalidated: false, membershipId: null })

    const history = await getMembershipHistory(member.id)
    const cancellations = history.filter(
      change => change.membership_id === direct.id && change.change_type === 'cancellation',
    )
    expect(cancellations).toHaveLength(1)
    await expect(getTestMembershipEntitlementEffects(cancellations[0]!.id)).resolves.toHaveLength(1)
  })

  it('rejects future-effective direct evidence without violating lifecycle timestamps', async () => {
    const member = await createTestUser()
    const sku = await createTestSku({
      plan: 'plus',
      provider_application_id: `future-evidence-${randomUUID()}`,
    })
    const effectiveAt = new Date('2030-01-01T00:00:00.000Z')
    const direct = await createMembership({
      userId: member.id,
      plan: 'plus',
      skuId: sku.id,
      effectiveAt,
      expiresAt: new Date('2031-01-01T00:00:00.000Z'),
      stripeSubscriptionId: `sub_evidence_${randomUUID()}`,
      providerApplicationId: sku.provider_application_id,
    })
    const observation = await attachTestStripeProductionProviderObservation({
      membership_id: direct.id,
      membership_provider_product_id: sku.membership_provider_product_id,
    })

    await expect(
      rejectMembershipProviderEvidence(
        observation.membership_provider_evidence_id,
        'Future provider evidence was rejected before access began',
      ),
    ).resolves.toEqual({ invalidated: true, membershipId: direct.id })

    const membership = await getTestMembershipRaw(direct.id)
    const source = await getTestMembershipSourceState(direct.id)
    expect(membership?.cancelled_at).toBeInstanceOf(Date)
    expect(source).toMatchObject({
      cancelled_at: membership?.cancelled_at,
      effective_at: membership?.cancelled_at,
    })
  })

  it('does not restore a rejected family fallback', async () => {
    const member = await createTestUser()
    const familySku = await createTestSku({
      plan: 'plus',
      provider_application_id: `evidence-rejected-family-${randomUUID()}`,
    })
    const family = await createTestFamilyMembership({
      applicationId: familySku.provider_application_id,
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
      membershipProductId: familySku.id,
      membershipProviderProductId: familySku.membership_provider_product_id,
      userId: member.id,
    })
    await rejectTestMembershipProviderEvidence(family.id)
    const directSku = await createTestSku({
      plan: 'pro',
      provider_application_id: `evidence-no-fallback-${randomUUID()}`,
    })
    const direct = await createMembership({
      userId: member.id,
      plan: 'pro',
      skuId: directSku.id,
      stripeSubscriptionId: `sub_evidence_${randomUUID()}`,
      providerApplicationId: directSku.provider_application_id,
    })
    const observation = await attachTestStripeProductionProviderObservation({
      membership_id: direct.id,
      membership_provider_product_id: directSku.membership_provider_product_id,
    })

    await rejectMembershipProviderEvidence(
      observation.membership_provider_evidence_id,
      'Direct evidence rejected without valid fallback',
    )

    await expect(getMembershipByUserId(member.id)).resolves.toBeNull()
  })
})
