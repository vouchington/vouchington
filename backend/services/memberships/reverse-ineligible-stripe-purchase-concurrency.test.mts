import { describe, expect, it, vi } from 'vitest'
import {
  createTestSku,
  createTestUser,
  getTestIneligiblePurchaseReversal,
} from '@voucha/test-helpers'
import { createMembership } from './index.mts'
import {
  reverseIneligibleStripePurchase,
  type IneligibleStripePurchaseOperations,
} from './reverse-ineligible-stripe-purchase.mts'

describe('reverseIneligibleStripePurchase', () => {
  it('records a completed zero refund for a fully externally satisfied payment target', async () => {
    const member = await createTestUser()
    const currentSku = await createTestSku({ plan: 'plus' })
    await createMembership({
      userId: member.id,
      plan: 'plus',
      skuId: currentSku.id,
      stripeSubscriptionId: `sub_current_zero_${member.id}`,
      providerEnvironment: 'production',
    })
    const incomingSku = await createTestSku({ plan: 'pro' })
    const subscriptionId = `sub_zero_reversal_${member.id}`
    const invoiceId = `in_zero_reversal_${member.id}`
    const chargeId = `ch_zero_reversal_${member.id}`
    const cancelSubscriptionImmediately =
      vi.fn<IneligibleStripePurchaseOperations['cancelSubscriptionImmediately']>()
    const createRefund = vi.fn<IneligibleStripePurchaseOperations['createRefund']>()

    await expect(
      reverseIneligibleStripePurchase({
        customerId: `cus_zero_reversal_${member.id}`,
        effectiveAt: undefined,
        expiresAt: undefined,
        incomingPlan: 'pro',
        incomingStatus: 'active',
        originatingInvoiceId: invoiceId,
        operations: {
          cancelSubscriptionImmediately,
          createRefund,
          getDisputeSettlementForPayment: vi
            .fn<NonNullable<IneligibleStripePurchaseOperations['getDisputeSettlementForPayment']>>()
            .mockResolvedValue({ lostDisputeAmountMinorUnits: 0, refundDeferred: false }),
          listRefundsForPaymentPage: vi
            .fn<IneligibleStripePurchaseOperations['listRefundsForPaymentPage']>()
            .mockResolvedValue({
              hasMore: false,
              nextCursor: undefined,
              refunds: [
                { amount: 100, currency: 'usd', id: 're_external_zero', status: 'succeeded' },
              ],
            } as never),
          listSubscriptionInvoices: vi
            .fn<IneligibleStripePurchaseOperations['listSubscriptionInvoices']>()
            .mockResolvedValue([
              {
                created: 1_893_369_600,
                currency: 'usd',
                id: invoiceId,
                lines: matchingInvoiceLines(100, 'usd', incomingSku.stripe_price_id),
                payments: {
                  data: [{ amount_paid: 100, payment: { type: 'charge', charge: chargeId } }],
                },
                status: 'paid',
              },
            ] as never),
        },
        providerEnvironment: 'production',
        sku: incomingSku,
        stripePriceId: incomingSku.stripe_price_id,
        subscriptionId,
        userId: member.id,
      }),
    ).resolves.toBe(true)

    expect(cancelSubscriptionImmediately).toHaveBeenCalledOnce()
    expect(createRefund).not.toHaveBeenCalled()
    await expect(
      getTestIneligiblePurchaseReversal(subscriptionId, 'production'),
    ).resolves.toMatchObject({
      amount_minor_units: '0',
      completed_at: expect.any(Date),
      provider_refund_id: null,
    })
  })

  it('limits concurrent Stripe refund calls', async () => {
    const member = await createTestUser()
    const currentSku = await createTestSku({ plan: 'plus' })
    await createMembership({
      userId: member.id,
      plan: 'plus',
      skuId: currentSku.id,
      stripeSubscriptionId: `sub_current_bounded_${member.id}`,
      providerEnvironment: 'production',
    })
    const incomingSku = await createTestSku({ plan: 'pro' })
    const subscriptionId = `sub_bounded_reversal_${member.id}`
    const invoiceId = `in_bounded_reversal_${member.id}`
    const cancelSubscriptionImmediately =
      vi.fn<IneligibleStripePurchaseOperations['cancelSubscriptionImmediately']>()
    const listSubscriptionInvoices =
      vi.fn<IneligibleStripePurchaseOperations['listSubscriptionInvoices']>()
    const listRefundsForPaymentPage =
      vi.fn<IneligibleStripePurchaseOperations['listRefundsForPaymentPage']>()
    const releaseRefunds: (() => void)[] = []
    let activeRefunds = 0
    let maxActiveRefunds = 0
    let signalFirstBatchStarted: (() => void) | undefined
    const firstBatchStarted = new Promise<void>(resolve => {
      signalFirstBatchStarted = resolve
    })
    const createRefund = vi
      .fn<IneligibleStripePurchaseOperations['createRefund']>()
      .mockImplementation(async options => {
        activeRefunds += 1
        maxActiveRefunds = Math.max(maxActiveRefunds, activeRefunds)
        if (activeRefunds === 3) signalFirstBatchStarted?.()
        await new Promise<void>(resolve => {
          releaseRefunds.push(resolve)
        })
        activeRefunds -= 1
        return {
          id: `re_bounded_${options.chargeId}`,
          amount: options.amountMinorUnits,
          currency: 'usd',
          status: 'succeeded',
        } as never
      })
    listSubscriptionInvoices.mockResolvedValue([
      {
        id: invoiceId,
        status: 'paid',
        amount_paid: 400,
        currency: 'usd',
        created: 1_893_369_600,
        description: null,
        lines: matchingInvoiceLines(400, 'usd', incomingSku.stripe_price_id),
        payments: {
          data: Array.from({ length: 4 }, (_, index) => ({
            amount_paid: 100,
            payment: {
              type: 'charge',
              charge: `ch_bounded_reversal_${member.id}_${index}`,
            },
          })),
        },
      },
    ] as never)
    listRefundsForPaymentPage.mockResolvedValue({
      hasMore: false,
      nextCursor: undefined,
      refunds: [],
    })
    const reversal = reverseIneligibleStripePurchase({
      customerId: `cus_bounded_reversal_${member.id}`,
      effectiveAt: undefined,
      expiresAt: undefined,
      incomingPlan: 'pro',
      incomingStatus: 'active',
      originatingInvoiceId: invoiceId,
      operations: {
        cancelSubscriptionImmediately,
        createRefund,
        getDisputeSettlementForPayment: vi
          .fn<NonNullable<IneligibleStripePurchaseOperations['getDisputeSettlementForPayment']>>()
          .mockResolvedValue({ lostDisputeAmountMinorUnits: 0, refundDeferred: false }),
        listSubscriptionInvoices,
        listRefundsForPaymentPage,
      },
      providerEnvironment: 'production',
      sku: incomingSku,
      stripePriceId: incomingSku.stripe_price_id,
      subscriptionId,
      userId: member.id,
    })

    await firstBatchStarted
    expect(createRefund).toHaveBeenCalledTimes(3)
    expect(maxActiveRefunds).toBe(3)

    for (const releaseRefund of releaseRefunds.splice(0)) releaseRefund()
    await vi.waitFor(() => expect(createRefund).toHaveBeenCalledTimes(4))
    expect(maxActiveRefunds).toBe(3)

    for (const releaseRefund of releaseRefunds.splice(0)) releaseRefund()
    await expect(reversal).resolves.toBe(true)
    expect(cancelSubscriptionImmediately).toHaveBeenCalledOnce()
  })

  it('lets concurrent reversals claim only one Stripe cancellation and refund', async () => {
    const member = await createTestUser()
    const currentSku = await createTestSku({ plan: 'plus' })
    await createMembership({
      userId: member.id,
      plan: 'plus',
      skuId: currentSku.id,
      stripeSubscriptionId: `sub_current_competing_${member.id}`,
      providerEnvironment: 'production',
    })
    const incomingSku = await createTestSku({ plan: 'pro' })
    const subscriptionId = `sub_competing_reversal_${member.id}`
    const invoiceId = `in_competing_reversal_${member.id}`
    const target = {
      amountMinorUnits: 100,
      chargeId: `ch_competing_reversal_${member.id}`,
      currency: 'usd',
      paymentIntentId: null,
      qualifyingAmountMinorUnits: 100,
    }
    let signalCancellationStarted: (() => void) | undefined
    const cancellationEntered = new Promise<void>(resolve => {
      signalCancellationStarted = resolve
    })
    let releaseCancellation: (() => void) | undefined
    const cancelSubscriptionImmediately =
      vi.fn<IneligibleStripePurchaseOperations['cancelSubscriptionImmediately']>()
    cancelSubscriptionImmediately.mockImplementation(async () => {
      signalCancellationStarted?.()
      await new Promise<void>(resolve => {
        releaseCancellation = resolve
      })
      return undefined as never
    })
    const createRefund = vi
      .fn<IneligibleStripePurchaseOperations['createRefund']>()
      .mockResolvedValue({
        amount: target.amountMinorUnits,
        currency: target.currency,
        id: `re_competing_reversal_${member.id}`,
        status: 'succeeded',
      } as never)
    const operations = {
      cancelSubscriptionImmediately,
      createRefund,
      getDisputeSettlementForPayment: vi
        .fn<NonNullable<IneligibleStripePurchaseOperations['getDisputeSettlementForPayment']>>()
        .mockResolvedValue({ lostDisputeAmountMinorUnits: 0, refundDeferred: false }),
      listRefundsForPaymentPage: vi
        .fn<IneligibleStripePurchaseOperations['listRefundsForPaymentPage']>()
        .mockResolvedValue({ hasMore: false, nextCursor: undefined, refunds: [] }),
      listSubscriptionInvoices: vi
        .fn<IneligibleStripePurchaseOperations['listSubscriptionInvoices']>()
        .mockResolvedValue([
          {
            created: 1_893_369_600,
            currency: target.currency,
            id: invoiceId,
            lines: matchingInvoiceLines(
              target.amountMinorUnits,
              target.currency,
              incomingSku.stripe_price_id,
            ),
            payments: {
              data: [
                {
                  amount_paid: target.amountMinorUnits,
                  payment: { type: 'charge', charge: target.chargeId },
                },
              ],
            },
            status: 'paid',
          },
        ] as never),
    }
    const reverse = () =>
      reverseIneligibleStripePurchase({
        customerId: `cus_competing_reversal_${member.id}`,
        effectiveAt: undefined,
        expiresAt: undefined,
        incomingPlan: 'pro',
        incomingStatus: 'active',
        originatingInvoiceId: invoiceId,
        operations,
        providerEnvironment: 'production',
        sku: incomingSku,
        stripePriceId: incomingSku.stripe_price_id,
        subscriptionId,
        userId: member.id,
      })

    const first = reverse()
    await cancellationEntered
    const second = reverse()
    await expect(second).rejects.toThrow('is already executing')
    releaseCancellation?.()
    await expect(first).resolves.toBe(true)

    expect(cancelSubscriptionImmediately).toHaveBeenCalledOnce()
    expect(createRefund).toHaveBeenCalledOnce()
  })
})

function matchingInvoiceLines(amount: number, currency: string, stripePriceId: string) {
  return {
    data: [{ amount, currency, pricing: { price_details: { price: stripePriceId } } }],
  }
}
