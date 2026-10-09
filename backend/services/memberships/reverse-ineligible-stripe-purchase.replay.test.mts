import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createTestSku,
  createTestUser,
  getTestIneligiblePurchaseReversal,
} from '@voucha/test-helpers'
import * as stripeClientModule from '@modules/stripe/client'
import { createProviderReplay } from '../../test-helpers/provider-replay.mts'
import {
  createReplayStripeClient,
  loadStripeFixture,
  routeStripeReplay,
  stripeFormBody,
} from '../../test-helpers/stripe-replay.mts'
import { createMembership } from './create.mts'
import { createIneligiblePurchaseReversalIdempotencyKey } from './ineligible-stripe-purchase-reversal-idempotency.mts'
import { reconcileRecordedIneligibleStripePurchaseReversal } from './reconcile-recorded-ineligible-stripe-purchase-reversal.mts'
import { reverseIneligibleStripePurchase } from './reverse-ineligible-stripe-purchase.mts'

// The recorded Stripe responses (invoices, lines, refunds, disputes, cancellation, refund create)
// feed the real `getStripeOperations()` through the real Stripe SDK, so the target amounts and the
// refund request come from actual wire JSON. `reverse-ineligible-stripe-purchase.test.mts` keeps
// the branch logic against injected operations. Stripe itself enforcing an idempotency key stays
// with the live smoke checks: here we pin the key we send and what we do with a replayed response.
// Routes answer by method and path, so how many times the refund scan re-reads is not pinned.
const replay = createProviderReplay()
const routes = routeStripeReplay(replay)
const stripe = createReplayStripeClient(routes.fetch)

