import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createTestNativeMembershipProviderProduct,
  createTestSku,
  createTestUnprojectedProviderObservation,
  createTestUser,
  getTestMembershipRaw,
  getTestMembershipSourceState,
} from '@voucha/test-helpers'
import { createMembership } from './create.mts'
import { getMembershipByUserId } from './get.mts'
import { projectVerifiedProviderMembershipObservation } from './provider-observation-projection.mts'

describe('provider observation projection', () => {
  it('projects a verified direct provider observation and records it on the source state', async () => {
    const user = await createTestUser()
    const fixture = await createAppleObservationFixture(user.id, 'plus', 'direct')

    const result = await projectVerifiedProviderMembershipObservation({
      userId: user.id,
      membershipProviderObservationId: fixture.observation.membershipProviderObservationId,
      sourceIdentity: fixture.observation.sourceIdentity,
    })

    expect(result).toMatchObject({ projected: true, membershipId: expect.any(String) })
    await expect(getTestMembershipRaw(result.membershipId!)).resolves.toMatchObject({
      plan: 'plus',
      projection_ended_at: null,
    })
    await expect(getTestMembershipSourceState(result.membershipId!)).resolves.toMatchObject({
      membership_provider_observation_id: fixture.observation.membershipProviderObservationId,
    })
  })

  it('keeps the newest provider observation state and ignores older and duplicate observations', async () => {
    const user = await createTestUser()
    const effectiveAt = new Date(Date.now() - 2 * 86_400_000)
    const fixture = await createAppleObservationFixture(user.id, 'plus', 'direct', {
      effectiveAt,
      providerOrder: 1,
      providerRevision: 'stream',
    })
    const first = await projectVerifiedProviderMembershipObservation({
      userId: user.id,
      membershipProviderObservationId: fixture.observation.membershipProviderObservationId,
    })
    const terminalAt = new Date(Date.now() - 86_400_000)
    const newer = await createTestUnprojectedProviderObservation({
      ...fixture.observation.sourceIdentity,
      userId: user.id,
      membershipProductId: fixture.sku.id,
      membershipProviderProductId: fixture.providerProduct.id,
      sourceKind: 'direct',
      status: 'expired',
      effectiveAt,
      expiresAt: terminalAt,
      terminalAt,
      providerOrder: 2,
      providerRevision: 'stream',
    })
    await projectVerifiedProviderMembershipObservation({
      userId: user.id,
      membershipProviderObservationId: newer.membershipProviderObservationId,
    })
    const afterNewer = await getTestMembershipRaw(first.membershipId!)

    const older = await createTestUnprojectedProviderObservation({
      ...fixture.observation.sourceIdentity,
      userId: user.id,
      membershipProductId: fixture.sku.id,
      membershipProviderProductId: fixture.providerProduct.id,
      sourceKind: 'direct',
      effectiveAt,
      providerOrder: 0,
      providerRevision: 'stream',
    })
    await expect(
      projectVerifiedProviderMembershipObservation({
        userId: user.id,
        membershipProviderObservationId: older.membershipProviderObservationId,
      }),
    ).resolves.toEqual({ membershipId: null, projected: false })
    await expect(
      projectVerifiedProviderMembershipObservation({
        userId: user.id,
        membershipProviderObservationId: newer.membershipProviderObservationId,
      }),
    ).resolves.toEqual({ membershipId: null, projected: false })

    await expect(getTestMembershipSourceState(first.membershipId!)).resolves.toMatchObject({
      membership_provider_observation_id: newer.membershipProviderObservationId,
      expired_at: terminalAt,
    })
    await expect(getTestMembershipRaw(first.membershipId!)).resolves.toMatchObject({
      latest_change_id: afterNewer!.latest_change_id,
      status: 'expired',
    })
  })

  it('advances a family source state independently of a newer direct source state on its lineage', async () => {
    const user = await createTestUser()
    const fixture = await createAppleObservationFixture(user.id, 'plus', 'direct', {
      providerOrder: 10,
      providerRevision: 'stream',
    })
    await projectVerifiedProviderMembershipObservation({
      userId: user.id,
      membershipProviderObservationId: fixture.observation.membershipProviderObservationId,
    })
    const familySku = await createTestSku({ plan: 'pro' })
    const familyProviderProduct = await createTestNativeMembershipProviderProduct({
      membershipProductId: familySku.id,
      provider: 'apple_app_store',
      environment: 'test',
      applicationId: fixture.observation.sourceIdentity.applicationId,
      providerProductId: `apple-family-product-${randomUUID()}`,
    })
    const family = await createTestUnprojectedProviderObservation({
      ...fixture.observation.sourceIdentity,
      userId: user.id,
      membershipProductId: familySku.id,
      membershipProviderProductId: familyProviderProduct.id,
      sourceKind: 'family',
      providerOrder: 1,
      providerRevision: 'stream',
    })

    const result = await projectVerifiedProviderMembershipObservation({
      userId: user.id,
      membershipProviderObservationId: family.membershipProviderObservationId,
    })

    expect(result).toMatchObject({ membershipId: expect.any(String), projected: true })
    await expect(getTestMembershipSourceState(result.membershipId!)).resolves.toMatchObject({
      membership_provider_observation_id: family.membershipProviderObservationId,
    })
  })

  it('retains a same-tier family observation without displacing direct access', async () => {
    const user = await createTestUser()
    const directSku = await createTestSku({ plan: 'plus' })
    const direct = await createMembership({
      userId: user.id,
      plan: 'plus',
      skuId: directSku.id,
      stripeSubscriptionId: `sub_family_retention_${randomUUID()}`,
    })
    const fixture = await createAppleObservationFixture(user.id, 'plus', 'family')

    await expect(
      projectVerifiedProviderMembershipObservation({
        userId: user.id,
        membershipProviderObservationId: fixture.observation.membershipProviderObservationId,
      }),
    ).resolves.toEqual({ membershipId: null, projected: false })
    await expect(getTestMembershipRaw(direct.id)).resolves.toMatchObject({
      id: direct.id,
      projection_ended_at: null,
    })
  })

  it('projects a higher-tier family observation over lower-tier direct access', async () => {
    const user = await createTestUser()
    const directSku = await createTestSku({ plan: 'plus' })
    const direct = await createMembership({
      userId: user.id,
      plan: 'plus',
      skuId: directSku.id,
      stripeSubscriptionId: `sub_family_upgrade_${randomUUID()}`,
    })
    const fixture = await createAppleObservationFixture(user.id, 'pro', 'family')

    const result = await projectVerifiedProviderMembershipObservation({
      userId: user.id,
      membershipProviderObservationId: fixture.observation.membershipProviderObservationId,
    })

    expect(result).toMatchObject({ projected: true, membershipId: expect.any(String) })
    await expect(getTestMembershipRaw(direct.id)).resolves.toMatchObject({
      projection_ended_at: expect.any(Date),
    })
    await expect(getTestMembershipRaw(result.membershipId!)).resolves.toMatchObject({
      plan: 'pro',
      projection_ended_at: null,
    })
  })

  it('restores the retained grant after a direct provider observation expires', async () => {
    const user = await createTestUser()
    const grantSku = await createTestSku({ plan: 'plus' })
    await createMembership({ userId: user.id, plan: 'plus', skuId: grantSku.id, durationDays: 30 })
    const effectiveAt = new Date(Date.now() - 2 * 86_400_000)
    const fixture = await createAppleObservationFixture(user.id, 'pro', 'direct', { effectiveAt })
    const active = await projectVerifiedProviderMembershipObservation({
      userId: user.id,
      membershipProviderObservationId: fixture.observation.membershipProviderObservationId,
    })
    const expiredAt = new Date(Date.now() - 86_400_000)
    const expired = await createTestUnprojectedProviderObservation({
      ...fixture.observation.sourceIdentity,
      userId: user.id,
      membershipProductId: fixture.sku.id,
      membershipProviderProductId: fixture.providerProduct.id,
      sourceKind: 'direct',
      status: 'expired',
      effectiveAt,
      expiresAt: expiredAt,
      terminalAt: expiredAt,
      providerOrder: 1,
    })

    await projectVerifiedProviderMembershipObservation({
      userId: user.id,
      membershipProviderObservationId: expired.membershipProviderObservationId,
    })

    await expect(getTestMembershipRaw(active.membershipId!)).resolves.toMatchObject({
      expired_at: expect.any(Date),
      projection_ended_at: expect.any(Date),
    })
    await expect(getMembershipByUserId(user.id)).resolves.toMatchObject({ plan: 'plus' })
  })
})

async function createAppleObservationFixture(
  userId: string,
  plan: 'plus' | 'pro',
  sourceKind: 'direct' | 'family',
  options: { effectiveAt?: Date; providerOrder?: number; providerRevision?: string } = {},
) {
  const applicationId = `com.voucha.provider-projection.${randomUUID()}`
  const sku = await createTestSku({ plan })
  const providerProduct = await createTestNativeMembershipProviderProduct({
    membershipProductId: sku.id,
    provider: 'apple_app_store',
    environment: 'test',
    applicationId,
    providerProductId: `apple-product-${randomUUID()}`,
  })
  const observation = await createTestUnprojectedProviderObservation({
    applicationId,
    effectiveAt: options.effectiveAt,
    membershipProductId: sku.id,
    membershipProviderProductId: providerProduct.id,
    provider: 'apple_app_store',
    providerOrder: options.providerOrder,
    providerRevision: options.providerRevision,
    sourceKind,
    userId,
  })
  return { observation, providerProduct, sku }
}
