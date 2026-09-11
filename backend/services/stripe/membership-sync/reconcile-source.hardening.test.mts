import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createTestSku,
  createTestMembership,
  createTestUser,
  getTestGrantQueue,
  getTestMembershipGrant,
  getTestMembershipRaw,
} from '@voucha/test-helpers'
import {
  createMembership,
  getMembershipByStripeSubscriptionId,
  getMembershipByUserId,
  getMembershipHistory,
  grantMembership,
} from '@services/memberships'
import { getStripeMembershipSourceIdentity } from '@services/memberships/create-types'
import { reconcileStripeMembershipSource } from './reconcile-source.mts'

describe('reconcileStripeMembershipSource hardening', () => {
  it('restores only the oldest of two queued grants after a direct term ends', async () => {
    const applicationId = `test-reconcile-hardening-grant-queue-${randomUUID()}`
    const admin = await createTestUser({ administrator: true })
    const member = await createTestUser()
    const directSku = await createTestSku({ plan: 'pro', provider_application_id: applicationId })
    const grantSku = await createTestSku({ plan: 'plus' })
    const subscriptionId = `sub_terminal_grant_queue_${randomUUID()}`
    const sourceIdentity = getStripeMembershipSourceIdentity({
      stripeSubscriptionId: subscriptionId,
      providerApplicationId: applicationId,
    })
    const direct = await createMembership({
      userId: member.id,
      plan: 'pro',
      skuId: directSku.id,
      stripeSubscriptionId: subscriptionId,
      providerApplicationId: applicationId,
    })
    const firstGrant = await grantMembership(admin.id, member.id, 'plus', grantSku.id, 30)
    const secondGrant = await grantMembership(admin.id, member.id, 'plus', grantSku.id, 30)
    expect(firstGrant.queued).toBe(true)
    expect(secondGrant.queued).toBe(true)
    const directMembership = await getMembershipByStripeSubscriptionId(sourceIdentity)
    if (!directMembership) throw new Error('Expected active direct membership')

    await reconcileStripeMembershipSource(
      `evt_terminal_grant_queue_${randomUUID()}`,
      directMembership,
      sourceIdentity,
      {
        status: 'cancelled',
        plan: 'pro',
        skuId: directSku.id,
        expiresAt: undefined,
        effectiveAt: undefined,
        currentPeriodStart: undefined,
        terminalEffectiveAt: undefined,
        cancelAtPeriodEnd: false,
      },
    )

    await expect(getMembershipByUserId(member.id)).resolves.toMatchObject({
      plan: 'plus',
      status: 'active',
    })
    await expect(getTestMembershipRaw(direct.id)).resolves.toMatchObject({
      cancelled_at: expect.any(Date),
      source_cancelled_at: expect.any(Date),
    })
    await expect(getTestGrantQueue(member.id)).resolves.toMatchObject({
      grant_ids: expect.arrayContaining([firstGrant.grantId, secondGrant.grantId]),
      active_grant_ids: [firstGrant.grantId],
      open_activation_count: 1,
    })
    await expect(getTestMembershipGrant(firstGrant.grantId)).resolves.toMatchObject({
      activation_started_at: expect.any(Date),
      activation_ended_at: null,
    })
    await expect(getTestMembershipGrant(secondGrant.grantId)).resolves.toMatchObject({
      activation_started_at: null,
      activation_ended_at: null,
    })
  })

  it.each(['plus', 'pro'] as const)(
    'keeps a retained paused source non-entitling below an active %s grant',
    async grantPlan => {
      const applicationId = `test-reconcile-hardening-retained-${grantPlan}-${randomUUID()}`
      const admin = await createTestUser({ administrator: true })
      const member = await createTestUser()
      const directSku = await createTestSku({
        plan: 'plus',
        provider_application_id: applicationId,
      })
      const grantSku = await createTestSku({ plan: grantPlan })
      const subscriptionId = `sub_retained_${grantPlan}_grant_${randomUUID()}`
      const sourceIdentity = getStripeMembershipSourceIdentity({
        stripeSubscriptionId: subscriptionId,
        providerApplicationId: applicationId,
      })
      const retained = await createMembership({
        userId: member.id,
        plan: 'plus',
        skuId: directSku.id,
        status: 'paused',
        stripeSubscriptionId: subscriptionId,
        providerApplicationId: applicationId,
      })
      const grant = await grantMembership(admin.id, member.id, grantPlan, grantSku.id, 30)
      const retainedBeforeUpdate = await getTestMembershipRaw(retained.id)
      const historyBeforeUpdate = await getMembershipHistory(member.id)

      await expect(
        reconcileStripeMembershipSource(
          `evt_retained_${grantPlan}_grant_${randomUUID()}`,
          null,
          sourceIdentity,
          {
            status: 'active',
            plan: 'plus',
            skuId: directSku.id,
            expiresAt: undefined,
            effectiveAt: undefined,
            currentPeriodStart: undefined,
            terminalEffectiveAt: undefined,
            cancelAtPeriodEnd: false,
          },
        ),
      ).resolves.toBeNull()

      await expect(getMembershipByUserId(member.id)).resolves.toMatchObject({
        id: grant.id,
        plan: grantPlan,
        status: 'active',
      })
      await expect(getTestMembershipRaw(retained.id)).resolves.toEqual(retainedBeforeUpdate)
      await expect(getTestMembershipRaw(retained.id)).resolves.toMatchObject({
        status: 'paused',
        source_paused_at: expect.any(Date),
        projection_ended_at: expect.any(Date),
      })
      await expect(getMembershipHistory(member.id)).resolves.toEqual(historyBeforeUpdate)
    },
  )

  it('keeps a competing direct source when a retained source becomes active', async () => {
    const applicationId = `test-reconcile-hardening-competing-${randomUUID()}`
    const member = await createTestUser()
    const retainedSku = await createTestSku({ plan: 'pro', provider_application_id: applicationId })
    const currentSku = await createTestSku({ plan: 'plus', provider_application_id: applicationId })
    const retainedSubscriptionId = `sub_retained_competing_${randomUUID()}`
    const sourceIdentity = getStripeMembershipSourceIdentity({
      stripeSubscriptionId: retainedSubscriptionId,
      providerApplicationId: applicationId,
    })
    await createTestMembership({
      user_id: member.id,
      plan: 'pro',
      sku_id: retainedSku.id,
      status: 'paused',
      stripe_subscription_id: retainedSubscriptionId,
      provider_environment: sourceIdentity.environment,
      provider_application_id: sourceIdentity.applicationId,
    })
    const current = await createTestMembership({
      user_id: member.id,
      plan: 'plus',
      sku_id: currentSku.id,
      stripe_subscription_id: `sub_current_competing_${randomUUID()}`,
      provider_environment: 'production',
      provider_application_id: applicationId,
    })
    const historyBeforeUpdate = await getMembershipHistory(member.id)

    await expect(
      reconcileStripeMembershipSource(`evt_competing_${randomUUID()}`, null, sourceIdentity, {
        status: 'active',
        plan: 'pro',
        skuId: retainedSku.id,
        expiresAt: undefined,
        effectiveAt: undefined,
        currentPeriodStart: undefined,
        terminalEffectiveAt: undefined,
        cancelAtPeriodEnd: false,
      }),
    ).resolves.toBeNull()

    await expect(getMembershipByUserId(member.id)).resolves.toMatchObject({
      id: current.id,
      stripe_subscription_id: current.stripe_subscription_id,
    })
    await expect(getMembershipHistory(member.id)).resolves.toEqual(historyBeforeUpdate)
  })
})
