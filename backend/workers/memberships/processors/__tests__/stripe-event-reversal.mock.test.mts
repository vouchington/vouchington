import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createTestSku,
  createTestUser,
  getTestIneligiblePurchaseReversal,
} from '@voucha/test-helpers'
import {
  getStripeDisputeSettlementForPayment,
  getWonStripeDisputeInvoice,
} from '@modules/stripe/disputes'
import { listAllStripeSubscriptionInvoices } from '@modules/stripe/invoices'
import { createStripeRefund, listStripeRefundsForPaymentPage } from '@modules/stripe/refunds'
import { createMembership } from '@services/memberships'
import { claimIneligiblePurchaseReversals } from '@services/memberships/ineligible-stripe-purchase-reversal/claim-ledger'
import {
  completeIneligiblePurchaseReversal,
  markIneligiblePurchaseReversalCompleted,
} from '@services/memberships/ineligible-stripe-purchase-reversal-execution'
import { getStripeEventByStripeEventId, insertStripeEvent } from '@services/stripe/events'
import { createStripeEvent, toJobData } from '../stripe-event-test-fixtures.mts'
import { processStripeEvent } from '../stripe-event.mts'

const {
  mockCreateStripeRefund,
  mockGetStripeDisputeSettlementForPayment,
  mockGetWonStripeDisputeInvoice,
  mockListStripeRefundsForPaymentPage,
  mockListAllStripeSubscriptionInvoices,
} = vi.hoisted(() => ({
  mockCreateStripeRefund: vi.fn<typeof createStripeRefund>(),
  mockGetStripeDisputeSettlementForPayment: vi.fn<typeof getStripeDisputeSettlementForPayment>(),
  mockGetWonStripeDisputeInvoice: vi.fn<typeof getWonStripeDisputeInvoice>(),
  mockListStripeRefundsForPaymentPage: vi.fn<typeof listStripeRefundsForPaymentPage>(),
  mockListAllStripeSubscriptionInvoices: vi.fn<typeof listAllStripeSubscriptionInvoices>(),
}))

vi.mock<typeof import('@modules/stripe/disputes')>(
  import('@modules/stripe/disputes'),
  async importActual => ({
    ...(await importActual()),
    getStripeDisputeSettlementForPayment: mockGetStripeDisputeSettlementForPayment,
    getWonStripeDisputeInvoice: mockGetWonStripeDisputeInvoice,
  }),
)
vi.mock<typeof import('@modules/stripe/invoices')>(
  import('@modules/stripe/invoices'),
  async importActual => ({
    ...(await importActual()),
    listAllStripeSubscriptionInvoices: mockListAllStripeSubscriptionInvoices,
  }),
)
vi.mock<typeof import('@modules/stripe/refunds')>(
  import('@modules/stripe/refunds'),
  async importActual => ({
    ...(await importActual()),
    createStripeRefund: mockCreateStripeRefund,
    listStripeRefundsForPaymentPage: mockListStripeRefundsForPaymentPage,
  }),
)

