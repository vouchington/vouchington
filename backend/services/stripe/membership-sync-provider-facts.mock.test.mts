import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import type Stripe from 'stripe'
import {
  createTestSku,
  createTestUser,
  getTestMembershipProviderEvidenceId,
  getTestMembershipSourceState,
  setStripeEventReceivedAtForTest,
} from '@voucha/test-helpers'
import {
  createMembership,
  getMembershipByStripeSubscriptionId,
  rejectMembershipProviderEvidence,
} from '@services/memberships'
import {
  getStripeMembershipSourceIdentity,
  type StripeMembershipApplicationContext,
} from '@services/memberships/create-types'
import { getStripeEventByStripeEventId, insertStripeEvent } from './events.mts'
vi.mock<typeof import('@modules/stripe/subscriptions')>(
  import('@modules/stripe/subscriptions'),
  async importOriginal => ({
    ...(await importOriginal()),
    getStripeSubscription: vi.fn<VitestLooseMock>(),
  }),
)
import { getStripeSubscription } from '@modules/stripe/subscriptions'
import { syncMembershipFromStripeSubscription } from './membership-sync.mts'
const mockGetStripeSubscription = vi.mocked(getStripeSubscription)
const applicationContext: StripeMembershipApplicationContext = {
  applicationId: `stripe-provider-facts-${randomUUID()}`,
}
describe('Stripe membership sync provider facts', () => {
  it('rejects existing-source sync without a durable EventBridge receipt', async () => {
    const user = await createTestUser()
    const sku = await createTestSku({
      plan: 'pro',
      provider_application_id: applicationContext.applicationId,
    })
    const subscriptionId = `sub_missing_receipt_${randomUUID()}`
    await createMembership({
      userId: user.id,
      plan: 'pro',
      skuId: sku.id,
      stripeSubscriptionId: subscriptionId,
      stripeCustomerId: `cus_missing_receipt_${randomUUID()}`,
      providerApplicationId: applicationContext.applicationId,
    })
    mockGetStripeSubscription.mockResolvedValue(
      makeSubscription(subscriptionId, sku.stripe_price_id),
    )

    await expect(
      syncMembershipFromStripeSubscription(
        `evt_missing_receipt_${randomUUID()}`,
        subscriptionId,
        applicationContext,
      ),
    ).rejects.toThrow('was not durably ingested')
  })

  it('records authoritative facts when a retained source is reactivated', async () => {
    const user = await createTestUser()
    const sku = await createTestSku({
      plan: 'pro',
      provider_application_id: applicationContext.applicationId,
    })
    const subscriptionId = `sub_retained_facts_${randomUUID()}`
    await createMembership({
      userId: user.id,
      plan: 'pro',
      skuId: sku.id,
      status: 'cancelled',
      stripeSubscriptionId: subscriptionId,
      stripeCustomerId: `cus_retained_facts_${randomUUID()}`,
      providerApplicationId: applicationContext.applicationId,
    })
    const event = makeStripeEvent(`evt_retained_facts_${randomUUID()}`, subscriptionId)
    await insertStripeEvent(event)
    mockGetStripeSubscription.mockResolvedValue(
      makeSubscription(subscriptionId, sku.stripe_price_id),
    )

    await syncMembershipFromStripeSubscription(event.id, subscriptionId, applicationContext)

    const membership = await getMembershipByStripeSubscriptionId(
      getStripeMembershipSourceIdentity({
        stripeSubscriptionId: subscriptionId,
        providerApplicationId: applicationContext.applicationId,
      }),
    )
    expect(membership).not.toBeNull()
    await expect(getTestMembershipSourceState(membership!.id)).resolves.toMatchObject({
      membership_provider_observation_id: expect.stringMatching(/^[0-9a-f-]{36}$/),
    })
  })

  it('does not let a stale active Stripe event reactivate a terminal projection', async () => {
    const user = await createTestUser()
    const sku = await createTestSku({
      plan: 'pro',
      provider_application_id: applicationContext.applicationId,
    })
    const subscriptionId = `sub_stale_projection_${randomUUID()}`
    await createMembership({
      userId: user.id,
      plan: 'pro',
      skuId: sku.id,
      stripeSubscriptionId: subscriptionId,
      stripeCustomerId: `cus_stale_projection_${randomUUID()}`,
      providerApplicationId: applicationContext.applicationId,
    })
    const terminalEvent = makeStripeEvent(
      `evt_terminal_projection_${randomUUID()}`,
      subscriptionId,
      200,
    )
    const staleEvent = makeStripeEvent(`evt_stale_projection_${randomUUID()}`, subscriptionId, 100)
    await Promise.all([insertStripeEvent(terminalEvent), insertStripeEvent(staleEvent)])
    mockGetStripeSubscription
      .mockResolvedValueOnce(makeSubscription(subscriptionId, sku.stripe_price_id, 'canceled'))
      .mockResolvedValueOnce(makeSubscription(subscriptionId, sku.stripe_price_id, 'active'))

    await syncMembershipFromStripeSubscription(terminalEvent.id, subscriptionId, applicationContext)
    await syncMembershipFromStripeSubscription(staleEvent.id, subscriptionId, applicationContext)

    await expect(
      getMembershipByStripeSubscriptionId(
        getStripeMembershipSourceIdentity({
          stripeSubscriptionId: subscriptionId,
          providerApplicationId: applicationContext.applicationId,
        }),
      ),
    ).resolves.toMatchObject({ status: 'cancelled' })
  })

  it('does not let a later active Stripe event reactivate a source rejected from provider evidence', async () => {
    const user = await createTestUser()
    const sku = await createTestSku({
      plan: 'pro',
      provider_application_id: applicationContext.applicationId,
    })
    const subscriptionId = `sub_rejected_evidence_${randomUUID()}`
    const membership = await createMembership({
      userId: user.id,
      plan: 'pro',
      skuId: sku.id,
      stripeSubscriptionId: subscriptionId,
      stripeCustomerId: `cus_rejected_evidence_${randomUUID()}`,
      providerApplicationId: applicationContext.applicationId,
    })
    const acceptedEvent = makeStripeEvent(
      `evt_accepted_evidence_${randomUUID()}`,
      subscriptionId,
      200,
    )
    const laterEvent = makeStripeEvent(`evt_later_evidence_${randomUUID()}`, subscriptionId, 300)
    await Promise.all([insertStripeEvent(acceptedEvent), insertStripeEvent(laterEvent)])
    mockGetStripeSubscription.mockResolvedValue(
      makeSubscription(subscriptionId, sku.stripe_price_id),
    )

    await syncMembershipFromStripeSubscription(acceptedEvent.id, subscriptionId, applicationContext)
    const evidenceId = await getTestMembershipProviderEvidenceId(membership.id)
    if (!evidenceId) throw new Error('Accepted Stripe evidence was not recorded')
    await rejectMembershipProviderEvidence(evidenceId, 'Provider evidence was rejected')

    await expect(
      syncMembershipFromStripeSubscription(laterEvent.id, subscriptionId, applicationContext),
    ).resolves.toBeNull()
    await expect(
      getMembershipByStripeSubscriptionId(
        getStripeMembershipSourceIdentity({
          stripeSubscriptionId: subscriptionId,
          providerApplicationId: applicationContext.applicationId,
        }),
      ),
    ).resolves.toBeNull()
    await expect(getTestMembershipSourceState(membership.id)).resolves.toMatchObject({
      cancelled_at: expect.any(Date),
    })
  })

  it('rejects an EventBridge subscription identity that does not match the direct source', async () => {
    const user = await createTestUser()
    const sku = await createTestSku({
      plan: 'pro',
      provider_application_id: applicationContext.applicationId,
    })
    const subscriptionId = `sub_identity_projection_${randomUUID()}`
    await createMembership({
      userId: user.id,
      plan: 'pro',
      skuId: sku.id,
      stripeSubscriptionId: subscriptionId,
      stripeCustomerId: `cus_identity_projection_${randomUUID()}`,
      providerApplicationId: applicationContext.applicationId,
    })
    const event = makeStripeEvent(
      `evt_identity_projection_${randomUUID()}`,
      `sub_wrong_${randomUUID()}`,
    )
    await insertStripeEvent(event)
    mockGetStripeSubscription.mockResolvedValue(
      makeSubscription(subscriptionId, sku.stripe_price_id),
    )

    await expect(
      syncMembershipFromStripeSubscription(event.id, subscriptionId, applicationContext),
    ).rejects.toThrow('subscription does not match')
  })

  it('uses authoritative observation time for past_due and clears it on recovery', async () => {
    const user = await createTestUser()
    const sku = await createTestSku({
      plan: 'pro',
      provider_application_id: applicationContext.applicationId,
    })
    const subscriptionId = `sub_past_due_projection_${randomUUID()}`
    await createMembership({
      userId: user.id,
      plan: 'pro',
      skuId: sku.id,
      stripeSubscriptionId: subscriptionId,
      stripeCustomerId: `cus_past_due_projection_${randomUUID()}`,
      providerApplicationId: applicationContext.applicationId,
    })
    const pastDueEvent = makeStripeEvent(`evt_past_due_projection_${randomUUID()}`, subscriptionId)
    const recoveryEvent = makeStripeEvent(
      `evt_recovery_projection_${randomUUID()}`,
      subscriptionId,
      1_800_000_000,
    )
    await Promise.all([insertStripeEvent(pastDueEvent), insertStripeEvent(recoveryEvent)])
    await setStripeEventReceivedAtForTest(pastDueEvent.id, new Date('2024-01-01T00:00:00.000Z'))
    mockGetStripeSubscription
      .mockResolvedValueOnce(makeSubscription(subscriptionId, sku.stripe_price_id, 'past_due'))
      .mockResolvedValueOnce(makeSubscription(subscriptionId, sku.stripe_price_id, 'active'))

    await syncMembershipFromStripeSubscription(pastDueEvent.id, subscriptionId, applicationContext)
    const [event, pastDueMembership] = await Promise.all([
      getStripeEventByStripeEventId(pastDueEvent.id),
      getMembershipByStripeSubscriptionId(
        getStripeMembershipSourceIdentity({
          stripeSubscriptionId: subscriptionId,
          providerApplicationId: applicationContext.applicationId,
        }),
      ),
    ])
    expect(pastDueMembership?.past_due_at?.getTime()).toBeGreaterThan(event!.received_at.getTime())

    await syncMembershipFromStripeSubscription(recoveryEvent.id, subscriptionId, applicationContext)
    await expect(
      getMembershipByStripeSubscriptionId(
        getStripeMembershipSourceIdentity({
          stripeSubscriptionId: subscriptionId,
          providerApplicationId: applicationContext.applicationId,
        }),
      ),
    ).resolves.toMatchObject({ status: 'active', past_due_at: null })
  })
})

function makeStripeEvent(
  id: string,
  subscriptionId: string,
  created = 1_741_398_400,
): Stripe.Event {
  return {
    id,
    object: 'event',
    api_version: '2025-09-30.clover',
    created,
    data: { object: { id: subscriptionId, object: 'subscription' } },
    livemode: true,
    pending_webhooks: 1,
    request: null,
    type: 'customer.subscription.updated',
  } as Stripe.Event
}

function makeSubscription(
  id: string,
  priceId: string,
  status: 'active' | 'canceled' | 'past_due' = 'active',
): Stripe.Response<Stripe.Subscription> {
  return {
    id,
    object: 'subscription',
    livemode: true,
    status,
    cancel_at_period_end: false,
    start_date: 1_741_398_400,
    items: { data: [{ price: { id: priceId, unit_amount: 1_000, currency: 'usd' } }] },
    current_period_start: 1_741_398_400,
    current_period_end: 1_744_076_800,
    ...(status === 'canceled' ? { canceled_at: 1_741_398_500 } : {}),
  } as unknown as Stripe.Response<Stripe.Subscription>
}
