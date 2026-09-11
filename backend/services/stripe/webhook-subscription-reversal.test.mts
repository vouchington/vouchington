import { describe, expect, it, vi } from 'vitest'
import { handleInvoicePaymentPaid } from './webhook-subscription-handlers.mts'

describe('handleInvoicePaymentPaid', () => {
  it('reconciles the immutable reversal case from the paid InvoicePayment invoice', async () => {
    const reconcile = vi
      .fn<
        (options: {
          originatingInvoiceId: string
          providerApplicationId?: string
          providerEnvironment: 'test' | 'production'
        }) => Promise<boolean>
      >()
      .mockResolvedValue(true)

    await handleInvoicePaymentPaid({ invoice: 'in_invoice_payment_paid' }, 'production', {
      reconcileRecordedIneligibleStripePurchaseReversal: reconcile,
    })

    expect(reconcile).toHaveBeenCalledWith({
      originatingInvoiceId: 'in_invoice_payment_paid',
      providerApplicationId: 'voucha-web',
      providerEnvironment: 'production',
    })
  })

  it('does nothing when Stripe omits the InvoicePayment invoice identifier', async () => {
    const reconcile =
      vi.fn<
        (options: {
          originatingInvoiceId: string
          providerApplicationId?: string
          providerEnvironment: 'test' | 'production'
        }) => Promise<boolean>
      >()

    await handleInvoicePaymentPaid({}, 'test', {
      reconcileRecordedIneligibleStripePurchaseReversal: reconcile,
    })

    expect(reconcile).not.toHaveBeenCalled()
  })

  it('reconciles from an expanded InvoicePayment invoice', async () => {
    const reconcile = vi
      .fn<
        (options: {
          originatingInvoiceId: string
          providerApplicationId?: string
          providerEnvironment: 'test' | 'production'
        }) => Promise<boolean>
      >()
      .mockResolvedValue(true)

    await handleInvoicePaymentPaid({ invoice: { id: 'in_expanded_invoice_payment' } }, 'test', {
      reconcileRecordedIneligibleStripePurchaseReversal: reconcile,
    })

    expect(reconcile).toHaveBeenCalledWith({
      originatingInvoiceId: 'in_expanded_invoice_payment',
      providerApplicationId: 'voucha-web',
      providerEnvironment: 'test',
    })
  })

  it('uses a custom membership application context for reversal reconciliation', async () => {
    const reconcile = vi
      .fn<
        (options: {
          originatingInvoiceId: string
          providerApplicationId?: string
          providerEnvironment: 'test' | 'production'
        }) => Promise<boolean>
      >()
      .mockResolvedValue(true)
    const applicationContext = { applicationId: 'test-custom-stripe-context' }

    await handleInvoicePaymentPaid(
      { invoice: 'in_custom_context_invoice_payment' },
      'test',
      { reconcileRecordedIneligibleStripePurchaseReversal: reconcile },
      applicationContext,
    )

    expect(reconcile).toHaveBeenCalledWith({
      originatingInvoiceId: 'in_custom_context_invoice_payment',
      providerApplicationId: applicationContext.applicationId,
      providerEnvironment: 'test',
    })
  })
})
