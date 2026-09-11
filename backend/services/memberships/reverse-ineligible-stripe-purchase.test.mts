import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { createTestSku, createTestUser } from '@voucha/test-helpers'
import { createMembership } from './create.mts'
import {
  reverseIneligibleStripePurchase,
  type IneligibleStripePurchaseOperations,
} from './reverse-ineligible-stripe-purchase.mts'
import { reconcileRecordedIneligibleStripePurchaseReversal } from './reconcile-recorded-ineligible-stripe-purchase-reversal.mts'

describe('reverseIneligibleStripePurchase', () => {
  it('does not call Stripe when no immutable reversal case matches the payment', async () => {
    const operations = createOperations()

    await expect(
      reconcileRecordedIneligibleStripePurchaseReversal({
        operations,
        originatingInvoiceId: `in_unrelated_${randomUUID()}`,
        providerEnvironment: 'production',
      }),
    ).resolves.toBe(false)

    expect(operations.listSubscriptionInvoices).not.toHaveBeenCalled()
  })

  it('does nothing when the user has no entitlement to protect', async () => {
    const sku = await createTestSku({ plan: 'pro' })

    await expect(
      reverseIneligibleStripePurchase(
        createPurchase((await createTestUser()).id, sku.id, sku.stripe_price_id),
      ),
    ).resolves.toBe(false)
  })

  it('recognizes the same active Stripe purchase as already converged', async () => {
    const user = await createTestUser()
    const sku = await createTestSku({ plan: 'pro' })
    const purchase = createPurchase(user.id, sku.id, sku.stripe_price_id)
    await createMembership({
      userId: user.id,
      plan: 'pro',
      skuId: sku.id,
      stripeSubscriptionId: purchase.subscriptionId,
      providerEnvironment: purchase.providerEnvironment,
    })
    const operations = createOperations()

    await expect(reverseIneligibleStripePurchase({ ...purchase, operations })).resolves.toBe(true)

    expect(operations.listSubscriptionInvoices).not.toHaveBeenCalled()
  })

  it('cancels and refunds an ineligible purchase after its durable claims commit', async () => {
    const { chargeId, operations, purchase } = await createIneligiblePurchaseFixture()
    operations.createRefund.mockResolvedValue({
      amount: 100,
      currency: 'usd',
      id: `re_reversal_${randomUUID()}`,
      status: 'succeeded',
    } as never)

    await expect(reverseIneligibleStripePurchase({ ...purchase, operations })).resolves.toBe(true)

    expect(operations.cancelSubscriptionImmediately).toHaveBeenCalledWith(purchase.subscriptionId)
    expect(operations.createRefund).toHaveBeenCalledWith({
      amountMinorUnits: 100,
      chargeId,
      idempotencyKey: expect.any(String),
      paymentIntentId: undefined,
    })
  })

  it('rejects an ineligible purchase whose originating invoice is absent', async () => {
    const { operations, purchase } = await createIneligiblePurchaseFixture()
    operations.listSubscriptionInvoices.mockResolvedValue([])

    await expect(reverseIneligibleStripePurchase({ ...purchase, operations })).rejects.toThrow(
      `Stripe reversal invoice ${purchase.originatingInvoiceId} was not found`,
    )
  })

  it('rejects duplicate provider results for the originating invoice', async () => {
    const { operations, purchase } = await createIneligiblePurchaseFixture()
    const invoice = (await operations.listSubscriptionInvoices(purchase.subscriptionId))[0]!
    operations.listSubscriptionInvoices.mockResolvedValue([invoice, { ...invoice }] as never)

    await expect(reverseIneligibleStripePurchase({ ...purchase, operations })).rejects.toThrow(
      `Stripe reversal invoice ${purchase.originatingInvoiceId} was not found exactly once`,
    )
  })

  it('rejects a malformed purchase without an originating invoice before calling Stripe', async () => {
    const { purchase } = await createIneligiblePurchaseFixture()
    const malformedPurchase = { ...purchase, originatingInvoiceId: undefined }

    await expect(reverseIneligibleStripePurchase(malformedPurchase as never)).rejects.toThrow(
      'missing its originating invoice',
    )
  })

  it('completes without another refund when Stripe already reports the full amount', async () => {
    const { operations, purchase } = await createIneligiblePurchaseFixture()
    operations.listRefundsForPaymentPage.mockResolvedValue({
      hasMore: false,
      nextCursor: undefined,
      refunds: [
        { amount: 100, currency: 'usd', id: `re_external_${randomUUID()}`, status: 'succeeded' },
      ],
    } as never)

    await expect(reverseIneligibleStripePurchase({ ...purchase, operations })).resolves.toBe(true)

    expect(operations.createRefund).not.toHaveBeenCalled()
  })

  it('durably fails the claims when Stripe returns a non-succeeded refund', async () => {
    const { operations, purchase } = await createIneligiblePurchaseFixture()
    operations.createRefund.mockResolvedValue({
      amount: 100,
      currency: 'usd',
      id: `re_pending_${randomUUID()}`,
      status: 'pending',
    } as never)

    await expect(reverseIneligibleStripePurchase({ ...purchase, operations })).rejects.toThrow(
      'refund is pending',
    )
  })

  it('defers an open dispute after cancellation and resumes automatically after it closes', async () => {
    const { chargeId, operations, purchase } = await createIneligiblePurchaseFixture()
    operations.getDisputeSettlementForPayment.mockResolvedValue({
      lostDisputeAmountMinorUnits: 0,
      refundDeferred: true,
    })

    await expect(reverseIneligibleStripePurchase({ ...purchase, operations })).rejects.toThrow(
      'deferred until Stripe reaches a terminal state',
    )
    expect(operations.cancelSubscriptionImmediately).toHaveBeenCalledWith(purchase.subscriptionId)
    expect(operations.createRefund).not.toHaveBeenCalled()

    operations.getDisputeSettlementForPayment.mockResolvedValue({
      lostDisputeAmountMinorUnits: 0,
      refundDeferred: false,
    })
    operations.createRefund.mockResolvedValue({
      amount: 100,
      currency: 'usd',
      id: `re_dispute_closed_${randomUUID()}`,
      status: 'succeeded',
    } as never)

    await expect(
      reconcileRecordedIneligibleStripePurchaseReversal({
        operations,
        originatingInvoiceId: purchase.originatingInvoiceId,
        providerEnvironment: purchase.providerEnvironment,
      }),
    ).resolves.toBe(true)
    expect(operations.createRefund).toHaveBeenCalledWith(
      expect.objectContaining({ amountMinorUnits: 100, chargeId }),
    )
  })

  it.each(['failed', 'canceled'] as const)(
    'cancels before deferring a pending refund and retries after it becomes %s',
    async terminalStatus => {
      const { chargeId, operations, purchase } = await createIneligiblePurchaseFixture()
      operations.listRefundsForPaymentPage.mockResolvedValue({
        hasMore: false,
        nextCursor: undefined,
        refunds: [
          { amount: 100, currency: 'usd', id: `re_pending_${randomUUID()}`, status: 'pending' },
        ],
      } as never)

      await expect(reverseIneligibleStripePurchase({ ...purchase, operations })).rejects.toThrow(
        'deferred until Stripe reaches a terminal state',
      )
      expect(operations.cancelSubscriptionImmediately).toHaveBeenCalledWith(purchase.subscriptionId)
      expect(operations.createRefund).not.toHaveBeenCalled()

      operations.listRefundsForPaymentPage.mockResolvedValue({
        hasMore: false,
        nextCursor: undefined,
        refunds: [
          {
            amount: 100,
            currency: 'usd',
            id: `re_terminal_${randomUUID()}`,
            status: terminalStatus,
          },
        ],
      } as never)
      operations.createRefund.mockResolvedValue({
        amount: 100,
        currency: 'usd',
        id: `re_retried_${randomUUID()}`,
        status: 'succeeded',
      } as never)

      await expect(
        reconcileRecordedIneligibleStripePurchaseReversal({
          operations,
          originatingInvoiceId: purchase.originatingInvoiceId,
          providerEnvironment: purchase.providerEnvironment,
        }),
      ).resolves.toBe(true)
      expect(operations.cancelSubscriptionImmediately).toHaveBeenCalledTimes(1)
      expect(operations.createRefund).toHaveBeenCalledWith(
        expect.objectContaining({ amountMinorUnits: 100, chargeId }),
      )
    },
  )
})

