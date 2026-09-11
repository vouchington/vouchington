import { afterEach, describe, expect, it, vi } from 'vitest'
import * as stripeClientModule from '@modules/stripe/client'
import { getCompleteStripeInvoicePayments } from './invoices.mts'

describe('open Stripe invoice payment hydration', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('lists paid payments when an open invoice has incomplete expanded payment data', async () => {
    const list = vi.fn<VitestLooseMock>().mockResolvedValue({
      data: [{ id: 'inpay_paid', status: 'paid' }],
      has_more: false,
    })
    vi.spyOn(stripeClientModule, 'getStripeClient').mockReturnValue({
      invoicePayments: { list },
    } as never)

    await expect(
      getCompleteStripeInvoicePayments({
        id: 'in_open_incomplete_payments',
        payments: { data: [{ id: 'inpay_open', status: 'open' }], has_more: true },
        status: 'open',
      } as never),
    ).resolves.toEqual([{ id: 'inpay_paid', status: 'paid' }])
    expect(list).toHaveBeenCalledWith({
      invoice: 'in_open_incomplete_payments',
      limit: 100,
      status: 'paid',
    })
  })
})
