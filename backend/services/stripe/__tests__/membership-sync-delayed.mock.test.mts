import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestSku, createTestUser, getTestMembershipRaw } from '@voucha/test-helpers'
import {
  createMembership,
  getMembershipByStripeSubscriptionId,
  getMembershipHistory,
} from '@services/memberships'
import { getStripeMembershipSourceIdentity } from '@services/memberships/create-types'
import { insertStripeEvent } from '../events.mts'
import { makeStripeSubscriptionEvent } from '../test-helpers/membership-sync-event.mts'

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
import { ensureMembershipFromStripeSubscription } from '../membership-sync.mts'

const applicationContext = { applicationId: `stripe-delayed-${randomUUID()}` }

const mockGetStripeCustomer = vi.mocked(getStripeCustomer)
const mockGetStripeSubscription = vi.mocked(getStripeSubscription)

describe('delayed Stripe membership synchronization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses provider lifecycle clocks when a terminal subscription arrives late', async () => {
    const member = await createTestUser()
    const sku = await createTestSku({
      plan: 'plus',
      provider_application_id: applicationContext.applicationId,
    })
    const subscriptionId = `sub_delayed_${randomUUID()}`
    const effectiveAt = new Date('2020-01-01T00:00:00.000Z')
    const expiresAt = new Date('2020-02-01T00:00:00.000Z')
    const endedAt = new Date('2020-02-02T00:00:00.000Z')
    const eventId = `evt_delayed_${randomUUID()}`
    await insertStripeEvent(makeStripeSubscriptionEvent(eventId, subscriptionId))

    mockGetStripeCustomer.mockResolvedValue({ metadata: { userId: member.id } } as never)
    mockGetStripeSubscription.mockResolvedValue({
      id: subscriptionId,
      livemode: true,
      status: 'canceled',
      cancel_at_period_end: false,
      start_date: effectiveAt.getTime() / 1000,
      ended_at: endedAt.getTime() / 1000,
      items: {
        data: [
          {
            price: { id: sku.stripe_price_id, unit_amount: 1_000, currency: 'usd' },
            current_period_end: expiresAt.getTime() / 1000,
          },
        ],
      },
    } as never)

    await ensureMembershipFromStripeSubscription(
      eventId,
      subscriptionId,
      `cus_delayed_${randomUUID()}`,
      applicationContext,
    )

    await expect(
      getMembershipByStripeSubscriptionId(
        getStripeMembershipSourceIdentity({
          stripeSubscriptionId: subscriptionId,
          providerApplicationId: applicationContext.applicationId,
        }),
      ),
    ).resolves.toBeNull()
    const terminalChange = (await getMembershipHistory(member.id)).find(
      change => change.stripe_event_id === eventId,
    )
    if (!terminalChange)
      throw new Error('Terminal subscription was not recorded in membership history')
    await expect(getTestMembershipRaw(terminalChange.membership_id)).resolves.toMatchObject({
      effective_at: effectiveAt,
      expires_at: expiresAt,
      cancelled_at: endedAt,
      source_effective_at: effectiveAt,
      source_expires_at: expiresAt,
      source_cancelled_at: endedAt,
    })
  })

  it('uses provider lifecycle clocks when an existing subscription terminates late', async () => {
    const member = await createTestUser()
    const sku = await createTestSku({
      plan: 'plus',
      provider_application_id: applicationContext.applicationId,
    })
    const subscriptionId = `sub_delayed_existing_${randomUUID()}`
    const effectiveAt = new Date('2020-01-01T00:00:00.000Z')
    const expiresAt = new Date('2020-02-01T00:00:00.000Z')
    const endedAt = new Date('2020-02-02T00:00:00.000Z')
    const eventId = `evt_delayed_existing_${randomUUID()}`
    await insertStripeEvent(makeStripeSubscriptionEvent(eventId, subscriptionId))
    const existing = await createMembership({
      userId: member.id,
      plan: 'plus',
      skuId: sku.id,
      expiresAt: new Date('2030-02-01T00:00:00.000Z'),
      stripeSubscriptionId: subscriptionId,
      stripeCustomerId: `cus_delayed_existing_${randomUUID()}`,
      providerApplicationId: applicationContext.applicationId,
    })

    mockGetStripeCustomer.mockResolvedValue({ metadata: { userId: member.id } } as never)
    mockGetStripeSubscription.mockResolvedValue({
      id: subscriptionId,
      livemode: true,
      status: 'canceled',
      cancel_at_period_end: false,
      start_date: effectiveAt.getTime() / 1000,
      ended_at: endedAt.getTime() / 1000,
      items: {
        data: [
          {
            price: { id: sku.stripe_price_id, unit_amount: 1_000, currency: 'usd' },
            current_period_end: expiresAt.getTime() / 1000,
          },
        ],
      },
    } as never)

    await ensureMembershipFromStripeSubscription(
      eventId,
      subscriptionId,
      `cus_${randomUUID()}`,
      applicationContext,
    )

    await expect(getTestMembershipRaw(existing.id)).resolves.toMatchObject({
      effective_at: effectiveAt,
      expires_at: expiresAt,
      cancelled_at: endedAt,
      source_cancelled_at: endedAt,
    })
    await expect(getMembershipHistory(member.id)).resolves.toEqual([
      expect.objectContaining({
        membership_id: existing.id,
        change_type: 'cancellation',
        cancelled_at: endedAt,
        stripe_event_id: eventId,
      }),
      expect.objectContaining({ membership_id: existing.id, change_type: 'renewal' }),
    ])
  })

  it('clamps a missing provider start to an elapsed period end', async () => {
    const member = await createTestUser()
    const sku = await createTestSku({
      plan: 'plus',
      provider_application_id: applicationContext.applicationId,
    })
    const subscriptionId = `sub_missing_start_${randomUUID()}`
    const expiresAt = new Date('2020-02-01T00:00:00.000Z')
    const endedAt = new Date('2020-02-02T00:00:00.000Z')
    const eventId = `evt_missing_start_${randomUUID()}`
    await insertStripeEvent(makeStripeSubscriptionEvent(eventId, subscriptionId))

    mockGetStripeCustomer.mockResolvedValue({ metadata: { userId: member.id } } as never)
    mockGetStripeSubscription.mockResolvedValue({
      id: subscriptionId,
      livemode: true,
      status: 'canceled',
      cancel_at_period_end: false,
      ended_at: endedAt.getTime() / 1000,
      items: {
        data: [
          {
            price: { id: sku.stripe_price_id, unit_amount: 1_000, currency: 'usd' },
            current_period_end: expiresAt.getTime() / 1000,
          },
        ],
      },
    } as never)

    await ensureMembershipFromStripeSubscription(
      eventId,
      subscriptionId,
      `cus_missing_start_${randomUUID()}`,
      applicationContext,
    )

    await expect(
      getMembershipByStripeSubscriptionId(
        getStripeMembershipSourceIdentity({
          stripeSubscriptionId: subscriptionId,
          providerApplicationId: applicationContext.applicationId,
        }),
      ),
    ).resolves.toBeNull()
    const terminalChange = (await getMembershipHistory(member.id)).find(
      change => change.stripe_event_id === eventId,
    )
    if (!terminalChange)
      throw new Error('Terminal subscription was not recorded in membership history')
    await expect(getTestMembershipRaw(terminalChange.membership_id)).resolves.toMatchObject({
      effective_at: expiresAt,
      expires_at: expiresAt,
      cancelled_at: endedAt,
      source_effective_at: expiresAt,
      source_expires_at: expiresAt,
      source_cancelled_at: endedAt,
    })
  })

  it('clamps an existing subscription when a delayed terminal event omits its start', async () => {
    const member = await createTestUser()
    const sku = await createTestSku({
      plan: 'plus',
      provider_application_id: applicationContext.applicationId,
    })
    const subscriptionId = `sub_missing_existing_start_${randomUUID()}`
    const eventId = `evt_missing_existing_start_${randomUUID()}`
    const endedAt = new Date('2020-02-02T00:00:00.000Z')
    const existingExpiresAt = new Date('2030-02-01T00:00:00.000Z')
    const existing = await createMembership({
      userId: member.id,
      plan: 'plus',
      skuId: sku.id,
      expiresAt: existingExpiresAt,
      stripeSubscriptionId: subscriptionId,
      stripeCustomerId: `cus_missing_existing_start_${randomUUID()}`,
      providerApplicationId: applicationContext.applicationId,
    })

    mockGetStripeCustomer.mockResolvedValue({ metadata: { userId: member.id } } as never)
    mockGetStripeSubscription.mockResolvedValue({
      id: subscriptionId,
      livemode: true,
      status: 'canceled',
      cancel_at_period_end: false,
      ended_at: endedAt.getTime() / 1000,
      items: {
        data: [{ price: { id: sku.stripe_price_id, unit_amount: 1_000, currency: 'usd' } }],
      },
    } as never)

    await insertStripeEvent(makeStripeSubscriptionEvent(eventId, subscriptionId))
    await ensureMembershipFromStripeSubscription(
      eventId,
      subscriptionId,
      `cus_${randomUUID()}`,
      applicationContext,
    )

    await expect(
      getMembershipByStripeSubscriptionId(
        getStripeMembershipSourceIdentity({
          stripeSubscriptionId: subscriptionId,
          providerApplicationId: applicationContext.applicationId,
        }),
      ),
    ).resolves.toMatchObject({ started_at: endedAt })
    await expect(getTestMembershipRaw(existing.id)).resolves.toMatchObject({
      expires_at: existingExpiresAt,
      cancelled_at: endedAt,
      source_effective_at: endedAt,
      source_expires_at: existingExpiresAt,
      source_cancelled_at: endedAt,
    })
  })
})
