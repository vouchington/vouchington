import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createTestSku,
  createTestUser,
  getTestGrantQueue,
  getTestMembershipEntitlementEffects,
  getTestMembershipRaw,
  getTestMembershipSourceState,
} from '@voucha/test-helpers'
import {
  createMembership,
  getMembershipByStripeSubscriptionId,
  getMembershipByUserId,
  getMembershipHistory,
  grantMembership,
} from '@services/memberships'
import {
  getStripeMembershipSourceIdentity,
  type StripeMembershipApplicationContext,
} from '@services/memberships/create-types'
import { insertStripeEvent } from './events.mts'
import { makeStripeSubscriptionEvent } from '../../test-helpers/services/stripe/membership-sync-event.mts'

vi.mock<typeof import('@modules/stripe/customers')>(
  import('@modules/stripe/customers'),
  async importOriginal => ({
    ...(await importOriginal()),
    getStripeCustomer: vi.fn<VitestLooseMock>(),
  }),
)

vi.mock<typeof import('@modules/stripe/subscriptions')>(
  import('@modules/stripe/subscriptions'),
  async importOriginal => ({
    ...(await importOriginal()),
    getStripeSubscription: vi.fn<VitestLooseMock>(),
  }),
)

import { getStripeCustomer } from '@modules/stripe/customers'
import { getStripeSubscription } from '@modules/stripe/subscriptions'
import { ensureMembershipFromStripeSubscription } from './membership-sync.mts'

const mockGetStripeCustomer = vi.mocked(getStripeCustomer)
const mockGetStripeSubscription = vi.mocked(getStripeSubscription)
const applicationContext: StripeMembershipApplicationContext = {
  applicationId: `stripe-terminal-${randomUUID()}`,
}

async function createTestStripeSku() {
  return createTestSku({ plan: 'pro', provider_application_id: applicationContext.applicationId })
}

async function ensureSubscription(eventId: string, subscriptionId: string, customerId: string) {
  return ensureMembershipFromStripeSubscription(
    eventId,
    subscriptionId,
    customerId,
    applicationContext,
  )
}

function getSourceIdentity(subscriptionId: string) {
  return getStripeMembershipSourceIdentity({
    stripeSubscriptionId: subscriptionId,
    providerApplicationId: applicationContext.applicationId,
  })
}

