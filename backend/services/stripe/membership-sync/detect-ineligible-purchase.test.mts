import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  beginTransaction,
  createTestNativeMembershipProviderProduct,
  createTestUnprojectedProviderObservation,
  createTestSku,
} from '@voucha/test-helpers'
import { getIneligiblePurchaseReversalCase } from '@services/memberships/ineligible-stripe-purchase-reversal/case-read'
import { projectVerifiedProviderMembershipObservation } from '@services/memberships/provider-observation-projection'
import { setupPurchase } from '@voucha/test-helpers/stripe-reversal-detection'
import { syncOrCreateStripeMembershipInTransaction } from './sync-or-create.mts'
import { getStripeMembershipSourceIdentity } from '@services/memberships/create-types'
import { getLockedIneligiblePurchaseReversalCase } from '@services/memberships/ineligible-stripe-purchase-reversal/case-ledger'
import { createMembership } from '@services/memberships/create'

// PostgreSQL admission uses its own clock; keep the source effective before the shared DB clock.
const start = 1_740_000_000
const end = start + 100

describe('ineligible Stripe purchase detection', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date((start + 50) * 1000))
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it.each([
    ['already covered', start - 10, end, 1001],
    ['partial overlap', start + 30, end, 700],
    ['zero-length purchase', start, start, 1001],
  ])('records %s with an immutable purchase cap', async (_label, winnerStart, periodEnd, cap) => {
    const fixture = await setupPurchase(winnerStart, periodEnd)
    await expect(fixture.detect()).resolves.toBe(true)
    const first = await getIneligiblePurchaseReversalCase(fixture.lookup)
    expect(first).toMatchObject({
      subscriptionId: fixture.subscriptionId,
      originatingInvoiceId: fixture.invoice.id,
      stripePriceId: fixture.priceId,
      winningSourceKind: 'family',
      qualifyingAmountMinorUnits: 1001,
      refundCapMinorUnits: cap,
      periodStartedAt: new Date(start * 1000),
      periodEndsAt: new Date(periodEnd * 1000),
    })
    expect(first?.membershipSourceId).toEqual(expect.any(String))
    fixture.invoice.total = 2000
    await expect(fixture.detect()).resolves.toBe(false)
    expect(await getIneligiblePurchaseReversalCase(fixture.lookup)).toEqual(first)
  })

  it.each([
    ['non-overlap', end, end],
    ['zero-length before winner', start + 1, start],
  ])('creates no case for %s', async (_label, winnerStart, periodEnd) => {
    const fixture = await setupPurchase(winnerStart, periodEnd)
    await expect(fixture.detect()).resolves.toBe(false)
    await expect(getIneligiblePurchaseReversalCase(fixture.lookup)).resolves.toBeNull()
  })

  it('does not create a case without another winning source', async () => {
    const fixture = await setupPurchase(null, end)
    await expect(fixture.detect()).resolves.toBe(false)
    await expect(getIneligiblePurchaseReversalCase(fixture.lookup)).resolves.toBeNull()
  })

  it('uses the historical invoice price to validate the purchase intent after a subscription price change', async () => {
    const fixture = await setupPurchase(start, end)
    fixture.subscription.metadata.membership_purchase_intent_id = await fixture.createIntent()
    fixture.subscription.items.data[0]!.price.id = `price_new_${randomUUID()}`
    await expect(fixture.detect()).resolves.toBe(true)
    await expect(getIneligiblePurchaseReversalCase(fixture.lookup)).resolves.toMatchObject({
      stripePriceId: fixture.priceId,
      subscriptionId: fixture.subscriptionId,
      refundCapMinorUnits: 1001,
    })
  })

  it('records a later purchase at a new mapped price for the same bound subscription', async () => {
    const fixture = await setupPurchase(start, end)
    fixture.subscription.metadata.membership_purchase_intent_id = await fixture.createIntent()
    await expect(fixture.detect()).resolves.toBe(true)
    const first = await getIneligiblePurchaseReversalCase(fixture.lookup)
    const renewalSku = await createTestSku({
      plan: 'plus',
      provider_application_id: fixture.lookup.providerApplicationId,
    })
    fixture.invoice.id = `in_renewal_${randomUUID()}`
    fixture.lines[0]!.pricing.price_details.price = renewalSku.stripe_price_id!
    fixture.lines[0]!.period = { start: end, end: end + 100 }
    fixture.subscription.items.data[0]!.price.id = renewalSku.stripe_price_id!
    await expect(fixture.detect()).resolves.toBe(true)
    const renewal = await getIneligiblePurchaseReversalCase({
      ...fixture.lookup,
      originatingInvoiceId: fixture.invoice.id,
    })
    expect(renewal).toMatchObject({
      stripePriceId: renewalSku.stripe_price_id,
      subscriptionId: fixture.subscriptionId,
      refundCapMinorUnits: 1001,
    })
    expect(renewal?.id).not.toBe(first?.id)
  })

  it.each([
    ['family', 'plus', 'family'],
    ['apple_app_store', 'pro', 'direct'],
    ['google_play', 'pro', 'direct'],
    ['microsoft_store', 'pro', 'direct'],
  ] as const)(
    'records the purchase when sync rejects it against %s',
    async (winner, plan, sourceKind) => {
      const fixture = await setupPurchase(start, end, winner, plan)
      const secondInvoiceId = fixture.addInvoice()
      const sourceIdentity = getStripeMembershipSourceIdentity({
        stripeSubscriptionId: fixture.subscriptionId,
        providerApplicationId: fixture.lookup.providerApplicationId,
      })
      await using query = await beginTransaction()
      await syncOrCreateStripeMembershipInTransaction(
        {
          eventId: `evt_${randomUUID()}`,
          userId: fixture.userId,
          subscriptionId: fixture.subscriptionId,
          customerId: `cus_${fixture.userId}`,
          sourceIdentity,
          values: {
            status: 'active',
            plan,
            skuId: fixture.skuId,
            expiresAt: new Date(end * 1000),
            effectiveAt: new Date(start * 1000),
            currentPeriodStart: new Date(start * 1000),
            terminalEffectiveAt: undefined,
            cancelAtPeriodEnd: false,
          },
          subscription: {} as Awaited<
            ReturnType<typeof import('@modules/stripe/subscriptions').getStripeSubscription>
          >,
          observedAt: new Date(),
        },
        query,
      )
      await expect(
        getLockedIneligiblePurchaseReversalCase(
          { ...fixture.lookup, subscriptionId: fixture.subscriptionId },
          query,
        ),
      ).resolves.toMatchObject({ refundCapMinorUnits: 1001, winningSourceKind: sourceKind })
      await expect(
        getLockedIneligiblePurchaseReversalCase(
          {
            ...fixture.lookup,
            originatingInvoiceId: secondInvoiceId,
            subscriptionId: fixture.subscriptionId,
          },
          query,
        ),
      ).resolves.toMatchObject({ refundCapMinorUnits: 1001, winningSourceKind: sourceKind })
      await query.rollback()
    },
  )

  it('records the displaced Stripe purchase when a higher-tier family observation wins', async () => {
    const fixture = await setupPurchase(null, end)
    await createMembership({
      userId: fixture.userId,
      plan: 'plus',
      skuId: fixture.skuId,
      stripeSubscriptionId: fixture.subscriptionId,
      providerApplicationId: fixture.lookup.providerApplicationId,
      expiresAt: new Date('2040-01-01T00:00:00Z'),
    })
    const winnerSku = await createTestSku({ plan: 'pro' })
    const applicationId = `winner-${randomUUID()}`
    const product = await createTestNativeMembershipProviderProduct({
      membershipProductId: winnerSku.id,
      provider: 'apple_app_store',
      environment: 'test',
      applicationId,
      providerProductId: `product-${randomUUID()}`,
    })
    const observation = await createTestUnprojectedProviderObservation({
      userId: fixture.userId,
      provider: 'apple_app_store',
      environment: 'test',
      applicationId,
      membershipProductId: winnerSku.id,
      membershipProviderProductId: product.id,
      sourceKind: 'family',
      effectiveAt: new Date((start + 30) * 1000),
      expiresAt: new Date('2040-01-01T00:00:00Z'),
    })
    await using query = await beginTransaction()
    const result = await projectVerifiedProviderMembershipObservation(
      {
        userId: fixture.userId,
        membershipProviderObservationId: observation.membershipProviderObservationId,
      },
      { query },
    )
    expect(result.projected).toBe(true)
    await expect(
      getLockedIneligiblePurchaseReversalCase(
        { ...fixture.lookup, subscriptionId: fixture.subscriptionId },
        query,
      ),
    ).resolves.toMatchObject({ refundCapMinorUnits: 700, winningSourceKind: 'family' })
    await query.rollback()
  })

  it.each(['apple_app_store', 'google_play', 'microsoft_store'] as const)(
    'records a purchase overlapping a direct %s winner',
    async provider => {
      const fixture = await setupPurchase(start, end, provider)
      await expect(fixture.detect()).resolves.toBe(true)
      await expect(getIneligiblePurchaseReversalCase(fixture.lookup)).resolves.toMatchObject({
        winningSourceKind: 'direct',
        refundCapMinorUnits: 1001,
        subscriptionId: fixture.subscriptionId,
      })
    },
  )

  it('does not reverse a higher-tier Stripe purchase against family access', async () => {
    const fixture = await setupPurchase(start, end, 'family', 'pro')
    await expect(fixture.detect()).resolves.toBe(false)
    await expect(getIneligiblePurchaseReversalCase(fixture.lookup)).resolves.toBeNull()
  })

  it('rejects an unrelated line without creating a case', async () => {
    const fixture = await setupPurchase(start, end)
    fixture.lines.push({ ...fixture.lines[0]! })
    await expect(fixture.detect()).rejects.toThrow('ambiguous membership purchase lines')
    await expect(getIneligiblePurchaseReversalCase(fixture.lookup)).resolves.toBeNull()
  })

  it('ignores an unmapped price without creating a case', async () => {
    const fixture = await setupPurchase(start, end)
    fixture.lines[0]!.pricing.price_details.price = `price_other_${randomUUID()}`
    await expect(fixture.detect()).resolves.toBe(false)
    await expect(getIneligiblePurchaseReversalCase(fixture.lookup)).resolves.toBeNull()
  })

  it('rejects an invoice whose subscription environment differs from the event', async () => {
    const fixture = await setupPurchase(start, end)
    fixture.subscription.livemode = false
    await expect(fixture.detect()).rejects.toThrow(
      `Stripe invoice ${fixture.invoice.id} environment does not match its subscription`,
    )
    await expect(getIneligiblePurchaseReversalCase(fixture.lookup)).resolves.toBeNull()
  })

  it('rejects a purchase intent that does not identify this invoice price', async () => {
    const fixture = await setupPurchase(start, end)
    fixture.subscription.metadata.membership_purchase_intent_id = randomUUID()
    await expect(fixture.detect()).rejects.toThrow(
      `Stripe subscription ${fixture.subscriptionId} has an invalid purchase intent`,
    )
    await expect(getIneligiblePurchaseReversalCase(fixture.lookup)).resolves.toBeNull()
  })
})
