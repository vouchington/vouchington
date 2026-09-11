import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  attachTestStripeProductionProviderObservation,
  createTestFamilyMembership,
  createTestSku,
  createTestUser,
  getTestMembershipRaw,
  getTestMembershipSourceState,
} from '@voucha/test-helpers'
import { createMembership } from '../create.mts'
import { getMembershipByUserId, getMembershipHistory } from '../get.mts'
import { rejectMembershipProviderEvidence } from '../invalidate-provider-evidence.mts'

describe('rejectMembershipProviderEvidence superseded observations', () => {
  it('terminalizes the source when an older accepted observation is rejected', async () => {
    const member = await createTestUser()
    const familySku = await createTestSku({
      plan: 'plus',
      provider_application_id: `superseded-evidence-family-${randomUUID()}`,
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
      provider_application_id: `superseded-evidence-direct-${randomUUID()}`,
    })
    const direct = await createMembership({
      userId: member.id,
      plan: 'pro',
      skuId: directSku.id,
      stripeSubscriptionId: `sub_superseded_evidence_${randomUUID()}`,
      providerApplicationId: directSku.provider_application_id,
    })
    const olderObservation = await attachTestStripeProductionProviderObservation({
      membership_id: direct.id,
      membership_provider_product_id: directSku.membership_provider_product_id,
    })
    await attachTestStripeProductionProviderObservation({
      membership_id: direct.id,
      membership_provider_product_id: directSku.membership_provider_product_id,
    })

    await expect(
      rejectMembershipProviderEvidence(
        olderObservation.membership_provider_evidence_id,
        'An older accepted provider observation was rejected',
      ),
    ).resolves.toEqual({ invalidated: true, membershipId: direct.id })

    await expect(getTestMembershipRaw(direct.id)).resolves.toMatchObject({
      cancelled_at: expect.any(Date),
      projection_ended_at: expect.any(Date),
      source_cancelled_at: expect.any(Date),
    })
    await expect(getTestMembershipSourceState(direct.id)).resolves.toMatchObject({
      cancelled_at: expect.any(Date),
      auto_renews: false,
    })
    await expect(getMembershipByUserId(member.id)).resolves.toMatchObject({
      plan: 'plus',
      status: 'active',
    })
    await expect(getMembershipHistory(member.id)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          change_type: 'cancellation',
          membership_id: direct.id,
          membership_provider_evidence_id: olderObservation.membership_provider_evidence_id,
        }),
      ]),
    )
  })
})
