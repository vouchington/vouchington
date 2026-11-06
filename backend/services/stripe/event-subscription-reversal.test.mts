import { afterEach, describe, expect, it, vi } from 'vitest'
import * as stripeClientModule from '@modules/stripe/client'
import { createStripeEventReversalCase } from '@voucha/test-helpers/services/stripe/reversal-case-event-fixtures'
import { getTestIneligiblePurchaseReversal } from '@voucha/test-helpers'
import { handleInvoicePaymentPaid } from './event-subscription-handlers.mts'

function stubStripeInvoices() {
  const list = vi.fn<VitestLooseMock>().mockResolvedValue({ data: [], has_more: false })
  const retrieve = vi.fn<VitestLooseMock>().mockResolvedValue({ parent: null })
  vi.spyOn(stripeClientModule, 'getStripeClient').mockReturnValue({
    invoices: { list, retrieve },
  } as never)
  return list
}

describe('handleInvoicePaymentPaid', () => {
  afterEach(() => vi.restoreAllMocks())

  it('replays an existing case without retrieving detection metadata', async () => {
    const reversal = await createStripeEventReversalCase({
      providerApplicationId: 'voucha-web',
      providerEnvironment: 'production',
    })
    const refundId = `re_${crypto.randomUUID()}`
    const chargeId = `ch_${crypto.randomUUID()}`
    const retrieve = vi.fn<VitestLooseMock>().mockRejectedValue(new Error('metadata unavailable'))
    const createRefund = vi.fn<VitestLooseMock>().mockResolvedValue({
      id: refundId,
      amount: 100,
      currency: 'usd',
      status: 'succeeded',
    })
    const cancel = vi.fn<VitestLooseMock>().mockResolvedValue({})
    vi.spyOn(stripeClientModule, 'getStripeClient').mockReturnValue({
      invoices: {
        retrieve,
        list: vi.fn<VitestLooseMock>().mockResolvedValue({
          data: [
            {
              id: reversal.originatingInvoiceId,
              status: 'paid',
              currency: 'usd',
              created: 1_740_000_000,
              payments: {
                has_more: false,
                data: [
                  {
                    status: 'paid',
                    amount_paid: 100,
                    payment: { type: 'charge', charge: chargeId },
                  },
                ],
              },
            },
          ],
          has_more: false,
        }),
        listLineItems: vi.fn<VitestLooseMock>().mockResolvedValue({ data: [], has_more: false }),
      },
      refunds: {
        list: vi.fn<VitestLooseMock>().mockResolvedValue({ data: [], has_more: false }),
        create: createRefund,
      },
      disputes: { list: vi.fn<VitestLooseMock>().mockResolvedValue({ data: [], has_more: false }) },
      subscriptions: { cancel },
    } as unknown as ReturnType<typeof stripeClientModule.getStripeClient>)

    await expect(
      handleInvoicePaymentPaid({ invoice: reversal.originatingInvoiceId }, 'production'),
    ).resolves.toBeUndefined()
    expect(retrieve).not.toHaveBeenCalled()
    expect(cancel).toHaveBeenCalledWith(reversal.subscriptionId)
    expect(createRefund).toHaveBeenCalledWith(
      expect.objectContaining({ charge: chargeId, amount: 100 }),
      expect.anything(),
    )
    await expect(
      getTestIneligiblePurchaseReversal(reversal.subscriptionId, 'production'),
    ).resolves.toMatchObject({
      completed_at: expect.any(Date),
      provider_refund_id: refundId,
      receipt_amount_minor_units: '100',
    })
  })

  it('reconciles the immutable reversal case from the paid InvoicePayment invoice', async () => {
    const reversal = await createStripeEventReversalCase({
      providerApplicationId: 'voucha-web',
      providerEnvironment: 'production',
    })
    const list = stubStripeInvoices()

    await expect(
      handleInvoicePaymentPaid({ invoice: reversal.originatingInvoiceId }, 'production'),
    ).rejects.toThrow(
      `Stripe reversal invoice ${reversal.originatingInvoiceId} was not found exactly once`,
    )
    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({ subscription: reversal.subscriptionId }),
    )
  })

  it('does nothing when Stripe omits the InvoicePayment invoice identifier', async () => {
    const list = stubStripeInvoices()

    await expect(handleInvoicePaymentPaid({}, 'test')).resolves.toBeUndefined()

    expect(list).not.toHaveBeenCalled()
  })

  it('reconciles from an expanded InvoicePayment invoice', async () => {
    const reversal = await createStripeEventReversalCase({
      providerApplicationId: 'voucha-web',
      providerEnvironment: 'test',
    })
    const list = stubStripeInvoices()

    await expect(
      handleInvoicePaymentPaid({ invoice: { id: reversal.originatingInvoiceId } }, 'test'),
    ).rejects.toThrow(
      `Stripe reversal invoice ${reversal.originatingInvoiceId} was not found exactly once`,
    )
    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({ subscription: reversal.subscriptionId }),
    )
  })

  it('looks the reversal case up in the event provider environment', async () => {
    const reversal = await createStripeEventReversalCase({
      providerApplicationId: 'voucha-web',
      providerEnvironment: 'production',
    })
    const list = stubStripeInvoices()

    await expect(
      handleInvoicePaymentPaid({ invoice: reversal.originatingInvoiceId }, 'test'),
    ).resolves.toBeUndefined()

    expect(list).not.toHaveBeenCalled()
  })

  it('uses a custom membership application context for reversal reconciliation', async () => {
    const applicationContext = { applicationId: 'test-custom-stripe-context' }
    const reversal = await createStripeEventReversalCase({
      providerApplicationId: applicationContext.applicationId,
      providerEnvironment: 'test',
    })
    const list = stubStripeInvoices()

    await expect(
      handleInvoicePaymentPaid({ invoice: reversal.originatingInvoiceId }, 'test'),
    ).resolves.toBeUndefined()
    expect(list).not.toHaveBeenCalled()

    await expect(
      handleInvoicePaymentPaid(
        { invoice: reversal.originatingInvoiceId },
        'test',
        applicationContext,
      ),
    ).rejects.toThrow(
      `Stripe reversal invoice ${reversal.originatingInvoiceId} was not found exactly once`,
    )
    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({ subscription: reversal.subscriptionId }),
    )
  })
})
