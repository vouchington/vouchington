import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createTestSku,
  createTestUser,
  getTestMembershipEntitlementEffects,
  getTestMembershipRaw,
  getTestMembershipSourceState,
} from '@voucha/test-helpers'
import { withCommittedPostgresTransactionForTest } from '@voucha/test-helpers/postgres-transaction'
import {
  createMembership,
  getMembershipByStripeSubscriptionId,
  getMembershipByUserId,
  getMembershipHistory,
  getRetainedDirectMembershipSourceByStripeIdentity,
  grantMembership,
  updateMembershipFromEvent,
} from '@services/memberships'
import {
  getStripeMembershipSourceIdentity,
  type StripeMembershipSourceIdentity,
} from '@services/memberships/create-types'
import type { AcceptedStripeMembershipObservation } from './accepted-observation.mts'
import { reconcileLockedStripeMembershipSource } from './reconcile-source.mts'
import type { StripeSubscriptionMembershipValues } from './subscription-values.mts'

function reconcileOwnedStripeSource(
  eventId: string,
  sourceIdentity: StripeMembershipSourceIdentity,
  values: StripeSubscriptionMembershipValues,
  acceptedObservation?: AcceptedStripeMembershipObservation,
) {
  return withCommittedPostgresTransactionForTest(query =>
    reconcileLockedStripeMembershipSource(
      eventId,
      sourceIdentity,
      values,
      query,
      new Date(),
      undefined,
      undefined,
      acceptedObservation,
    ),
  )
}

async function expectRetainedSourceWithoutDirectMembership(
  sourceIdentity: StripeMembershipSourceIdentity,
) {
  expect(await getMembershipByStripeSubscriptionId(sourceIdentity)).toBeNull()
  expect(await getRetainedDirectMembershipSourceByStripeIdentity(sourceIdentity)).not.toBeNull()
}