async function createIneligiblePurchaseFixture() {
  const user = await createTestUser()
  const currentSku = await createTestSku({ plan: 'plus' })
  await createMembership({
    userId: user.id,
    plan: 'plus',
    skuId: currentSku.id,
    stripeSubscriptionId: `sub_current_reversal_${randomUUID()}`,
    providerEnvironment: 'production',
  })
  const sku = await createTestSku({ plan: 'pro' })
  const purchase = createPurchase(user.id, sku.id, sku.stripe_price_id)
  const operations = createOperations()
  const chargeId = `ch_reversal_${randomUUID()}`
  operations.listSubscriptionInvoices.mockResolvedValue([
    {
      created: 1_893_369_600,
      currency: 'usd',
      id: purchase.originatingInvoiceId,
      lines: {
        data: [
          {
            amount: 100,
            currency: 'usd',
            pricing: { price_details: { price: purchase.stripePriceId } },
          },
        ],
      },
      payments: { data: [{ amount_paid: 100, payment: { charge: chargeId, type: 'charge' } }] },
      status: 'paid',
    },
  ] as never)
  operations.listRefundsForPaymentPage.mockResolvedValue({
    hasMore: false,
    nextCursor: undefined,
    refunds: [],
  })
  return { chargeId, operations, purchase }
}

function createPurchase(userId: string, skuId: string, stripePriceId: string) {
  const suffix = randomUUID()
  return {
    customerId: `cus_reversal_${suffix}`,
    effectiveAt: undefined,
    expiresAt: undefined,
    incomingPlan: 'pro' as const,
    incomingStatus: 'active' as const,
    originatingInvoiceId: `in_reversal_${suffix}`,
    providerEnvironment: 'production' as const,
    sku: { id: skuId },
    stripePriceId,
    subscriptionId: `sub_reversal_${suffix}`,
    userId,
  }
}

function createOperations() {
  return {
    cancelSubscriptionImmediately:
      vi.fn<IneligibleStripePurchaseOperations['cancelSubscriptionImmediately']>(),
    createRefund: vi.fn<IneligibleStripePurchaseOperations['createRefund']>(),
    getDisputeSettlementForPayment: vi
      .fn<NonNullable<IneligibleStripePurchaseOperations['getDisputeSettlementForPayment']>>()
      .mockResolvedValue({ lostDisputeAmountMinorUnits: 0, refundDeferred: false }),
    listRefundsForPaymentPage:
      vi.fn<IneligibleStripePurchaseOperations['listRefundsForPaymentPage']>(),
    listSubscriptionInvoices:
      vi.fn<IneligibleStripePurchaseOperations['listSubscriptionInvoices']>(),
    retrieveRefund: vi.fn<NonNullable<IneligibleStripePurchaseOperations['retrieveRefund']>>(),
  }
}
