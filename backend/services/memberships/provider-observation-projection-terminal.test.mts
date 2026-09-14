import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createTestNativeMembershipProviderProduct,
  createTestSku,
  createTestUnprojectedProviderObservation,
  createTestUser,
  getTestMembershipRaw,
} from '@voucha/test-helpers'
import { createMembership } from './create.mts'
import { getMembershipByUserId } from './get.mts'
import { projectVerifiedProviderMembershipObservation } from './provider-observation-projection.mts'

describe('terminal provider observations without an existing source projection', () => {
  it('retains unrelated current access when an expired Microsoft source is first observed', async () => {
    const user = await createTestUser()
    const currentSku = await createTestSku({ plan: 'plus' })
    const current = await createMembership({
      userId: user.id,
      plan: 'plus',
      skuId: currentSku.id,
      stripeSubscriptionId: `sub_current_${randomUUID()}`,
    })
    const microsoftSku = await createTestSku({ plan: 'pro' })
    const applicationId = `microsoft-terminal-${randomUUID()}`
    const providerProduct = await createTestNativeMembershipProviderProduct({
      membershipProductId: microsoftSku.id,
      provider: 'microsoft_store',
      environment: 'test',
      applicationId,
      providerProductId: `microsoft-product-${randomUUID()}`,
    })
    const terminalAt = new Date(Date.now() - 86_400_000)
    const observation = await createTestUnprojectedProviderObservation({
      applicationId,
      userId: user.id,
      provider: 'microsoft_store',
      membershipProductId: microsoftSku.id,
      membershipProviderProductId: providerProduct.id,
      sourceKind: 'direct',
      status: 'expired',
      effectiveAt: new Date(Date.now() - 2 * 86_400_000),
      expiresAt: terminalAt,
      terminalAt,
      providerOrder: 1,
      providerRevision: 'terminal-without-projection',
    })

    await expect(
      projectVerifiedProviderMembershipObservation({
        userId: user.id,
        membershipProviderObservationId: observation.membershipProviderObservationId,
        retainWhenDirectAdmissionRejected: true,
      }),
    ).resolves.toEqual({ membershipId: null, projected: false })
    await expect(getMembershipByUserId(user.id)).resolves.toMatchObject({ id: current.id })
    await expect(getTestMembershipRaw(current.id)).resolves.toMatchObject({
      projection_ended_at: null,
    })
  })
})
