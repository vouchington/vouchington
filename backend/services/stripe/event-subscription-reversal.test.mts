import { afterEach, describe, expect, it, vi } from 'vitest'
import * as stripeClientModule from '@modules/stripe/client'
import { createStripeEventReversalCase } from '@voucha/test-helpers/services/stripe/reversal-case-event-fixtures'
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
