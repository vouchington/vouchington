import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createTestMembership,
  createTestSku,
  createTestUser,
  getTestMembershipProviderEvidenceId,
  getTestMembershipSourceState,
  getTestMembershipRaw,
  runTestActionWhileMembershipUserLocked,
} from '@voucha/test-helpers'
import {
  createMembership,
  getMembershipByStripeSubscriptionId,
  getMembershipHistory,
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
  applicationId: `stripe-concurrency-${randomUUID()}`,
}

describe('concurrent Stripe membership source routing', () => {
  beforeEach(() => vi.clearAllMocks())

  it('reroutes provider facts after their pre-read source is superseded', async () => {
    const member = await createTestUser()
    const grantSku = await createTestSku({ plan: 'plus' })
    const directSku = await createTestSku({
      plan: 'pro',
      provider_application_id: applicationContext.applicationId,
    })
    const subscriptionId = `sub_superseded_source_${member.id}`
    const customerId = `cus_superseded_source_${member.id}`
    const eventId = `evt_superseded_source_${member.id}`
    await createTestMembership({
      user_id: member.id,
      sku_id: directSku.id,
      provider_environment: 'production',
      provider_application_id: applicationContext.applicationId,
      stripe_subscription_id: subscriptionId,
    })
    await insertStripeEvent(makeStripeSubscriptionEvent(eventId, subscriptionId))
    mockGetStripeCustomer.mockResolvedValue({ metadata: { userId: member.id } } as never)
    mockGetStripeSubscription.mockResolvedValue({
      id: subscriptionId,
      livemode: true,
      status: 'active',
      cancel_at_period_end: false,
      items: {
        data: [{ price: { id: directSku.stripe_price_id, unit_amount: 1_000, currency: 'usd' } }],
      },
    } as never)

    await runTestActionWhileMembershipUserLocked({
      userId: member.id,
      lockingQueryComment:
        '/* recordStripeMembershipProviderFacts: lock user before source state */',
      startAction: () =>
        ensureMembershipFromStripeSubscription(
          eventId,
          subscriptionId,
          customerId,
          applicationContext,
        ),
      whileActionBlocked: async query => {
        await createMembership(
          {
            userId: member.id,
            plan: 'plus',
            skuId: grantSku.id,
            durationDays: 365,
            grantedById: member.id,
          },
          { query },
        )
      },
    })

    const membership = await getMembershipByStripeSubscriptionId(
      getStripeMembershipSourceIdentity({
        stripeSubscriptionId: subscriptionId,
        providerApplicationId: applicationContext.applicationId,
      }),
    )
    expect(membership).toMatchObject({ user_id: member.id, sku: { id: directSku.id } })
    await expect(getTestMembershipSourceState(membership!.id)).resolves.toMatchObject({
      membership_provider_observation_id: expect.stringMatching(/^[0-9a-f-]{36}$/),
    })
    await expect(getTestMembershipProviderEvidenceId(membership!.id)).resolves.toMatch(
      /^[0-9a-f-]{36}$/,
    )
  })

  it('routes a source created by another delivery through locked facts', async () => {
    const member = await createTestUser()
    const sku = await createTestSku({
      plan: 'pro',
      provider_application_id: applicationContext.applicationId,
    })
    const subscriptionId = `sub_locked_source_${member.id}`
    const customerId = `cus_locked_source_${member.id}`
    const eventIds = [`evt_locked_source_a_${member.id}`, `evt_locked_source_b_${member.id}`]
    await Promise.all(
      eventIds.map(eventId =>
        insertStripeEvent(makeStripeSubscriptionEvent(eventId, subscriptionId)),
      ),
    )
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

    await expect(
      Promise.all(
        eventIds.map(eventId =>
          ensureMembershipFromStripeSubscription(
            eventId,
            subscriptionId,
            customerId,
            applicationContext,
          ),
        ),
      ),
    ).resolves.toEqual([undefined, undefined])

    const membership = await getMembershipByStripeSubscriptionId(
      getStripeMembershipSourceIdentity({
        stripeSubscriptionId: subscriptionId,
        providerApplicationId: applicationContext.applicationId,
      }),
    )
    expect(membership).toMatchObject({ user_id: member.id, sku: { id: sku.id } })
    await expect(getTestMembershipRaw(membership!.id)).resolves.toMatchObject({
      stripe_subscription_id: subscriptionId,
      stripe_customer_id: customerId,
    })
    await expect(getMembershipHistory(member.id)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          membership_id: membership!.id,
          stripe_event_id: expect.any(String),
        }),
      ]),
    )
  })
})