describe('processStripeEvent InvoicePayment reversal reconciliation', () => {
  beforeEach(() => {
    mockCreateStripeRefund.mockReset()
    mockGetStripeDisputeSettlementForPayment.mockReset()
    mockGetWonStripeDisputeInvoice.mockReset()
    mockListStripeRefundsForPaymentPage.mockReset()
    mockListAllStripeSubscriptionInvoices.mockReset()
  })

  it('reconciles a matching durable case exactly once and ignores another invoice', async () => {
    const user = await createTestUser()
    const currentSku = await createTestSku({ plan: 'plus' })
    await createMembership({
      userId: user.id,
      plan: 'plus',
      skuId: currentSku.id,
      stripeSubscriptionId: `sub_invoice_payment_current_${randomUUID()}`,
      providerEnvironment: 'production',
    })
    const sku = await createTestSku({ plan: 'pro' })
    const subscriptionId = `sub_invoice_payment_${randomUUID()}`
    const invoiceId = `in_invoice_payment_${randomUUID()}`
    const reversalCase = (await claimIneligiblePurchaseReversals(
      {
        customerId: `cus_invoice_payment_${randomUUID()}`,
        effectiveAt: undefined,
        expiresAt: undefined,
        incomingPlan: 'pro',
        incomingStatus: 'active',
        originatingInvoiceId: invoiceId,
        providerEnvironment: 'production',
        sku,
        stripePriceId: sku.stripe_price_id,
        subscriptionId,
        userId: user.id,
      },
      [],
      { currency: 'usd', qualifyingAmountMinorUnits: 100 },
    ))!
    await markIneligiblePurchaseReversalCompleted(reversalCase.cancellation!)
    const chargeId = `ch_invoice_payment_${randomUUID()}`
    mockListAllStripeSubscriptionInvoices.mockResolvedValue([
      {
        created: 1_893_369_600,
        currency: 'usd',
        id: invoiceId,
        payments: {
          data: [{ amount_paid: 100, payment: { charge: chargeId, type: 'charge' } }],
        },
        status: 'paid',
      },
    ] as never)
    mockListStripeRefundsForPaymentPage.mockResolvedValue({
      hasMore: false,
      nextCursor: undefined,
      refunds: [],
    })
    mockGetStripeDisputeSettlementForPayment.mockResolvedValue({
      lostDisputeAmountMinorUnits: 0,
      refundDeferred: false,
    })
    mockCreateStripeRefund.mockResolvedValue({
      amount: 100,
      currency: 'usd',
      id: `re_invoice_payment_${randomUUID()}`,
      status: 'succeeded',
    } as never)

    const event = createStripeEvent('invoice_payment.paid', {
      id: `ip_invoice_payment_${randomUUID()}`,
      invoice: invoiceId,
      object: 'invoice_payment',
    })
    event.livemode = true
    const stored = await insertStripeEvent(event)
    const job = toJobData(stored)

    await processStripeEvent(job)
    await processStripeEvent(job)

    expect(mockCreateStripeRefund).toHaveBeenCalledOnce()
    expect(mockCreateStripeRefund).toHaveBeenCalledWith(
      expect.objectContaining({ amountMinorUnits: 100, chargeId }),
    )
    await expect(
      getTestIneligiblePurchaseReversal(subscriptionId, 'production'),
    ).resolves.toMatchObject({ completed_at: expect.any(Date) })
    await expect(getStripeEventByStripeEventId(event.id)).resolves.toMatchObject({
      status: 'processed',
    })

    const unrelatedEvent = createStripeEvent('invoice_payment.paid', {
      id: `ip_unrelated_${randomUUID()}`,
      invoice: `in_unrelated_${randomUUID()}`,
      object: 'invoice_payment',
    })
    unrelatedEvent.livemode = true
    const unrelated = await insertStripeEvent(unrelatedEvent)
    await processStripeEvent(toJobData(unrelated))

    expect(mockCreateStripeRefund).toHaveBeenCalledOnce()
    await expect(getStripeEventByStripeEventId(unrelatedEvent.id)).resolves.toMatchObject({
      status: 'processed',
    })
  })

  it('recovers a completed lost-dispute receipt once from a persisted dispute event', async () => {
    const user = await createTestUser()
    const currentSku = await createTestSku({ plan: 'plus' })
    await createMembership({
      userId: user.id,
      plan: 'plus',
      providerEnvironment: 'production',
      skuId: currentSku.id,
      stripeSubscriptionId: `sub_dispute_recovery_current_${randomUUID()}`,
    })
    const sku = await createTestSku({ plan: 'pro' })
    const amountMinorUnits = 1_000
    const subscriptionId = `sub_dispute_recovery_${randomUUID()}`
    const invoiceId = `in_dispute_recovery_${randomUUID()}`
    const chargeId = `ch_dispute_recovery_${randomUUID()}`
    const claim = (await claimIneligiblePurchaseReversals(
      {
        customerId: `cus_dispute_recovery_${randomUUID()}`,
        effectiveAt: undefined,
        expiresAt: undefined,
        incomingPlan: 'pro',
        incomingStatus: 'active',
        originatingInvoiceId: invoiceId,
        providerEnvironment: 'production',
        sku,
        stripePriceId: sku.stripe_price_id,
        subscriptionId,
        userId: user.id,
      },
      [
        {
          amountMinorUnits: 0,
          chargeId: null,
          currency: 'usd',
          externallySatisfiedMinorUnits: amountMinorUnits,
          invoiceId,
          paymentIntentId: 'pi_dispute_recovery',
          qualifyingAmountMinorUnits: amountMinorUnits,
        },
      ],
      { currency: 'usd', qualifyingAmountMinorUnits: amountMinorUnits },
    ))!
    await markIneligiblePurchaseReversalCompleted(claim.cancellation!)
    await completeIneligiblePurchaseReversal(claim.reversals[0]!, {
      amountMinorUnits: 0,
      providerRefundId: null,
    })
    mockGetWonStripeDisputeInvoice.mockResolvedValue({
      chargeId,
      invoiceIds: [invoiceId],
      paymentIntentId: 'pi_dispute_recovery',
    })
    mockListAllStripeSubscriptionInvoices.mockResolvedValue([
      {
        created: 1_893_369_600,
        currency: 'usd',
        id: invoiceId,
        payments: {
          data: [
            {
              amount_paid: amountMinorUnits,
              payment: { payment_intent: 'pi_dispute_recovery', type: 'payment_intent' },
            },
          ],
        },
        status: 'paid',
      },
    ] as never)
    mockListStripeRefundsForPaymentPage.mockResolvedValue({
      hasMore: false,
      nextCursor: undefined,
      refunds: [],
    })
    mockGetStripeDisputeSettlementForPayment.mockResolvedValue({
      lostDisputeAmountMinorUnits: 0,
      refundDeferred: false,
    })
    mockCreateStripeRefund.mockResolvedValue({
      amount: amountMinorUnits,
      currency: 'usd',
      id: `re_dispute_recovery_${randomUUID()}`,
      status: 'succeeded',
    } as never)
    const disputeId = `dp_dispute_recovery_${randomUUID()}`
    const event = createStripeEvent('charge.dispute.closed', {
      charge: chargeId,
      id: disputeId,
      object: 'dispute',
      status: 'won',
    })
    event.livemode = true
    const stored = await insertStripeEvent(event)

    await processStripeEvent(toJobData(stored))
    await processStripeEvent(toJobData(stored))

    const reorderedLostEvent = createStripeEvent('charge.dispute.closed', {
      charge: chargeId,
      id: disputeId,
      object: 'dispute',
      status: 'lost',
    })
    reorderedLostEvent.livemode = true
    await processStripeEvent(toJobData(await insertStripeEvent(reorderedLostEvent)))

    expect(mockCreateStripeRefund).toHaveBeenCalledOnce()
    expect(mockCreateStripeRefund).toHaveBeenCalledWith(
      expect.objectContaining({ amountMinorUnits, paymentIntentId: 'pi_dispute_recovery' }),
    )
    await expect(getStripeEventByStripeEventId(event.id)).resolves.toMatchObject({
      status: 'processed',
    })
    await expect(getStripeEventByStripeEventId(reorderedLostEvent.id)).resolves.toMatchObject({
      status: 'processed',
    })
  })
})
