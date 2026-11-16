import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  attachTestStripeProductionProviderObservation,
  beginTransaction,
  createTestMembership,
  createTestSku,
  createTestUser,
  getTestGrantQueue,
  insertQueuedMembershipGrant,
} from '@voucha/test-helpers'
import { setTestMembershipSourceEffectiveAt } from '../../../../test-helpers/membership-source-effective-at.mts'
import { selectHighestPriorityMembershipSource } from '../../fallback/select-highest-priority-source.mts'
import { selectDirectTerminationReplacement } from '../select-direct-termination-replacement.mts'
import { createMembership } from '../../create.mts'
import { getStripeMembershipSourceIdentity } from '../../create-types.mts'
import { getMembershipByStripeSubscriptionId, getMembershipByUserId } from '../../get.mts'
import { updateMembershipFromEvent } from '../../update.mts'

describe('direct fallback priority', () => {
  it('preserves the source ID tie-break within one JavaScript millisecond', async () => {
    const member = await createTestUser()
    const sku = await createTestSku({ plan: 'plus' })
    const first = await createTestMembership({
      user_id: member.id,
      provider_environment: 'production',
      sku_id: sku.id,
      stripe_subscription_id: `sub_first_${randomUUID()}`,
      provider_application_id: sku.provider_application_id,
    })
    await attachTestStripeProductionProviderObservation({
      membership_id: first.id,
      membership_provider_product_id: sku.membership_provider_product_id,
      status: 'active',
    })
    const second = await createTestMembership({
      user_id: member.id,
      provider_environment: 'production',
      sku_id: sku.id,
      stripe_subscription_id: `sub_second_${randomUUID()}`,
      provider_application_id: sku.provider_application_id,
    })
    await attachTestStripeProductionProviderObservation({
      membership_id: second.id,
      membership_provider_product_id: sku.membership_provider_product_id,
      status: 'active',
    })
    const [lower, higher] = [first, second].toSorted((a, b) =>
      a.membership_source_id.localeCompare(b.membership_source_id),
    )
    const lowerAt = await setTestMembershipSourceEffectiveAt(
      lower!.membership_source_id,
      '2025-01-01T00:00:00.000900Z',
    )
    const higherAt = await setTestMembershipSourceEffectiveAt(
      higher!.membership_source_id,
      '2025-01-01T00:00:00.000100Z',
    )
    const expected = selectHighestPriorityMembershipSource([
      {
        membership_source_id: lower!.membership_source_id,
        effective_at: lowerAt,
        plan: 'plus',
        source_kind: 'direct',
      },
      {
        membership_source_id: higher!.membership_source_id,
        effective_at: higherAt,
        plan: 'plus',
        source_kind: 'direct',
      },
    ])
    expect(lowerAt.getTime()).toBe(higherAt.getTime())
    expect(expected?.membership_source_id).toBe(higher!.membership_source_id)
    await using query = await beginTransaction()
    const replacement = await selectDirectTerminationReplacement(member.id, randomUUID(), query)
    expect(replacement?.membership_source_id).toBe(expected?.membership_source_id)
  })

  it('restores a retained direct source when its plan ties the queued grant', async () => {
    const admin = await createTestUser({ administrator: true })
    const member = await createTestUser()
    const retainedSku = await createTestSku({ plan: 'plus' })
    const retainedSubscriptionId = `sub_retained_${randomUUID()}`
    const retained = await createMembership({
      userId: member.id,
      plan: 'plus',
      skuId: retainedSku.id,
      status: 'cancelled',
      stripeSubscriptionId: retainedSubscriptionId,
      providerApplicationId: retainedSku.provider_application_id,
    })
    const currentSku = await createTestSku({ plan: 'pro', interval: 'yearly' })
    const current = await createMembership({
      userId: member.id,
      plan: 'pro',
      skuId: currentSku.id,
      stripeSubscriptionId: `sub_current_${randomUUID()}`,
      providerApplicationId: currentSku.provider_application_id,
    })
    await attachTestStripeProductionProviderObservation({
      membership_id: retained.id,
      membership_provider_product_id: retainedSku.membership_provider_product_id,
      status: 'active',
    })
    const grantSku = await createTestSku({ plan: 'plus' })
    // Committed fixtures: the SERIALIZABLE grant writer is only setup here, and parallel tests'
    // predicate locks can abort it with 40001. Writer coverage lives in create.test.mts.
    const queuedGrantId = await insertQueuedMembershipGrant({
      grantedById: admin.id,
      productId: grantSku.id,
      userId: member.id,
      durationDays: 30,
    })

    await updateMembershipFromEvent(
      { membershipId: current.id, status: 'cancelled', terminalEffectiveAt: new Date() },
      async () => false,
    )

    const restored = await getMembershipByUserId(member.id)
    expect(restored).toMatchObject({ plan: 'plus', status: 'active' })
    expect(restored?.id).not.toBe(retained.id)
    await expect(
      getMembershipByStripeSubscriptionId(
        getStripeMembershipSourceIdentity({
          stripeSubscriptionId: retainedSubscriptionId,
          providerApplicationId: retainedSku.provider_application_id,
        }),
      ),
    ).resolves.toMatchObject({ id: restored!.id })
    await expect(getTestGrantQueue(member.id)).resolves.toMatchObject({
      grant_ids: expect.arrayContaining([queuedGrantId]),
      open_activation_count: 0,
    })
  })

  it('activates a higher-tier queued grant before restoring retained direct access', async () => {
    const admin = await createTestUser({ administrator: true })
    const member = await createTestUser()
    const retainedSku = await createTestSku({ plan: 'plus' })
    const retained = await createMembership({
      userId: member.id,
      plan: 'plus',
      skuId: retainedSku.id,
      status: 'cancelled',
      stripeSubscriptionId: `sub_retained_higher_grant_${randomUUID()}`,
      providerApplicationId: retainedSku.provider_application_id,
    })
    await attachTestStripeProductionProviderObservation({
      membership_id: retained.id,
      membership_provider_product_id: retainedSku.membership_provider_product_id,
      status: 'active',
    })
    const currentSku = await createTestSku({ plan: 'pro', interval: 'yearly' })
    const current = await createMembership({
      userId: member.id,
      plan: 'pro',
      skuId: currentSku.id,
      stripeSubscriptionId: `sub_current_higher_grant_${randomUUID()}`,
      providerApplicationId: currentSku.provider_application_id,
    })
    const lowerSku = await createTestSku({ plan: 'plus' })
    await insertQueuedMembershipGrant({
      grantedById: admin.id,
      productId: lowerSku.id,
      userId: member.id,
      durationDays: 30,
    })
    const grantSku = await createTestSku({ plan: 'pro' })
    const queuedGrantId = await insertQueuedMembershipGrant({
      grantedById: admin.id,
      productId: grantSku.id,
      userId: member.id,
      durationDays: 30,
    })
    const laterGrantId = await insertQueuedMembershipGrant({
      grantedById: admin.id,
      productId: grantSku.id,
      userId: member.id,
      durationDays: 30,
    })

    await updateMembershipFromEvent(
      { membershipId: current.id, status: 'cancelled', terminalEffectiveAt: new Date() },
      async () => false,
    )

    await expect(getMembershipByUserId(member.id)).resolves.toMatchObject({
      granted_by_id: admin.id,
      plan: 'pro',
      status: 'active',
    })
    await expect(getTestGrantQueue(member.id)).resolves.toMatchObject({
      active_grant_ids: [queuedGrantId],
      grant_ids: expect.arrayContaining([laterGrantId]),
      open_activation_count: 1,
    })
  })
})
