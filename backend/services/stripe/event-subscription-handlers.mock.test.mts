import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createTestMembership,
  createTestSku,
  createTestUser,
  getTestGrantQueue,
  getTestMembershipGrant,
  getTestMembershipGrantRemainingMilliseconds,
  getTestMembershipRaw,
  getTestMembershipSourceState,
  updateTestMembershipExpiresAt,
} from '@voucha/test-helpers'
import {
  createMembership,
  getMembershipHistory,
  getMembershipByUserId,
  getUserActivePlan,
  grantMembership,
} from '@services/memberships'
import { insertStripeEvent } from '@services/stripe/events'

vi.mock<typeof import('@modules/stripe/subscriptions')>(
  import('@modules/stripe/subscriptions'),
  async importOriginal => ({
    ...(await importOriginal()),
    getStripeSubscription: vi.fn<VitestLooseMock>(),
  }),
)

import { getStripeSubscription } from '@modules/stripe/subscriptions'
import {
  handleInvoicePaymentFailure,
  handleSubscriptionDeleted,
  handleSubscriptionUpdated,
} from './event-subscription-handlers.mts'
import { makeStripeSubscriptionEvent } from '../../test-helpers/services/stripe/membership-sync-event.mts'

const mockGetStripeSubscription = vi.mocked(getStripeSubscription)
const applicationContext = { applicationId: `stripe-event-handler-${randomUUID()}` }

async function createTestStripeSku(plan: 'plus' | 'pro') {
  return createTestSku({ plan, provider_application_id: applicationContext.applicationId })
}
function createProductionStripeMembership(options: Parameters<typeof createTestMembership>[0]) {
  return createTestMembership({
    ...options,
    provider_environment: 'production',
    provider_application_id: applicationContext.applicationId,
  })
}
async function handleUpdated(eventId: string, eventData: Record<string, unknown>) {
  return handleSubscriptionUpdated(eventId, eventData, undefined, applicationContext)
}

async function handleDeleted(eventId: string, eventData: Record<string, unknown>) {
  return handleSubscriptionDeleted(eventId, eventData, undefined, applicationContext)
}