describe('reconcileStripeMembershipSource', () => {
  it('reactivates a terminal source through its original projection', async () => {
    const applicationId = `test-reconcile-source-terminal-${randomUUID()}`
    const member = await createTestUser()
    const sku = await createTestSku({ plan: 'pro', provider_application_id: applicationId })
    const subscriptionId = `sub_terminal_reconcile_${randomUUID()}`
    const terminalEventId = `evt_terminal_reconcile_${randomUUID()}`
    const reactivationEventId = `evt_terminal_reactivation_${randomUUID()}`
    const sourceIdentity = getStripeMembershipSourceIdentity({
      stripeSubscriptionId: subscriptionId,
      providerApplicationId: applicationId,
    })
    const terminal = await createMembership({
      userId: member.id,
      plan: 'pro',
      skuId: sku.id,
      stripeSubscriptionId: subscriptionId,
      stripeEventId: terminalEventId,
      providerApplicationId: applicationId,
    })
    const terminalMembership = await getMembershipByStripeSubscriptionId(sourceIdentity)
    if (!terminalMembership) throw new Error('Expected terminal Stripe membership')
    await updateMembershipFromEvent(
      { membershipId: terminal.id, status: 'cancelled' },
      async () => {},
    )
    await expect(getTestMembershipRaw(terminal.id)).resolves.toMatchObject({
      cancelled_at: expect.any(Date),
      source_cancelled_at: expect.any(Date),
    })

    await reconcileOwnedStripeSource(reactivationEventId, sourceIdentity, {
      status: 'active',
      plan: 'pro',
      skuId: sku.id,
      expiresAt: undefined,
      effectiveAt: undefined,
      currentPeriodStart: undefined,
      terminalEffectiveAt: undefined,
      cancelAtPeriodEnd: false,
    })

    await expect(getMembershipByStripeSubscriptionId(sourceIdentity)).resolves.toMatchObject({
      id: terminal.id,
      user_id: member.id,
      status: 'active',
      stripe_subscription_id: subscriptionId,
    })
    await expect(getTestMembershipRaw(terminal.id)).resolves.toMatchObject({
      id: terminal.id,
      cancelled_at: null,
      source_cancelled_at: null,
      projection_ended_at: null,
    })
    const changes = (await getMembershipHistory(member.id)).filter(change =>
      [terminalEventId, reactivationEventId].includes(change.stripe_event_id ?? ''),
    )
    expect(changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          membership_id: terminal.id,
          stripe_event_id: terminalEventId,
          change_type: 'renewal',
        }),
        expect.objectContaining({
          membership_id: terminal.id,
          stripe_event_id: reactivationEventId,
          change_type: 'reactivation',
        }),
      ]),
    )
    expect(changes).toHaveLength(2)
  })

  it('reactivates the retained direct projection on a new product', async () => {
    const applicationId = `test-reconcile-source-retained-product-${randomUUID()}`
    const admin = await createTestUser({ administrator: true })
    const member = await createTestUser()
    const originalSku = await createTestSku({
      plan: 'plus',
      provider_application_id: applicationId,
    })
    const replacementSku = await createTestSku({
      plan: 'pro',
      provider_application_id: applicationId,
    })
    const subscriptionId = `sub_retained_product_${randomUUID()}`
    const sourceIdentity = getStripeMembershipSourceIdentity({
      stripeSubscriptionId: subscriptionId,
      providerApplicationId: applicationId,
    })
    const retained = await createMembership({
      userId: member.id,
      plan: 'plus',
      skuId: originalSku.id,
      stripeSubscriptionId: subscriptionId,
      status: 'paused',
      providerApplicationId: applicationId,
    })
    const grantSku = await createTestSku({ plan: 'plus' })
    const grant = await grantMembership(admin.id, member.id, 'plus', grantSku.id, 30)

    const observedEffectiveAt = new Date('2020-01-01T00:00:00.000Z')
    const currentPeriodStart = new Date('2021-01-01T00:00:00.000Z')
    await expectRetainedSourceWithoutDirectMembership(sourceIdentity)
    await reconcileOwnedStripeSource(
      `evt_${randomUUID()}`,
      sourceIdentity,
      {
        status: 'active',
        plan: 'pro',
        skuId: replacementSku.id,
        expiresAt: undefined,
        effectiveAt: observedEffectiveAt,
        currentPeriodStart,
        terminalEffectiveAt: undefined,
        cancelAtPeriodEnd: false,
      },
      { effectiveAt: observedEffectiveAt, autoRenews: false },
    )

    await expect(getTestMembershipRaw(retained.id)).resolves.toMatchObject({
      id: retained.id,
      sku_id: replacementSku.id,
      effective_at: currentPeriodStart,
      should_cancel_at_period_end: true,
      projection_ended_at: null,
    })
    await expect(getTestMembershipSourceState(retained.id)).resolves.toMatchObject({
      effective_at: observedEffectiveAt,
      should_auto_renew: false,
    })
    await expect(getMembershipByUserId(member.id)).resolves.toMatchObject({
      id: retained.id,
      plan: 'pro',
      sku: { id: replacementSku.id },
      stripe_subscription_id: subscriptionId,
    })
    await expect(getTestMembershipRaw(grant.id)).resolves.toMatchObject({
      projection_ended_at: expect.any(Date),
    })
    await expect(getMembershipHistory(member.id)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          membership_id: retained.id,
          stripe_event_id: expect.stringMatching(/^evt_/),
        }),
      ]),
    )
  })

  it('reactivates a retained source when recovery reuses its terminal event ID', async () => {
    const applicationId = `test-reconcile-source-retained-replay-${randomUUID()}`
    const user = await createTestUser()
    const sku = await createTestSku({ plan: 'pro', provider_application_id: applicationId })
    const subscriptionId = `sub_retained_replay_${randomUUID()}`
    const eventId = `evt_retained_replay_${randomUUID()}`
    const sourceIdentity = getStripeMembershipSourceIdentity({
      stripeSubscriptionId: subscriptionId,
      providerApplicationId: applicationId,
    })
    const terminal = await createMembership({
      userId: user.id,
      plan: 'pro',
      skuId: sku.id,
      stripeSubscriptionId: subscriptionId,
      status: 'cancelled',
      stripeEventId: eventId,
      providerApplicationId: applicationId,
    })

    const activeValues = {
      status: 'active' as const,
      plan: 'pro' as const,
      skuId: sku.id,
      expiresAt: undefined,
      effectiveAt: undefined,
      currentPeriodStart: undefined,
      terminalEffectiveAt: undefined,
      cancelAtPeriodEnd: false,
    }
    await reconcileOwnedStripeSource(eventId, sourceIdentity, activeValues)

    const active = await getMembershipByStripeSubscriptionId(sourceIdentity)
    expect(active).toMatchObject({
      id: terminal.id,
      status: 'active',
    })
    if (!active) throw new Error('Expected active Stripe membership')
    await reconcileOwnedStripeSource(eventId, sourceIdentity, activeValues)

    const changes = await getMembershipHistory(user.id)
    const corrections = changes.filter(
      change => change.change_type === 'reactivation' && change.stripe_event_id === null,
    )
    expect(changes.filter(change => change.stripe_event_id === eventId)).toHaveLength(1)
    expect(corrections).toHaveLength(1)
    const correction = corrections[0]
    if (!correction) throw new Error('Expected unkeyed reactivation correction')
    await expect(getTestMembershipEntitlementEffects(correction.id)).resolves.toEqual([
      expect.objectContaining({ membership_change_id: correction.id, user_id: user.id }),
    ])
  })
})
