import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as stripeClientModule from '@modules/stripe/client'
import {
  getCompleteStripeInvoicePayments,
  getStripeInvoice,
  listAllStripeSubscriptionInvoices,
  listStripeSubscriptionInvoices,
} from './invoices.mts'
import { listAllStripeInvoicePayments } from './invoice-payments.mts'

describe('stripe invoices module', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('retrieves invoices by ID', async () => {
    const retrieve = vi.fn<VitestLooseMock>().mockResolvedValue({ id: 'in_123' })
    vi.spyOn(stripeClientModule, 'getStripeClient').mockReturnValue({
      invoices: { retrieve },
    } as never)

    await expect(getStripeInvoice('in_123')).resolves.toEqual({ id: 'in_123' })
    expect(retrieve).toHaveBeenCalledWith('in_123', { expand: ['payments'] })
  })

  it('lists invoices for a subscription with default limit', async () => {
    const list = vi.fn<VitestLooseMock>().mockResolvedValue({ data: [] })
    vi.spyOn(stripeClientModule, 'getStripeClient').mockReturnValue({
      invoices: { list },
    } as never)

    await expect(listStripeSubscriptionInvoices('sub_123')).resolves.toEqual({ data: [] })
    expect(list).toHaveBeenCalledWith({
      subscription: 'sub_123',
      limit: 10,
      expand: ['data.payments'],
    })
  })

  it('lists and hydrates every invoice page for a subscription', async () => {
    const list = vi
      .fn<VitestLooseMock>()
      .mockResolvedValueOnce({
        data: [{ id: 'in_newest', status: 'open' }],
        has_more: true,
      })
      .mockResolvedValueOnce({
        data: [{ id: 'in_oldest', status: 'open' }],
        has_more: false,
      })
    vi.spyOn(stripeClientModule, 'getStripeClient').mockReturnValue({
      invoicePayments: {
        list: vi.fn<VitestLooseMock>().mockResolvedValue({ data: [], has_more: false }),
      },
      invoices: {
        list,
        listLineItems: vi.fn<VitestLooseMock>().mockResolvedValue({ data: [], has_more: false }),
      },
    } as never)

    await expect(listAllStripeSubscriptionInvoices('sub_123')).resolves.toEqual([
      { id: 'in_newest', status: 'open', lines: { data: [] }, payments: { data: [] } },
      { id: 'in_oldest', status: 'open', lines: { data: [] }, payments: { data: [] } },
    ])
    expect(list).toHaveBeenNthCalledWith(1, {
      subscription: 'sub_123',
      limit: 100,
      expand: ['data.payments'],
    })
    expect(list).toHaveBeenNthCalledWith(2, {
      subscription: 'sub_123',
      limit: 100,
      starting_after: 'in_newest',
      expand: ['data.payments'],
    })
  })

  it('hydrates every paid invoice payment page', async () => {
    const list = vi.fn<VitestLooseMock>().mockResolvedValue({
      data: [{ id: 'in_paid', status: 'paid' }],
      has_more: false,
    })
    const paymentList = vi
      .fn<VitestLooseMock>()
      .mockResolvedValueOnce({
        data: [{ id: 'inpay_first', amount_paid: 300 }],
        has_more: true,
      })
      .mockResolvedValueOnce({
        data: [{ id: 'inpay_second', amount_paid: 200 }],
        has_more: false,
      })
    vi.spyOn(stripeClientModule, 'getStripeClient').mockReturnValue({
      invoicePayments: { list: paymentList },
      invoices: {
        list,
        listLineItems: vi.fn<VitestLooseMock>().mockResolvedValue({ data: [], has_more: false }),
      },
    } as never)

    await expect(listAllStripeSubscriptionInvoices('sub_123')).resolves.toEqual([
      {
        id: 'in_paid',
        status: 'paid',
        lines: { data: [] },
        payments: {
          data: [
            { id: 'inpay_first', amount_paid: 300 },
            { id: 'inpay_second', amount_paid: 200 },
          ],
        },
      },
    ])
    expect(paymentList).toHaveBeenNthCalledWith(1, {
      invoice: 'in_paid',
      status: 'paid',
      limit: 100,
    })
    expect(paymentList).toHaveBeenNthCalledWith(2, {
      invoice: 'in_paid',
      status: 'paid',
      limit: 100,
      starting_after: 'inpay_first',
    })
  })

  it('hydrates every paid invoice line page', async () => {
    const list = vi.fn<VitestLooseMock>().mockResolvedValue({
      data: [{ id: 'in_paid_lines', status: 'paid' }],
      has_more: false,
    })
    const listLineItems = vi
      .fn<VitestLooseMock>()
      .mockResolvedValueOnce({
        data: [{ id: 'il_first', amount: 300 }],
        has_more: true,
      })
      .mockResolvedValueOnce({
        data: [{ id: 'il_second', amount: 200 }],
        has_more: false,
      })
    vi.spyOn(stripeClientModule, 'getStripeClient').mockReturnValue({
      invoices: { list, listLineItems },
      invoicePayments: {
        list: vi.fn<VitestLooseMock>().mockResolvedValue({ data: [], has_more: false }),
      },
    } as never)

    await expect(listAllStripeSubscriptionInvoices('sub_123')).resolves.toEqual([
      {
        id: 'in_paid_lines',
        status: 'paid',
        payments: { data: [] },
        lines: {
          data: [
            { id: 'il_first', amount: 300 },
            { id: 'il_second', amount: 200 },
          ],
        },
      },
    ])
    expect(listLineItems).toHaveBeenNthCalledWith(1, 'in_paid_lines', { limit: 100 })
    expect(listLineItems).toHaveBeenNthCalledWith(2, 'in_paid_lines', {
      limit: 100,
      starting_after: 'il_first',
    })
  })

  it('hydrates paid payments and qualifying lines for an open invoice', async () => {
    const list = vi.fn<VitestLooseMock>().mockResolvedValue({
      data: [{ id: 'in_open', status: 'open' }],
      has_more: false,
    })
    const listLineItems = vi.fn<VitestLooseMock>().mockResolvedValue({
      data: [
        {
          amount: 300,
          currency: 'usd',
          id: 'il_qualifying',
          pricing: { price_details: { price: 'price_qualifying' } },
        },
      ],
      has_more: false,
    })
    const paymentList = vi.fn<VitestLooseMock>().mockResolvedValue({
      data: [{ amount_paid: 300, id: 'inpay_open_paid', status: 'paid' }],
      has_more: false,
    })
    vi.spyOn(stripeClientModule, 'getStripeClient').mockReturnValue({
      invoices: { list, listLineItems },
      invoicePayments: { list: paymentList },
    } as never)

    await expect(listAllStripeSubscriptionInvoices('sub_123')).resolves.toEqual([
      {
        id: 'in_open',
        status: 'open',
        lines: {
          data: [
            {
              amount: 300,
              currency: 'usd',
              id: 'il_qualifying',
              pricing: { price_details: { price: 'price_qualifying' } },
            },
          ],
        },
        payments: { data: [{ amount_paid: 300, id: 'inpay_open_paid', status: 'paid' }] },
      },
    ])
    expect(listLineItems).toHaveBeenCalledWith('in_open', { limit: 100 })
    expect(paymentList).toHaveBeenCalledWith({ invoice: 'in_open', limit: 100, status: 'paid' })
  })

  it('rejects an unbounded subscription invoice result', async () => {
    const list = vi.fn<VitestLooseMock>().mockImplementation(async () => ({
      data: [{ id: `in_${list.mock.calls.length}`, status: 'open' }],
      has_more: true,
    }))
    vi.spyOn(stripeClientModule, 'getStripeClient').mockReturnValue({
      invoices: { list },
    } as never)

    await expect(listAllStripeSubscriptionInvoices('sub_unbounded')).rejects.toThrow(
      'Stripe subscription sub_unbounded exceeded the invoice page limit',
    )
    expect(list).toHaveBeenCalledTimes(10)
  })

  it('rejects an unbounded invoice payment result', async () => {
    const list = vi.fn<VitestLooseMock>().mockImplementation(async () => ({
      data: [{ id: `inpay_${list.mock.calls.length}` }],
      has_more: true,
    }))
    vi.spyOn(stripeClientModule, 'getStripeClient').mockReturnValue({
      invoicePayments: { list },
    } as never)

    await expect(listAllStripeInvoicePayments('in_unbounded')).rejects.toThrow(
      'Stripe invoice in_unbounded exceeded the payment page limit',
    )
    expect(list).toHaveBeenCalledTimes(10)
  })

  it('rejects a continued empty invoice payment page', async () => {
    const list = vi.fn<VitestLooseMock>().mockResolvedValue({ data: [], has_more: true })
    vi.spyOn(stripeClientModule, 'getStripeClient').mockReturnValue({
      invoicePayments: { list },
    } as never)

    await expect(listAllStripeInvoicePayments('in_empty')).rejects.toThrow(
      'Stripe returned an empty invoice payment page for invoice in_empty',
    )
    expect(list).toHaveBeenCalledOnce()
  })

  it('rejects a continued empty subscription invoice page', async () => {
    const list = vi.fn<VitestLooseMock>().mockResolvedValue({ data: [], has_more: true })
    vi.spyOn(stripeClientModule, 'getStripeClient').mockReturnValue({
      invoices: { list },
    } as never)

    await expect(listAllStripeSubscriptionInvoices('sub_empty')).rejects.toThrow(
      'Stripe returned an empty invoice page for subscription sub_empty',
    )
    expect(list).toHaveBeenCalledOnce()
  })

  it('uses only paid expanded payments from an open invoice without another Stripe request', async () => {
    const list = vi.fn<VitestLooseMock>()
    vi.spyOn(stripeClientModule, 'getStripeClient').mockReturnValue({
      invoicePayments: { list },
    } as never)

    await expect(
      getCompleteStripeInvoicePayments({
        id: 'in_open',
        status: 'open',
        payments: {
          data: [
            { id: 'inpay_paid', status: 'paid' },
            { id: 'inpay_open', status: 'open' },
          ],
          has_more: false,
        },
      } as never),
    ).resolves.toEqual([{ id: 'inpay_paid', status: 'paid' }])
    expect(list).not.toHaveBeenCalled()
  })
})