describe('terminal membership sync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('resumes a paused grant and replays its terminal event safely', async () => {
    const admin = await createTestUser({ administrator: true })
    const member = await createTestUser()
    const grantSku = await createTestSku({ plan: 'plus' })
    const grant = await grantMembership(admin.id, member.id, 'plus', grantSku.id, 30)
    const directSku = await createTestStripeSku()
    const subscriptionId = `sub_terminal_sync_${member.id}`
    const customerId = `cus_terminal_sync_${member.id}`
    const eventId = `evt_terminal_sync_${member.id}`
    const startDate = new Date(Math.ceil(Date.now() / 1000) * 1000 + 60_000)
    const canceledAt = new Date(startDate.getTime() + 60_000)
    const endedAt = new Date(canceledAt.getTime() + 60_000)
    const direct = await createMembership({
      userId: member.id,
      plan: 'pro',
      skuId: directSku.id,
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
      stripeSubscriptionId: subscriptionId,
      stripeCustomerId: customerId,
      providerApplicationId: applicationContext.applicationId,
    })
    await insertStripeEvent(makeStripeSubscriptionEvent(eventId, subscriptionId))
    mockGetStripeCustomer.mockResolvedValue({ metadata: { userId: member.id } } as never)
    mockGetStripeSubscription.mockResolvedValue({
      id: subscriptionId,
      livemode: true,
      status: 'canceled',
      cancel_at_period_end: false,
      start_date: Math.floor(startDate.getTime() / 1000),
      ended_at: Math.floor(endedAt.getTime() / 1000),
      canceled_at: Math.floor(canceledAt.getTime() / 1000),
      items: {
        data: [{ price: { id: directSku.stripe_price_id, unit_amount: 1_000, currency: 'usd' } }],
      },
    } as never)

    await ensureSubscription(eventId, subscriptionId, customerId)
    await ensureSubscription(eventId, subscriptionId, customerId)

    await expect(getMembershipByUserId(member.id)).resolves.toMatchObject({
      plan: 'plus',
      status: 'active',
    })
    await expect(getTestMembershipRaw(direct.id)).resolves.toMatchObject({
      effective_at: startDate,
      cancelled_at: endedAt,
      source_cancelled_at: endedAt,
    })
    const history = await getMembershipHistory(member.id)
    const cancellation = history.find(change => change.stripe_event_id === eventId)
    const resumedGrant = history.find(
      change => change.change_type === 'admin_grant' && change.membership_id !== grant.id,
    )
    if (!cancellation || !resumedGrant)
      throw new Error('Expected terminal and resumed-grant changes')
    expect(history.filter(change => change.stripe_event_id === eventId)).toHaveLength(1)
    expect(cancellation.membership_provider_evidence_id).toMatch(/^[0-9a-f-]{36}$/)
    await expect(
      Promise.all(
        [cancellation, resumedGrant].map(change => getTestMembershipEntitlementEffects(change.id)),
      ),
    ).resolves.toEqual([
      [expect.objectContaining({ membership_change_id: cancellation.id, user_id: member.id })],
      [expect.objectContaining({ membership_change_id: resumedGrant.id, user_id: member.id })],
    ])
  })

  it('pauses a live admin grant at the Stripe direct term start', async () => {
    const admin = await createTestUser({ administrator: true })
    const member = await createTestUser()
    const grantSku = await createTestSku({ plan: 'plus' })
    const grant = await grantMembership(admin.id, member.id, 'plus', grantSku.id, 30)
    const directSku = await createTestStripeSku()
    const startDate = new Date(Math.ceil(Date.now() / 1000) * 1000 + 60_000)
    const subscriptionId = `sub_grant_pause_${member.id}`
    const eventId = `evt_grant_pause_${member.id}`
    await insertStripeEvent(makeStripeSubscriptionEvent(eventId, subscriptionId))

    mockGetStripeCustomer.mockResolvedValue({ metadata: { userId: member.id } } as never)
    mockGetStripeSubscription.mockResolvedValue({
      id: subscriptionId,
      livemode: true,
      status: 'active',
      cancel_at_period_end: false,
      start_date: Math.floor(startDate.getTime() / 1000),
      items: {
        data: [{ price: { id: directSku.stripe_price_id, unit_amount: 1_000, currency: 'usd' } }],
      },
    } as never)

    await ensureSubscription(eventId, subscriptionId, `cus_grant_pause_${member.id}`)

    await expect(getTestMembershipSourceState(grant.id)).resolves.toMatchObject({
      paused_at: startDate,
    })
    await expect(getTestGrantQueue(member.id)).resolves.toMatchObject({ open_activation_count: 0 })
    await expect(getMembershipByUserId(member.id)).resolves.toMatchObject({
      stripe_subscription_id: subscriptionId,
      plan: 'pro',
    })
  })

  it('rediscovers an expired Stripe source when its subscription becomes active', async () => {
    const admin = await createTestUser({ administrator: true })
    const member = await createTestUser()
    const grantSku = await createTestSku({ plan: 'plus' })
    const grant = await grantMembership(admin.id, member.id, 'plus', grantSku.id, 30)
    const directSku = await createTestStripeSku()
    const subscriptionId = `sub_rediscovered_${member.id}`
    const customerId = `cus_rediscovered_${member.id}`
    const terminalEventId = `evt_rediscovered_terminal_${member.id}`
    const activeEventId = `evt_rediscovered_active_${member.id}`
    const providerEffectiveAt = new Date(Math.ceil(Date.now() / 1000) * 1000 + 60_000)

    mockGetStripeCustomer.mockResolvedValue({ metadata: { userId: member.id } } as never)
    mockGetStripeSubscription.mockResolvedValue({
      status: 'incomplete',
      cancel_at_period_end: false,
      start_date: Math.floor(providerEffectiveAt.getTime() / 1000),
      items: { data: [{ price: { id: directSku.stripe_price_id } }] },
    } as never)

    await ensureSubscription(terminalEventId, subscriptionId, customerId)

    await expect(
      getMembershipByStripeSubscriptionId(getSourceIdentity(subscriptionId)),
    ).resolves.toBeNull()
    await expect(getMembershipByUserId(member.id)).resolves.toMatchObject({ id: grant.id })

    mockGetStripeSubscription.mockResolvedValue({
      id: subscriptionId,
      livemode: true,
      status: 'active',
      cancel_at_period_end: false,
      start_date: Math.floor(providerEffectiveAt.getTime() / 1000),
      items: {
        data: [{ price: { id: directSku.stripe_price_id, unit_amount: 1_000, currency: 'usd' } }],
      },
    } as never)
    await insertStripeEvent(makeStripeSubscriptionEvent(activeEventId, subscriptionId))

    await ensureSubscription(activeEventId, subscriptionId, customerId)

    const activeMembership = await getMembershipByStripeSubscriptionId(
      getSourceIdentity(subscriptionId),
    )
    expect(activeMembership).toMatchObject({
      plan: 'pro',
      status: 'active',
    })
    await expect(getTestMembershipSourceState(grant.id)).resolves.toMatchObject({
      paused_at: providerEffectiveAt,
    })
    await expect(getTestGrantQueue(member.id)).resolves.toMatchObject({ open_activation_count: 0 })

    const historyBeforeReplay = await getMembershipHistory(member.id)
    const effectsBeforeReplay = await Promise.all(
      historyBeforeReplay.map(change => getTestMembershipEntitlementEffects(change.id)),
    )

    await ensureSubscription(activeEventId, subscriptionId, customerId)

    await expect(
      getMembershipByStripeSubscriptionId(getSourceIdentity(subscriptionId)),
    ).resolves.toMatchObject({ id: activeMembership?.id, plan: 'pro', status: 'active' })
    await expect(getMembershipHistory(member.id)).resolves.toEqual(historyBeforeReplay)
    await expect(
      Promise.all(
        historyBeforeReplay.map(change => getTestMembershipEntitlementEffects(change.id)),
      ),
    ).resolves.toEqual(effectsBeforeReplay)
  })

  it('reactivates a retained terminal Stripe source from its authoritative subscription', async () => {
    const member = await createTestUser()
    const sku = await createTestStripeSku()
    const subscriptionId = `sub_terminal_rediscovery_${member.id}`
    const customerId = `cus_terminal_rediscovery_${member.id}`
    const terminalEventId = `evt_terminal_rediscovery_${member.id}`
    const reactivationEventId = `evt_terminal_reactivation_${member.id}`
    const terminal = await createMembership({
      userId: member.id,
      plan: 'pro',
      skuId: sku.id,
      status: 'cancelled',
      stripeSubscriptionId: subscriptionId,
      stripeCustomerId: customerId,
      stripeEventId: terminalEventId,
      providerApplicationId: applicationContext.applicationId,
    })

    mockGetStripeCustomer.mockResolvedValue({ metadata: { userId: member.id } } as never)
    mockGetStripeSubscription.mockResolvedValue({
      id: subscriptionId,
      livemode: true,
      status: 'active',
      cancel_at_period_end: false,
      items: {
        data: [{ price: { id: sku.stripe_price_id, unit_amount: 1_000, currency: 'usd' } }],
      },
    } as never)
    await insertStripeEvent(makeStripeSubscriptionEvent(reactivationEventId, subscriptionId))

    await ensureSubscription(reactivationEventId, subscriptionId, customerId)

    await expect(
      getMembershipByStripeSubscriptionId(getSourceIdentity(subscriptionId)),
    ).resolves.toMatchObject({ id: terminal.id, status: 'active' })
    await expect(getTestMembershipRaw(terminal.id)).resolves.toMatchObject({
      cancelled_at: null,
      source_cancelled_at: null,
    })
    await expect(getMembershipHistory(member.id)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ stripe_event_id: terminalEventId }),
        expect.objectContaining({
          stripe_event_id: reactivationEventId,
          change_type: 'reactivation',
        }),
      ]),
    )
  })
})