describe('membership subscription event handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses Stripe’s current subscription for a delayed plan-change event', async () => {
    const member = await createTestUser()
    const oldSku = await createTestStripeSku('plus')
    const currentSku = await createTestStripeSku('pro')
    const subscriptionId = uniqueStripeId('sub')
    const membership = await createProductionStripeMembership({
      user_id: member.id,
      plan: 'plus',
      sku_id: oldSku.id,
      stripe_subscription_id: subscriptionId,
    })
    mockGetStripeSubscription.mockResolvedValue(
      stripeSubscription(subscriptionId, 'active', currentSku.stripe_price_id),
    )
    const eventId = uniqueStripeId('evt')
    await insertStripeMembershipEvent(eventId, subscriptionId)
    await handleUpdated(eventId, {
      id: subscriptionId,
      status: 'past_due',
      items: { data: [{ price: { id: oldSku.stripe_price_id } }] },
    })
    await expect(getTestMembershipRaw(membership.id)).resolves.toMatchObject({
      status: 'active',
      sku_id: currentSku.id,
    })
  })

  it('does not regress an active membership to past_due for a delayed invoice failure', async () => {
    const member = await createTestUser()
    const sku = await createTestSku({
      plan: 'plus',
      provider_application_id: applicationContext.applicationId,
    })
    const subscriptionId = uniqueStripeId('sub')
    const membership = await createProductionStripeMembership({
      user_id: member.id,
      sku_id: sku.id,
      stripe_subscription_id: subscriptionId,
    })
    mockGetStripeSubscription.mockResolvedValue(
      stripeSubscription(subscriptionId, 'active', sku.stripe_price_id),
    )
    const eventId = uniqueStripeId('evt')
    await insertStripeMembershipEvent(eventId, subscriptionId)
    await handleInvoicePaymentFailure(eventId, { subscription: subscriptionId }, applicationContext)
    await expect(getTestMembershipRaw(membership.id)).resolves.toMatchObject({ status: 'active' })
  })

  it('keeps a paused Stripe subscription non-entitling when a delayed update arrives', async () => {
    const member = await createTestUser()
    const sku = await createTestSku({
      plan: 'plus',
      provider_application_id: applicationContext.applicationId,
    })
    const subscriptionId = uniqueStripeId('sub')
    const membership = await createProductionStripeMembership({
      user_id: member.id,
      sku_id: sku.id,
      stripe_subscription_id: subscriptionId,
    })
    mockGetStripeSubscription.mockResolvedValue(
      stripeSubscription(subscriptionId, 'paused', sku.stripe_price_id),
    )
    const eventId = uniqueStripeId('evt')
    await insertStripeMembershipEvent(eventId, subscriptionId)
    await handleUpdated(eventId, {
      id: subscriptionId,
      status: 'active',
    })
    await expect(getTestMembershipRaw(membership.id)).resolves.toMatchObject({ status: 'paused' })
    await expect(getUserActivePlan(member.id)).resolves.toBeNull()
  })

  it.each(['paused', 'cancelled'] as const)(
    'restores direct precedence from a retained %s source when Stripe reports it active',
    async retainedStatus => {
      const admin = await createTestUser({ administrator: true })
      const member = await createTestUser()
      const directSku = await createTestSku({
        plan: 'pro',
        provider_application_id: applicationContext.applicationId,
      })
      const subscriptionId = uniqueStripeId('sub')
      await createMembership({
        userId: member.id,
        plan: 'pro',
        skuId: directSku.id,
        stripeSubscriptionId: subscriptionId,
        status: retainedStatus,
        providerApplicationId: applicationContext.applicationId,
      })
      const grantSku = await createTestSku({ plan: 'plus' })
      const grant = await grantMembership(admin.id, member.id, 'plus', grantSku.id, 30)
      await expect(getMembershipByUserId(member.id)).resolves.toMatchObject({
        id: grant.id,
        plan: 'plus',
        status: 'active',
      })
      mockGetStripeSubscription.mockResolvedValue(
        stripeSubscription(subscriptionId, 'active', directSku.stripe_price_id),
      )
      const eventId = uniqueStripeId('evt')
      await insertStripeMembershipEvent(eventId, subscriptionId)
      await handleUpdated(eventId, { id: subscriptionId })
      await expect(getMembershipByUserId(member.id)).resolves.toMatchObject({
        plan: 'pro',
        status: 'active',
        stripe_subscription_id: subscriptionId,
      })
      await expect(getTestGrantQueue(member.id)).resolves.toMatchObject({
        active_grant_ids: [],
        grant_ids: [grant.grantId],
        open_activation_count: 0,
      })
    },
  )

  it('pauses a retained source grant at Stripe’s current-period boundary on reactivation', async () => {
    const member = await createTestUser()
    const directSku = await createTestSku({
      plan: 'pro',
      provider_application_id: applicationContext.applicationId,
    })
    const subscriptionId = uniqueStripeId('sub')
    await createMembership({
      userId: member.id,
      plan: 'pro',
      skuId: directSku.id,
      stripeSubscriptionId: subscriptionId,
      status: 'paused',
      effectiveAt: new Date('2019-01-01T00:00:00.000Z'),
      providerApplicationId: applicationContext.applicationId,
    })
    const grantSku = await createTestSku({ plan: 'plus' })
    const grantStartedAt = new Date('2020-01-01T00:00:00.000Z')
    const grant = await createTestMembership({
      user_id: member.id,
      plan: 'plus',
      sku_id: grantSku.id,
      stripe_subscription_id: null,
      effective_at: grantStartedAt,
    })
    await updateTestMembershipExpiresAt(grant.id, new Date('2020-12-31T00:00:00.000Z'))
    const [grantId] = (await getTestGrantQueue(member.id)).grant_ids
    expect(grantId).toBeDefined()
    const currentPeriodStart = new Date('2020-06-01T00:00:00.000Z')
    mockGetStripeSubscription.mockResolvedValue({
      id: subscriptionId,
      livemode: true,
      status: 'active',
      cancel_at_period_end: false,
      current_period_start: Math.floor(currentPeriodStart.getTime() / 1000),
      items: {
        data: [{ price: stripePrice(directSku.stripe_price_id) }],
      },
    } as never)
    const eventId = uniqueStripeId('evt')
    await insertStripeMembershipEvent(eventId, subscriptionId)
    await handleUpdated(eventId, { id: subscriptionId })
    await expect(getTestMembershipGrant(grantId!)).resolves.toMatchObject({
      activation_started_at: grantStartedAt,
      activation_ended_at: currentPeriodStart,
    })
    await expect(getTestMembershipGrantRemainingMilliseconds(grantId!)).resolves.toBe(
      213 * 24 * 60 * 60 * 1000,
    )
    await expect(getTestGrantQueue(member.id)).resolves.toMatchObject({ open_activation_count: 0 })
  })

  it('records a deleted retained source once without changing its active grant', async () => {
    const admin = await createTestUser({ administrator: true })
    const member = await createTestUser()
    const directSku = await createTestSku({
      plan: 'pro',
      provider_application_id: applicationContext.applicationId,
    })
    const subscriptionId = uniqueStripeId('sub')
    const direct = await createMembership({
      userId: member.id,
      plan: 'pro',
      skuId: directSku.id,
      stripeSubscriptionId: subscriptionId,
      status: 'paused',
      providerApplicationId: applicationContext.applicationId,
    })
    const grantSku = await createTestSku({ plan: 'plus' })
    const grant = await grantMembership(admin.id, member.id, 'plus', grantSku.id, 30)
    const eventId = uniqueStripeId('evt')
    const endedAt = new Date(Math.ceil(Date.now() / 1000) * 1000)
    mockGetStripeSubscription.mockResolvedValue({
      id: subscriptionId,
      livemode: true,
      status: 'canceled',
      cancel_at_period_end: false,
      canceled_at: Math.floor(endedAt.getTime() / 1000),
      items: {
        data: [{ price: stripePrice(directSku.stripe_price_id) }],
      },
    } as never)
    await insertStripeMembershipEvent(eventId, subscriptionId)
    const repeatedEventId = uniqueStripeId('evt')
    await insertStripeMembershipEvent(repeatedEventId, subscriptionId)
    for (const replayEventId of [eventId, eventId, repeatedEventId])
      await handleDeleted(replayEventId, { id: subscriptionId })
    await expect(getMembershipByUserId(member.id)).resolves.toMatchObject({ id: grant.id })
    await expect(getTestMembershipSourceState(direct.id)).resolves.toMatchObject({
      cancelled_at: endedAt,
      paused_at: null,
    })
    expect(
      (await getMembershipHistory(member.id)).filter(change => change.stripe_event_id === eventId),
    ).toEqual([expect.objectContaining({ change_type: 'cancellation' })])
  })
})

async function insertStripeMembershipEvent(eventId: string, subscriptionId: string): Promise<void> {
  await insertStripeEvent(makeStripeSubscriptionEvent(eventId, subscriptionId))
}

function stripeSubscription(subscriptionId: string, status: string, priceId: string) {
  return {
    id: subscriptionId,
    livemode: true,
    status,
    cancel_at_period_end: false,
    items: { data: [{ price: stripePrice(priceId) }] },
  } as never
}

function stripePrice(id: string) {
  return { id, unit_amount: 500, currency: 'usd' }
}

function uniqueStripeId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`
}