describe('reverseIneligibleStripePurchase against recorded Stripe responses', () => {
  beforeEach(() => {
    replay.reset()
    routes.reset()
    vi.spyOn(stripeClientModule, 'getStripeClient').mockReturnValue(stripe)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('cancels, then refunds the paid charge under the key derived for that target', async () => {
    const scenario = await createScenario()
    scenario.serveReversal({ invoices: 'invoices-list-paid-one-charge.http', refundAmount: 1_000 })

    await expect(reverseIneligibleStripePurchase(scenario.purchase)).resolves.toBe(true)

    const methods = replay.requests.map(request => request.method)
    expect(methods.filter(method => method === 'DELETE')).toHaveLength(1)
    expect(scenario.refundRequests()).toHaveLength(1)
    expect(methods.indexOf('DELETE')).toBeLessThan(methods.indexOf('POST'))
    const refund = scenario.refundRequests()[0]!
    expect(refund.headers['idempotency-key']).toBe(scenario.reversalKey())
    expect(refund.headers['idempotency-key']).toMatch(
      /^voucha-membership-ineligible-reversal:[0-9a-f]{64}$/,
    )
    expect(Object.fromEntries(stripeFormBody(refund))).toEqual({
      charge: scenario.tokens.CHARGE_ID,
      amount: '1000',
    })
    await expect(
      getTestIneligiblePurchaseReversal(scenario.purchase.subscriptionId, 'production'),
    ).resolves.toMatchObject({
      amount_minor_units: '1000',
      completed_at: expect.any(Date),
      provider_refund_id: scenario.tokens.REFUND_ID,
      qualifying_amount_minor_units: '1000',
      receipt_amount_minor_units: '1000',
    })
    routes.assertAnswered()
  })

  it('refunds only the successful allocation of a partly paid open invoice', async () => {
    const scenario = await createScenario()
    scenario.serveReversal({
      invoices: 'invoices-list-open-partial-payment.http',
      refundAmount: 400,
    })

    await expect(reverseIneligibleStripePurchase(scenario.purchase)).resolves.toBe(true)

    // The declined payment attempt on the same invoice is neither a target nor a refund parameter.
    expect(scenario.refundRequests()).toHaveLength(1)
    expect(Object.fromEntries(stripeFormBody(scenario.refundRequests()[0]!))).toEqual({
      charge: scenario.tokens.CHARGE_ID,
      amount: '400',
    })
    await expect(
      getTestIneligiblePurchaseReversal(scenario.purchase.subscriptionId, 'production'),
    ).resolves.toMatchObject({
      amount_minor_units: '400',
      completed_at: expect.any(Date),
      provider_refund_id: scenario.tokens.REFUND_ID,
      qualifying_amount_minor_units: '400',
    })
    routes.assertAnswered()
  })

  it('refunds only what an earlier Stripe refund on the charge left', async () => {
    const scenario = await createScenario()
    scenario.serveReversal({
      earlierRefundAmount: 300,
      invoices: 'invoices-list-paid-one-charge.http',
      refundAmount: 700,
    })

    await expect(reverseIneligibleStripePurchase(scenario.purchase)).resolves.toBe(true)

    expect(Object.fromEntries(stripeFormBody(scenario.refundRequests()[0]!))).toEqual({
      charge: scenario.tokens.CHARGE_ID,
      amount: '700',
    })
    await expect(
      getTestIneligiblePurchaseReversal(scenario.purchase.subscriptionId, 'production'),
    ).resolves.toMatchObject({
      amount_minor_units: '700',
      qualifying_amount_minor_units: '1000',
    })
    routes.assertAnswered()
  })

  it('retries a rejected refund under the same key and accepts the response Stripe replays', async () => {
    const scenario = await createScenario()
    scenario.serveReversal({
      invoices: 'invoices-list-paid-one-charge.http',
      refundAmount: 1_000,
      refundCreate: [
        'refund-create-rate-limited-429.http',
        'refund-created-succeeded-idempotent-replay.http',
      ],
    })

    await expect(reverseIneligibleStripePurchase(scenario.purchase)).rejects.toMatchObject({
      code: 'rate_limit',
    })
    await expect(
      getTestIneligiblePurchaseReversal(scenario.purchase.subscriptionId, 'production'),
    ).resolves.toMatchObject({ completed_at: null, provider_refund_id: null })

    await expect(
      reconcileRecordedIneligibleStripePurchaseReversal({
        originatingInvoiceId: scenario.purchase.originatingInvoiceId,
        providerEnvironment: 'production',
      }),
    ).resolves.toBe(true)

    // The retry reuses the key, and the cancellation that already completed is not repeated.
    expect(scenario.refundRequests().map(request => request.headers['idempotency-key'])).toEqual([
      scenario.reversalKey(),
      scenario.reversalKey(),
    ])
    expect(replay.requests.filter(request => request.method === 'DELETE')).toHaveLength(1)
    await expect(
      getTestIneligiblePurchaseReversal(scenario.purchase.subscriptionId, 'production'),
    ).resolves.toMatchObject({
      completed_at: expect.any(Date),
      provider_refund_id: scenario.tokens.REFUND_ID,
      receipt_amount_minor_units: '1000',
    })
    routes.assertAnswered()
  })
})

async function createScenario() {
  const user = await createTestUser()
  const currentSku = await createTestSku({ plan: 'plus' })
  await createMembership({
    userId: user.id,
    plan: 'plus',
    skuId: currentSku.id,
    stripeSubscriptionId: `sub_replay_current_${randomUUID()}`,
    providerEnvironment: 'production',
  })
  const sku = await createTestSku({ plan: 'pro' })
  const suffix = randomUUID()
  const tokens = {
    CHARGE_ID: `ch_replay_${suffix}`,
    CUSTOMER_ID: `cus_replay_${suffix}`,
    EARLIER_REFUND_ID: `re_replay_earlier_${suffix}`,
    INVOICE_ID: `in_replay_${suffix}`,
    PRICE_ID: sku.stripe_price_id,
    REFUND_ID: `re_replay_${suffix}`,
    SUBSCRIPTION_ID: `sub_replay_${suffix}`,
  }
  return {
    purchase: {
      customerId: tokens.CUSTOMER_ID,
      effectiveAt: undefined,
      expiresAt: undefined,
      incomingPlan: 'pro' as const,
      incomingStatus: 'active' as const,
      originatingInvoiceId: tokens.INVOICE_ID,
      providerEnvironment: 'production' as const,
      sku,
      stripePriceId: sku.stripe_price_id,
      subscriptionId: tokens.SUBSCRIPTION_ID,
      userId: user.id,
    },
    tokens,
    refundRequests: () =>
      replay.requests.filter(
        request => request.method === 'POST' && new URL(request.url).pathname === '/v1/refunds',
      ),
    /** The key for the one charge the invoice fixtures pay; the amount is not part of it. */
    reversalKey: () =>
      createIneligiblePurchaseReversalIdempotencyKey(
        'production',
        'voucha-web',
        tokens.SUBSCRIPTION_ID,
        {
          amountMinorUnits: 0,
          chargeId: tokens.CHARGE_ID,
          currency: 'usd',
          invoiceId: tokens.INVOICE_ID,
          paymentIntentId: null,
          qualifyingAmountMinorUnits: 0,
        },
      ),
    /** Routes every Stripe call one reversal makes; each refund create gets its next answer. */
    serveReversal(options: {
      earlierRefundAmount?: number
      invoices: string
      refundAmount: number
      refundCreate?: string[]
    }) {
      const tokenValues = {
        ...tokens,
        EARLIER_REFUND_AMOUNT: String(options.earlierRefundAmount ?? 0),
        REFUND_AMOUNT: String(options.refundAmount),
      }
      const fixture = (name: string) => loadStripeFixture(name, tokenValues)
      routes.on('GET', '/v1/invoices', fixture(options.invoices))
      routes.on(
        'GET',
        `/v1/invoices/${tokens.INVOICE_ID}/lines`,
        fixture('invoice-lines-one-subscription-line.http'),
      )
      routes.on(
        'GET',
        '/v1/refunds',
        fixture(
          options.earlierRefundAmount
            ? 'refunds-list-one-succeeded.http'
            : 'refunds-list-empty.http',
        ),
      )
      routes.on('GET', '/v1/disputes', fixture('disputes-list-empty.http'))
      routes.on(
        'DELETE',
        `/v1/subscriptions/${tokens.SUBSCRIPTION_ID}`,
        fixture('subscription-canceled.http'),
      )
      routes.on(
        'POST',
        '/v1/refunds',
        ...(options.refundCreate ?? ['refund-created-succeeded.http']).map(fixture),
      )
    },
  }
}
