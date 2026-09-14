import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  attachTestStripeProductionProviderObservation,
  createTestSku,
  createTestUser,
  getTestGrantQueue,
} from '@voucha/test-helpers'
import { createMembership, grantMembership } from '../../create.mts'
import { getStripeMembershipSourceIdentity } from '../../create-types.mts'
import { getMembershipByStripeSubscriptionId, getMembershipByUserId } from '../../get.mts'
import { updateMembershipFromEvent } from '../../update.mts'

describe('direct fallback priority', () => {
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
    const queued = await grantMembership(admin.id, member.id, 'plus', grantSku.id, 30)

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
      grant_ids: expect.arrayContaining([queued.grantId]),
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
    const grantSku = await createTestSku({ plan: 'pro' })
    const queued = await grantMembership(admin.id, member.id, 'pro', grantSku.id, 30)

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
      active_grant_ids: expect.arrayContaining([queued.grantId]),
      open_activation_count: 1,
    })
  })
})
