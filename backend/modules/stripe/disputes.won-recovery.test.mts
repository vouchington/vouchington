import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as stripeClientModule from '@modules/stripe/client'
import { getWonStripeDisputeInvoice } from './disputes.mts'
import { listAllStripeInvoicePaymentsForPaymentIntent } from './invoice-payments.mts'

describe('won Stripe dispute recovery lookup', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.restoreAllMocks())

  it('refetches a won dispute and resolves invoices through its PaymentIntent', async () => {
    const retrieveDispute = vi
      .fn<VitestLooseMock>()
      .mockResolvedValue({ charge: 'ch_won_recovery', status: 'won' })
    const retrieveCharge = vi
      .fn<VitestLooseMock>()
      .mockResolvedValue({ id: 'ch_won_recovery', payment_intent: 'pi_won_recovery' })
    const listInvoicePayments = vi.fn<VitestLooseMock>().mockResolvedValue({
      data: [{ id: 'inpay_won_recovery', invoice: { id: 'in_won_recovery' } }],
      has_more: false,
    })
    vi.spyOn(stripeClientModule, 'getStripeClient').mockReturnValue({
      charges: { retrieve: retrieveCharge },
      disputes: { retrieve: retrieveDispute },
      invoicePayments: { list: listInvoicePayments },
    } as never)

    await expect(getWonStripeDisputeInvoice('dp_won_recovery')).resolves.toEqual({
      chargeId: 'ch_won_recovery',
      invoiceIds: ['in_won_recovery'],
      paymentIntentId: 'pi_won_recovery',
    })
    expect(retrieveDispute).toHaveBeenCalledWith('dp_won_recovery')
    expect(retrieveCharge).toHaveBeenCalledWith('ch_won_recovery')
    expect(listInvoicePayments).toHaveBeenCalledWith({
      limit: 100,
      payment: { payment_intent: 'pi_won_recovery', type: 'payment_intent' },
      status: 'paid',
    })
  })

  it.each(['lost', 'needs_response'] as const)(
    'does not recover a %s dispute without querying its charge',
    async status => {
      const retrieveDispute = vi
        .fn<VitestLooseMock>()
        .mockResolvedValue({ charge: `ch_${status}_recovery`, status })
      const retrieveCharge = vi.fn<VitestLooseMock>()
      vi.spyOn(stripeClientModule, 'getStripeClient').mockReturnValue({
        charges: { retrieve: retrieveCharge },
        disputes: { retrieve: retrieveDispute },
      } as never)

      await expect(getWonStripeDisputeInvoice(`dp_${status}`)).resolves.toBeNull()
      expect(retrieveDispute).toHaveBeenCalledWith(`dp_${status}`)
      expect(retrieveCharge).not.toHaveBeenCalled()
    },
  )

  it('does not recover a won dispute without an authoritative invoice payment', async () => {
    const retrieveDispute = vi
      .fn<VitestLooseMock>()
      .mockResolvedValue({ charge: 'ch_missing_invoice', status: 'won' })
    const retrieveCharge = vi
      .fn<VitestLooseMock>()
      .mockResolvedValue({ id: 'ch_missing_invoice', payment_intent: 'pi_missing_invoice' })
    const listInvoicePayments = vi
      .fn<VitestLooseMock>()
      .mockResolvedValue({ data: [], has_more: false })
    vi.spyOn(stripeClientModule, 'getStripeClient').mockReturnValue({
      charges: { retrieve: retrieveCharge },
      disputes: { retrieve: retrieveDispute },
      invoicePayments: { list: listInvoicePayments },
    } as never)

    await expect(getWonStripeDisputeInvoice('dp_missing_invoice')).resolves.toBeNull()
    expect(retrieveDispute).toHaveBeenCalledWith('dp_missing_invoice')
    expect(retrieveCharge).toHaveBeenCalledWith('ch_missing_invoice')
  })

  it('rejects empty and unbounded PaymentIntent invoice-payment pagination', async () => {
    const list = vi.fn<VitestLooseMock>().mockResolvedValue({ data: [], has_more: true })
    vi.spyOn(stripeClientModule, 'getStripeClient').mockReturnValue({
      invoicePayments: { list },
    } as never)

    await expect(listAllStripeInvoicePaymentsForPaymentIntent('pi_empty')).rejects.toThrow(
      'Stripe returned an empty invoice payment page for payment intent pi_empty',
    )

    list.mockClear()
    list.mockImplementation(async () => ({
      data: [{ id: `inpay_${list.mock.calls.length}` }],
      has_more: true,
    }))
    await expect(listAllStripeInvoicePaymentsForPaymentIntent('pi_unbounded')).rejects.toThrow(
      'Stripe payment intent pi_unbounded exceeded the invoice payment page limit',
    )
    expect(list).toHaveBeenCalledTimes(10)
  })
})
