import { afterEach, describe, expect, it, vi } from 'vitest'
import * as stripeClientModule from '@modules/stripe/client'
import { createStripeEventReversalCase } from '@voucha/test-helpers/services/stripe/reversal-case-event-fixtures'
import { handleChargeDisputeClosed } from './event-dispute-handlers.mts'

function stubWonDispute(invoiceId: string) {
  const retrieveDispute = vi
    .fn<VitestLooseMock>()
    .mockResolvedValue({ charge: 'ch_dispute_handler', status: 'won' })
  const listInvoices = vi.fn<VitestLooseMock>().mockResolvedValue({ data: [], has_more: false })
  vi.spyOn(stripeClientModule, 'getStripeClient').mockReturnValue({
    charges: {
      retrieve: vi
        .fn<VitestLooseMock>()
        .mockResolvedValue({ id: 'ch_dispute_handler', payment_intent: 'pi_dispute_handler' }),
    },
    disputes: { retrieve: retrieveDispute },
    invoicePayments: {
      list: vi.fn<VitestLooseMock>().mockResolvedValue({
        data: [{ id: 'inpay_dispute_handler', invoice: { id: invoiceId } }],
        has_more: false,
      }),
    },
    invoices: { list: listInvoices },
  } as never)
  return { listInvoices, retrieveDispute }
}

describe('handleChargeDisputeClosed', () => {
  afterEach(() => vi.restoreAllMocks())

  it('reconciles the reversal case of a won dispute', async () => {
    const reversal = await createStripeEventReversalCase({
      providerApplicationId: 'voucha-web',
      providerEnvironment: 'production',
    })
    const { listInvoices, retrieveDispute } = stubWonDispute(reversal.originatingInvoiceId)

    await expect(
      handleChargeDisputeClosed({ id: 'dp_dispute_handler' }, 'production'),
    ).rejects.toThrow(
      `Stripe reversal invoice ${reversal.originatingInvoiceId} was not found exactly once`,
    )
    expect(retrieveDispute).toHaveBeenCalledWith('dp_dispute_handler')
    expect(listInvoices).toHaveBeenCalledWith(
      expect.objectContaining({ subscription: reversal.subscriptionId }),
    )
  })

  it('does nothing when Stripe omits the dispute identifier', async () => {
    const { retrieveDispute } = stubWonDispute('in_unused')

    await expect(handleChargeDisputeClosed({}, 'test')).resolves.toBeUndefined()

    expect(retrieveDispute).not.toHaveBeenCalled()
  })

  it('looks the reversal case up in the event provider environment', async () => {
    const reversal = await createStripeEventReversalCase({
      providerApplicationId: 'voucha-web',
      providerEnvironment: 'production',
    })
    const { listInvoices } = stubWonDispute(reversal.originatingInvoiceId)

    await expect(
      handleChargeDisputeClosed({ id: 'dp_dispute_handler' }, 'test'),
    ).resolves.toBeUndefined()

    expect(listInvoices).not.toHaveBeenCalled()
  })

  it('passes a custom membership application context to dispute reversal reconciliation', async () => {
    const applicationContext = { applicationId: 'test-custom-stripe-context' }
    const reversal = await createStripeEventReversalCase({
      providerApplicationId: applicationContext.applicationId,
      providerEnvironment: 'test',
    })
    const { listInvoices } = stubWonDispute(reversal.originatingInvoiceId)

    await expect(
      handleChargeDisputeClosed({ id: 'dp_dispute_handler' }, 'test'),
    ).resolves.toBeUndefined()
    expect(listInvoices).not.toHaveBeenCalled()

    await expect(
      handleChargeDisputeClosed({ id: 'dp_dispute_handler' }, 'test', applicationContext),
    ).rejects.toThrow(
      `Stripe reversal invoice ${reversal.originatingInvoiceId} was not found exactly once`,
    )
    expect(listInvoices).toHaveBeenCalledWith(
      expect.objectContaining({ subscription: reversal.subscriptionId }),
    )
  })
})
